-- Supabase-shaped harness for the Phase 3–5 quiz work. Extends the live-quiz
-- fixture's shape with the tables analytics reads and the question bank writes.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

CREATE TABLE IF NOT EXISTS public.tuition_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, subdomain_slug text UNIQUE);

-- profiles.center_id is where this app records a user's centre. It is what
-- get_user_center() and _admin_can_manage_center() both read.
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE, full_name text NOT NULL,
  display_name text, avatar_url text, center_id uuid);

CREATE TABLE IF NOT EXISTS public.subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid REFERENCES public.tuition_centers(id) ON DELETE CASCADE,
  name text NOT NULL, status text NOT NULL DEFAULT 'active', is_active boolean DEFAULT true);

CREATE TABLE IF NOT EXISTS public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.tuition_centers(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  title text NOT NULL);

CREATE TABLE IF NOT EXISTS public.class_tutors (
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  tutor_user_id uuid NOT NULL, PRIMARY KEY (class_id, tutor_user_id));

CREATE TABLE IF NOT EXISTS public.class_enrollments (
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL, status text NOT NULL DEFAULT 'active',
  PRIMARY KEY (class_id, student_user_id));

-- NO center_id. Production's user_roles is (id, user_id, role, created_at) and
-- nothing else — confirmed against src/integrations/supabase/types.ts, which is
-- generated from the live database. An earlier version of this fixture invented
-- a center_id column here, which is why _my_question_bank_center passed every
-- test while being unable to run at all in production.
CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid NOT NULL, role text NOT NULL,
  PRIMARY KEY (user_id, role));

CREATE TABLE IF NOT EXISTS public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  center_id uuid NOT NULL REFERENCES public.tuition_centers(id) ON DELETE CASCADE,
  subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  title text NOT NULL, status text NOT NULL DEFAULT 'draft',
  total_points integer NOT NULL DEFAULT 0,
  definition_version integer NOT NULL DEFAULT 1,
  result_visibility text NOT NULL DEFAULT 'after_submit',
  folder_id uuid, created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question text NOT NULL, question_type text NOT NULL DEFAULT 'mcq',
  points integer NOT NULL DEFAULT 1, explanation text,
  correct_answer text, options jsonb NOT NULL DEFAULT '[]'::jsonb,
  order_index integer, sort_order integer, center_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS public.quiz_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  center_id uuid, option_text text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false, order_index integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL, center_id uuid, class_id uuid,
  status text NOT NULL DEFAULT 'in_progress',
  saved_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  progress_revision integer NOT NULL DEFAULT 0,
  current_question_index integer NOT NULL DEFAULT 0,
  score integer NOT NULL DEFAULT 0, total_points integer NOT NULL DEFAULT 0,
  max_points integer NOT NULL DEFAULT 0, percentage numeric,
  streak integer NOT NULL DEFAULT 0, power_ups_used jsonb NOT NULL DEFAULT '{}'::jsonb,
  xp_awarded boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());

CREATE TABLE IF NOT EXISTS public.quiz_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  attempt_id uuid NOT NULL UNIQUE REFERENCES public.quiz_attempts(id) ON DELETE CASCADE,
  center_id uuid, class_id uuid,
  score integer NOT NULL DEFAULT 0, total_questions integer NOT NULL DEFAULT 0,
  total_points integer, percentage numeric,
  submission_reason text NOT NULL DEFAULT 'normal', completed_at timestamptz);

CREATE TABLE IF NOT EXISTS public.student_quiz_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL,
  result_id uuid NOT NULL REFERENCES public.quiz_results(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  selected_option_id uuid REFERENCES public.quiz_options(id) ON DELETE SET NULL,
  selected_answer text, is_correct boolean NOT NULL DEFAULT false,
  points_awarded integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now());

-- ── Canonical helpers ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.has_role(_user uuid, _role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user AND role=_role) $$;

-- 20260706172344 — the canonical centre resolver. profiles.center_id.
CREATE OR REPLACE FUNCTION public.get_user_center(_user_id uuid DEFAULT auth.uid())
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE resolved_center_id uuid;
BEGIN
  SELECT center_id FROM public.profiles WHERE user_id = _user_id
   LIMIT 1 INTO resolved_center_id;
  RETURN resolved_center_id;
END $$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
                  WHERE user_id = auth.uid() AND role IN ('admin','superadmin')) $$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles
                  WHERE user_id = auth.uid() AND role = 'superadmin') $$;

