-- Minimal Supabase-shaped harness: just enough of the real schema for the
-- live-quiz migration to run and be exercised under genuine RLS.
-- Column names and helper semantics are copied from the repo's migrations.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Roles (Supabase's) ─────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- ── auth.uid() ─────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

-- ── Canonical tables the migration depends on ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.tuition_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  full_name text NOT NULL,
  avatar_url text
);

CREATE TABLE IF NOT EXISTS public.classes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.tuition_centers(id) ON DELETE CASCADE,
  title text NOT NULL
);

CREATE TABLE IF NOT EXISTS public.class_tutors (
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  tutor_user_id uuid NOT NULL,
  PRIMARY KEY (class_id, tutor_user_id)
);

CREATE TABLE IF NOT EXISTS public.class_enrollments (
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active',
  PRIMARY KEY (class_id, student_user_id)
);

CREATE TABLE IF NOT EXISTS public.user_roles (
  user_id uuid NOT NULL,
  role text NOT NULL,
  center_id uuid,
  PRIMARY KEY (user_id, role)
);

CREATE TABLE IF NOT EXISTS public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  center_id uuid NOT NULL REFERENCES public.tuition_centers(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  total_points integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question text NOT NULL,
  question_type text NOT NULL DEFAULT 'mcq',
  points integer NOT NULL DEFAULT 1,
  explanation text,
  order_index integer,
  sort_order integer,
  center_id uuid
);

CREATE TABLE IF NOT EXISTS public.quiz_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  center_id uuid,
  option_text text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  order_index integer
);

-- ── Helper functions (semantics copied from the repo) ──────────────────────
CREATE OR REPLACE FUNCTION public.has_role(_user uuid, _role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user AND role=_role)
$$;

CREATE OR REPLACE FUNCTION public._admin_can_manage_center(_center uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles r
     WHERE r.user_id = auth.uid()
       AND r.role IN ('admin','superadmin')
       AND (r.center_id IS NULL OR r.center_id = _center)
  )
$$;

CREATE OR REPLACE FUNCTION public.is_tutor_of_class(_class_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_tutors t
     WHERE t.class_id = _class_id AND t.tutor_user_id = auth.uid()
  )
$$;

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
  SELECT EXISTS (
    SELECT 1 FROM public.class_enrollments ce
     WHERE ce.class_id = _class_id
       AND ce.student_user_id = auth.uid()
       AND ce.status = 'active'
  )
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_class(uuid), public.is_enrolled_in_class(uuid),
  public.is_tutor_of_class(uuid), public._admin_can_manage_center(uuid), public.has_role(uuid,text)
  TO anon, authenticated;

-- Supabase creates this publication; the migration adds a table to it.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;