-- 20260717111646, verbatim. Superadmin manages any centre; an admin manages
-- only the centre on their own profile.
CREATE OR REPLACE FUNCTION public._admin_can_manage_center(_center_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_caller_center uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;
  IF public.is_superadmin() THEN RETURN true; END IF;
  IF NOT public.is_admin() THEN RETURN false; END IF;
  SELECT center_id INTO v_caller_center FROM public.profiles
   WHERE user_id = auth.uid() LIMIT 1;
  RETURN v_caller_center IS NOT NULL AND v_caller_center = _center_id;
END $$;

CREATE OR REPLACE FUNCTION public.is_tutor_of_class(_class_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.class_tutors t
     WHERE t.class_id = _class_id AND t.tutor_user_id = auth.uid()) $$;

CREATE OR REPLACE FUNCTION public.can_manage_class(_class_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_center uuid;
BEGIN
  SELECT center_id INTO v_center FROM public.classes WHERE id = _class_id;
  IF v_center IS NULL THEN RETURN false; END IF;
  RETURN public._admin_can_manage_center(v_center) OR public.is_tutor_of_class(_class_id);
END; $$;

CREATE OR REPLACE FUNCTION public.is_enrolled_in_class(_class_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.class_enrollments ce
     WHERE ce.class_id = _class_id AND ce.student_user_id = auth.uid()
       AND ce.status = 'active') $$;

CREATE OR REPLACE FUNCTION public.same_center_as_current_user(_center uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.get_user_center() IS NOT DISTINCT FROM _center $$;

GRANT EXECUTE ON FUNCTION public.can_manage_class(uuid), public.is_enrolled_in_class(uuid),
  public.is_tutor_of_class(uuid), public._admin_can_manage_center(uuid),
  public.has_role(uuid,text), public.same_center_as_current_user(uuid),
  public.get_user_center(uuid), public.is_admin(), public.is_superadmin()
  TO anon, authenticated;

-- Production grants: authenticated gets DML on public tables, RLS decides rows.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quizzes, public.quiz_questions,
  public.quiz_options, public.quiz_attempts, public.quiz_results,
  public.student_quiz_answers, public.subjects, public.classes TO authenticated;

-- ── Attempt-lifecycle dependencies (copied from the repo's migrations) ─────
-- The Phase 5 grader calls these. They live in earlier migrations this harness
-- does not load, so the fixture reproduces them verbatim rather than stubbing
-- weaker versions that would make a grading assertion pass for the wrong reason.
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS instructions text,
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS available_from timestamptz,
  ADD COLUMN IF NOT EXISTS time_limit_seconds integer,
  ADD COLUMN IF NOT EXISTS attempt_limit integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS shuffle_questions boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shuffle_options boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sound_theme text NOT NULL DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS results_released_at timestamptz;

ALTER TABLE public.tuition_centers
  ADD COLUMN IF NOT EXISTS feature_flags jsonb;

CREATE TABLE IF NOT EXISTS public.student_xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_user_id uuid NOT NULL,
  event_type text NOT NULL,
  source_type text,
  source_id uuid,
  xp integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 20260718080323
CREATE OR REPLACE FUNCTION public._quiz_attempt_deadline(_att public.quiz_attempts, _q public.quizzes)
RETURNS timestamptz LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN _q.due_at IS NOT NULL AND _q.time_limit_seconds IS NOT NULL
      THEN LEAST(_q.due_at, _att.started_at + make_interval(secs => _q.time_limit_seconds))
    WHEN _q.due_at IS NOT NULL THEN _q.due_at
    WHEN _q.time_limit_seconds IS NOT NULL
      THEN _att.started_at + make_interval(secs => _q.time_limit_seconds)
    ELSE NULL
  END
$$;

CREATE OR REPLACE FUNCTION public.record_learning_activity(
  _event_type text, _xp integer, _source_id uuid, _source_type text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  INSERT INTO public.student_xp_events (student_user_id, event_type, source_type, source_id, xp)
  VALUES (auth.uid(), _event_type, _source_type, _source_id, _xp)
$$;

-- 20260718074806 put a CHECK on question_type and nothing ever widened it.
-- Reproducing it is what turns "Phase 5 saves a numeric question" from a
-- statement about this fixture into a statement about production.
ALTER TABLE public.quiz_questions DROP CONSTRAINT IF EXISTS quiz_questions_type_ck;
ALTER TABLE public.quiz_questions ADD CONSTRAINT quiz_questions_type_ck
  CHECK (question_type IN ('mcq','multiple_choice','true_false'));

-- Production revokes the answer-key columns from `authenticated`. Reproducing
-- that here is what makes the Phase 5 secrecy assertions meaningful.
REVOKE SELECT ON public.quiz_questions FROM authenticated;
DO $$
DECLARE v_cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO v_cols FROM information_schema.columns
   WHERE table_schema='public' AND table_name='quiz_questions'
     AND column_name NOT IN ('correct_answer','accepted_answers','numeric_answer',
                             'numeric_tolerance','explanation');
  EXECUTE format('GRANT SELECT (%s) ON public.quiz_questions TO authenticated', v_cols);
END $$;
GRANT INSERT, UPDATE, DELETE ON public.quiz_questions TO authenticated;

-- 20260803024307 — the one feature-flag read in the database. Copied verbatim
-- so the flag assertions describe production's helper, not a stub.
CREATE OR REPLACE FUNCTION public.tenant_feature_enabled(_center_id uuid, _flag text, _default boolean DEFAULT true)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN _center_id IS NULL THEN false
    ELSE COALESCE(
      (SELECT (tc.feature_flags->>_flag)::boolean FROM public.tuition_centers tc
        WHERE tc.id = _center_id AND jsonb_typeof(tc.feature_flags->_flag) = 'boolean'),
      _default)
  END;
$$;
REVOKE ALL ON FUNCTION public.tenant_feature_enabled(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tenant_feature_enabled(uuid, text, boolean) TO authenticated, service_role;

ALTER TABLE public.tuition_centers
  ALTER COLUMN feature_flags SET DEFAULT '{}'::jsonb;
