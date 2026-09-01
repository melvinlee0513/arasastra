-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 4 — Question Bank.
--
-- A centre-scoped library of reusable questions. Additive: three new tables and
-- one new column on quiz_questions. Nothing existing is dropped or altered
-- destructively, and no existing policy is touched.
--
-- THE CENTRAL DESIGN RULE
--
-- Adding a bank question to a quiz COPIES it. A published quiz never renders
-- the live bank row, because a tutor tidying up a question next term must not
-- silently rewrite the quiz a class already sat. `quiz_questions.source_bank_
-- question_id` records where the copy came from, which is what makes "Used in"
-- and "Used N times" real rather than a stored counter someone has to remember
-- to increment.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Collections ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.question_bank_collections (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id   uuid NOT NULL REFERENCES public.tuition_centers(id) ON DELETE CASCADE,
  -- Optional link to canonical curriculum data. Subjects are never invented
  -- from a mockup; a collection may simply be named.
  subject_id  uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  name        text NOT NULL,
  description text,
  created_by  uuid,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT question_bank_collections_name_ck CHECK (length(TRIM(name)) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS qb_collections_center_idx
  ON public.question_bank_collections (center_id, archived_at);

-- ─── Questions ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.question_bank_questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id     uuid NOT NULL REFERENCES public.tuition_centers(id) ON DELETE CASCADE,
  collection_id uuid REFERENCES public.question_bank_collections(id) ON DELETE SET NULL,
  subject_id    uuid REFERENCES public.subjects(id) ON DELETE SET NULL,

  question      text NOT NULL,
  question_type text NOT NULL DEFAULT 'mcq',
  points        integer NOT NULL DEFAULT 1,
  explanation   text,
  -- Free-text chapter/topic. Only ever what a tutor typed — nothing infers it.
  topic         text,

  created_by    uuid,
  -- Archived rather than deleted once a question has history. The copies
  -- already inside quizzes are unaffected either way.
  archived_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT qb_questions_text_ck CHECK (length(TRIM(question)) BETWEEN 1 AND 2000),
  CONSTRAINT qb_questions_points_ck CHECK (points BETWEEN 0 AND 1000)
);

CREATE INDEX IF NOT EXISTS qb_questions_center_idx
  ON public.question_bank_questions (center_id, archived_at, updated_at DESC);
CREATE INDEX IF NOT EXISTS qb_questions_collection_idx
  ON public.question_bank_questions (collection_id, archived_at);
-- Backs the text search below without a trigram extension dependency.
CREATE INDEX IF NOT EXISTS qb_questions_search_idx
  ON public.question_bank_questions USING gin (to_tsvector('simple', question));

-- ─── Options ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.question_bank_options (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id  uuid NOT NULL REFERENCES public.question_bank_questions(id) ON DELETE CASCADE,
  center_id    uuid NOT NULL REFERENCES public.tuition_centers(id) ON DELETE CASCADE,
  option_text  text NOT NULL,
  is_correct   boolean NOT NULL DEFAULT false,
  order_index  integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qb_options_question_idx
  ON public.question_bank_options (question_id, order_index);

-- ─── Provenance on the copy ────────────────────────────────────────────────
ALTER TABLE public.quiz_questions
  ADD COLUMN IF NOT EXISTS source_bank_question_id uuid;

DO $$
BEGIN
  ALTER TABLE public.quiz_questions
    ADD CONSTRAINT quiz_questions_source_bank_fk
    FOREIGN KEY (source_bank_question_id)
    REFERENCES public.question_bank_questions(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS quiz_questions_source_bank_idx
  ON public.quiz_questions (source_bank_question_id)
  WHERE source_bank_question_id IS NOT NULL;

COMMENT ON COLUMN public.quiz_questions.source_bank_question_id IS
  'Provenance only. The quiz question is an independent COPY — editing the bank '
  'row must never change a quiz a class has already sat. Usage counts are '
  'derived by counting rows here, not by incrementing a column on the bank.';

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — centre-scoped, staff-only. Students have no policy at all, so RLS
-- denies them by default; there is no student-facing bank surface to hide.
-- ═══════════════════════════════════════════════════════════════════════════
ALTER TABLE public.question_bank_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank_questions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bank_options     ENABLE ROW LEVEL SECURITY;

/**
 * May the caller use this centre's question bank?
 *
 * True for an admin of the centre, and for a tutor who teaches at least one
 * class in it. Deliberately simple for V1: the bank is a shared centre
 * resource, not a per-tutor library with a sharing model.
 */
CREATE OR REPLACE FUNCTION public._can_use_question_bank(_center_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT _center_id IS NOT NULL AND (
    public._admin_can_manage_center(_center_id)
    OR EXISTS (
      SELECT 1
        FROM public.class_tutors ct
        JOIN public.classes c ON c.id = ct.class_id
       WHERE ct.tutor_user_id = auth.uid()
         AND c.center_id = _center_id
    )
  )
$$;

DROP POLICY IF EXISTS "Question bank collections readable by centre staff"
  ON public.question_bank_collections;
CREATE POLICY "Question bank collections readable by centre staff"
  ON public.question_bank_collections FOR SELECT TO authenticated
  USING (public._can_use_question_bank(center_id));

DROP POLICY IF EXISTS "Question bank questions readable by centre staff"
  ON public.question_bank_questions;
CREATE POLICY "Question bank questions readable by centre staff"
  ON public.question_bank_questions FOR SELECT TO authenticated
  USING (public._can_use_question_bank(center_id));

-- No SELECT policy on question_bank_options: the answer key is only ever read
-- through the SECURITY DEFINER RPCs below, exactly as quiz_options now is.

-- ═══════════════════════════════════════════════════════════════════════════
-- Resolve the caller's centre.
--
-- Never taken from the client. A tutor's centre is derived from the classes
-- they teach; an admin's from their role row.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._my_question_bank_center()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT r.center_id INTO v_id
    FROM public.user_roles r
   WHERE r.user_id = auth.uid()
     AND r.role IN ('admin', 'superadmin')
     AND r.center_id IS NOT NULL
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT c.center_id INTO v_id
    FROM public.class_tutors ct
    JOIN public.classes c ON c.id = ct.class_id
   WHERE ct.tutor_user_id = auth.uid()
   LIMIT 1;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'no_question_bank_access' USING ERRCODE = '42501';
  END IF;
  RETURN v_id;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- list_question_bank — home screen: counts, collections, recent questions.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.list_question_bank()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_center uuid := public._my_question_bank_center();
BEGIN
  RETURN jsonb_build_object(
    'center_id', v_center,
    'question_count', (SELECT count(*) FROM public.question_bank_questions
                        WHERE center_id = v_center AND archived_at IS NULL),
    'collection_count', (SELECT count(*) FROM public.question_bank_collections
                          WHERE center_id = v_center AND archived_at IS NULL),
    'collections', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', c.id, 'name', c.name, 'description', c.description,
               'subject_id', c.subject_id, 'subject_name', s.name,
               'question_count', (SELECT count(*) FROM public.question_bank_questions q
                                   WHERE q.collection_id = c.id AND q.archived_at IS NULL)
             ) ORDER BY c.name)
        FROM public.question_bank_collections c
        LEFT JOIN public.subjects s ON s.id = c.subject_id
       WHERE c.center_id = v_center AND c.archived_at IS NULL
    ), '[]'::jsonb),
    'recent', COALESCE((
      SELECT jsonb_agg(r) FROM (
        SELECT jsonb_build_object(
                 'id', q.id, 'question', q.question, 'question_type', q.question_type,
                 'points', q.points, 'topic', q.topic,
                 'collection_id', q.collection_id, 'collection_name', c.name,
                 'subject_name', s.name,
                 'usage_count', (SELECT count(*) FROM public.quiz_questions qq
                                  WHERE qq.source_bank_question_id = q.id),
                 'updated_at', q.updated_at
               ) AS r
          FROM public.question_bank_questions q
          LEFT JOIN public.question_bank_collections c ON c.id = q.collection_id
          LEFT JOIN public.subjects s ON s.id = q.subject_id
         WHERE q.center_id = v_center AND q.archived_at IS NULL
         ORDER BY q.updated_at DESC
         LIMIT 5
      ) t
    ), '[]'::jsonb),
    'subjects', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name) ORDER BY s.name)
        FROM public.subjects s
       WHERE s.center_id = v_center AND COALESCE(s.status, 'active') = 'active'
    ), '[]'::jsonb)
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- search_question_bank — the one query behind every filter and sort.
--
-- Every argument genuinely narrows the result set. Nothing here is decorative.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.search_question_bank(
  _search        text    DEFAULT NULL,
  _collection_id uuid    DEFAULT NULL,
  _subject_id    uuid    DEFAULT NULL,
  _question_type text    DEFAULT NULL,
  _topic         text    DEFAULT NULL,
  _sort          text    DEFAULT 'recent',
  _include_archived boolean DEFAULT false,
  _limit         integer DEFAULT 50,
  _offset        integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_center uuid := public._my_question_bank_center();
  v_lim    int  := LEAST(GREATEST(COALESCE(_limit, 50), 1), 200);
  v_off    int  := GREATEST(COALESCE(_offset, 0), 0);
  v_term   text := NULLIF(TRIM(COALESCE(_search, '')), '');
  v_total  int;
  v_rows   jsonb;
BEGIN
  WITH base AS (
    SELECT q.*,
           (SELECT count(*) FROM public.quiz_questions qq
             WHERE qq.source_bank_question_id = q.id) AS usage_count
      FROM public.question_bank_questions q
     WHERE q.center_id = v_center
       AND (_include_archived OR q.archived_at IS NULL)
       AND (_collection_id IS NULL OR q.collection_id = _collection_id)
       AND (_subject_id    IS NULL OR q.subject_id    = _subject_id)
       AND (_question_type IS NULL OR q.question_type = _question_type)
       AND (_topic         IS NULL OR q.topic         = _topic)
       -- ILIKE on the question text, plus the topic, so a tutor can find a
       -- question by either.
       AND (v_term IS NULL
            OR q.question ILIKE '%' || v_term || '%'
            OR COALESCE(q.topic, '') ILIKE '%' || v_term || '%')
  )
  SELECT count(*)::int,
         COALESCE(jsonb_agg(x ORDER BY x.ord_key) FILTER (WHERE x.rn > v_off AND x.rn <= v_off + v_lim), '[]'::jsonb)
    INTO v_total, v_rows
    FROM (
      SELECT jsonb_build_object(
               'id', b.id, 'question', b.question, 'question_type', b.question_type,
               'points', b.points, 'topic', b.topic, 'explanation', b.explanation,
               'collection_id', b.collection_id, 'subject_id', b.subject_id,
               'usage_count', b.usage_count,
               'archived', (b.archived_at IS NOT NULL),
               'updated_at', b.updated_at, 'created_at', b.created_at,
               'option_count', (SELECT count(*) FROM public.question_bank_options o
                                 WHERE o.question_id = b.id)
             ) AS x,
             ROW_NUMBER() OVER (ORDER BY
               CASE WHEN _sort = 'oldest'    THEN b.created_at END ASC,
               CASE WHEN _sort = 'az'        THEN lower(b.question) END ASC,
               CASE WHEN _sort = 'most_used' THEN b.usage_count END DESC,
               CASE WHEN _sort = 'newest'    THEN b.created_at END DESC,
               b.updated_at DESC
             ) AS rn,
             ROW_NUMBER() OVER (ORDER BY
               CASE WHEN _sort = 'oldest'    THEN b.created_at END ASC,
               CASE WHEN _sort = 'az'        THEN lower(b.question) END ASC,
               CASE WHEN _sort = 'most_used' THEN b.usage_count END DESC,
               CASE WHEN _sort = 'newest'    THEN b.created_at END DESC,
               b.updated_at DESC
             ) AS ord_key
        FROM base b
    ) x;

  RETURN jsonb_build_object(
    'total', v_total, 'limit', v_lim, 'offset', v_off,
    'questions', v_rows,
    -- Distinct topics within the current collection, for the chip row.
    'topics', COALESCE((
      SELECT jsonb_agg(DISTINCT t ORDER BY t)
        FROM public.question_bank_questions q,
             LATERAL (SELECT NULLIF(TRIM(q.topic), '') AS t) z
       WHERE q.center_id = v_center
         AND q.archived_at IS NULL
         AND (_collection_id IS NULL OR q.collection_id = _collection_id)
         AND z.t IS NOT NULL
    ), '[]'::jsonb)
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- get_question_bank_question — full detail, including "Used in".
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_question_bank_question(_question_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_center uuid := public._my_question_bank_center();
  v_q      public.question_bank_questions%ROWTYPE;
BEGIN
  SELECT * INTO v_q FROM public.question_bank_questions
   WHERE id = _question_id AND center_id = v_center;
  IF v_q.id IS NULL THEN
    -- Same message for "no such question" and "another centre's question", so
    -- the id space cannot be probed.
    RAISE EXCEPTION 'question_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN jsonb_build_object(
    'id', v_q.id, 'question', v_q.question, 'question_type', v_q.question_type,
    'points', v_q.points, 'explanation', v_q.explanation, 'topic', v_q.topic,
    'collection_id', v_q.collection_id, 'subject_id', v_q.subject_id,
    'archived', (v_q.archived_at IS NOT NULL),
    'created_at', v_q.created_at, 'updated_at', v_q.updated_at,
    'collection_name', (SELECT name FROM public.question_bank_collections
                         WHERE id = v_q.collection_id),
    'subject_name', (SELECT name FROM public.subjects WHERE id = v_q.subject_id),
    'options', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
               'id', o.id, 'option_text', o.option_text,
               'is_correct', o.is_correct, 'order_index', o.order_index
             ) ORDER BY o.order_index, o.id)
        FROM public.question_bank_options o WHERE o.question_id = v_q.id
    ), '[]'::jsonb),
    -- Derived from the copies, so it can never be stale.
    'usage_count', (SELECT count(*) FROM public.quiz_questions qq
                     WHERE qq.source_bank_question_id = v_q.id),
    'used_in', COALESCE((
      SELECT jsonb_agg(u ORDER BY u->>'title') FROM (
        SELECT DISTINCT jsonb_build_object(
                 'quiz_id', z.id, 'title', z.title, 'status', z.status,
                 'class_id', z.class_id,
                 'question_count', (SELECT count(*) FROM public.quiz_questions x
                                     WHERE x.quiz_id = z.id)
               ) AS u
          FROM public.quiz_questions qq
          JOIN public.quizzes z ON z.id = qq.quiz_id
         WHERE qq.source_bank_question_id = v_q.id
           AND z.center_id = v_center
      ) t
    ), '[]'::jsonb)
  );
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- save_question_bank_question — create or update, with its options.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.save_question_bank_question(
  _question_id   uuid,
  _question      text,
  _question_type text,
  _points        integer,
  _explanation   text,
  _topic         text,
  _collection_id uuid,
  _subject_id    uuid,
  _options       jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_center uuid := public._my_question_bank_center();
  v_id     uuid;
  v_o      jsonb;
  v_i      int;
BEGIN
  IF length(TRIM(COALESCE(_question, ''))) = 0 THEN
    RAISE EXCEPTION 'question_text_required' USING ERRCODE = '22023';
  END IF;

  -- A collection or subject supplied by the client must belong to this centre.
  IF _collection_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.question_bank_collections
       WHERE id = _collection_id AND center_id = v_center) THEN
    RAISE EXCEPTION 'collection_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF _subject_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.subjects WHERE id = _subject_id AND center_id = v_center) THEN
    RAISE EXCEPTION 'subject_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF _question_id IS NULL THEN
    INSERT INTO public.question_bank_questions
      (center_id, collection_id, subject_id, question, question_type, points,
       explanation, topic, created_by)
    VALUES
      (v_center, _collection_id, _subject_id, TRIM(_question),
       COALESCE(NULLIF(_question_type, ''), 'mcq'),
       LEAST(GREATEST(COALESCE(_points, 1), 0), 1000),
       NULLIF(TRIM(COALESCE(_explanation, '')), ''),
       NULLIF(TRIM(COALESCE(_topic, '')), ''),
       auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.question_bank_questions
       SET question = TRIM(_question),
           question_type = COALESCE(NULLIF(_question_type, ''), 'mcq'),
           points = LEAST(GREATEST(COALESCE(_points, 1), 0), 1000),
           explanation = NULLIF(TRIM(COALESCE(_explanation, '')), ''),
           topic = NULLIF(TRIM(COALESCE(_topic, '')), ''),
           collection_id = _collection_id,
           subject_id = _subject_id,
           updated_at = now()
     WHERE id = _question_id AND center_id = v_center
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'question_not_found' USING ERRCODE = 'P0002';
    END IF;
    DELETE FROM public.question_bank_options WHERE question_id = v_id;
  END IF;

  IF _options IS NOT NULL AND jsonb_typeof(_options) = 'array' THEN
    FOR v_i IN 0 .. jsonb_array_length(_options) - 1 LOOP
      v_o := _options -> v_i;
      IF length(TRIM(COALESCE(v_o->>'option_text', ''))) = 0 THEN CONTINUE; END IF;
      INSERT INTO public.question_bank_options
        (question_id, center_id, option_text, is_correct, order_index)
      VALUES
        (v_id, v_center, TRIM(v_o->>'option_text'),
         COALESCE((v_o->>'is_correct')::boolean, false), v_i);
    END LOOP;
  END IF;

  RETURN jsonb_build_object('id', v_id);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- duplicate_question_bank_questions — copy within the bank.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.duplicate_question_bank_questions(_question_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_center uuid := public._my_question_bank_center();
  v_src    uuid;
  v_new    uuid;
  v_ids    uuid[] := '{}';
BEGIN
  IF _question_ids IS NULL OR array_length(_question_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_questions_selected' USING ERRCODE = '22023';
  END IF;

  FOREACH v_src IN ARRAY _question_ids LOOP
    INSERT INTO public.question_bank_questions
      (center_id, collection_id, subject_id, question, question_type, points,
       explanation, topic, created_by)
    SELECT q.center_id, q.collection_id, q.subject_id,
           left(q.question || ' (copy)', 2000),
           q.question_type, q.points, q.explanation, q.topic, auth.uid()
      FROM public.question_bank_questions q
     WHERE q.id = v_src AND q.center_id = v_center
    RETURNING id INTO v_new;

    IF v_new IS NOT NULL THEN
      INSERT INTO public.question_bank_options
        (question_id, center_id, option_text, is_correct, order_index)
      SELECT v_new, v_center, o.option_text, o.is_correct, o.order_index
        FROM public.question_bank_options o WHERE o.question_id = v_src;
      v_ids := v_ids || v_new;
      v_new := NULL;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('created', COALESCE(array_length(v_ids, 1), 0), 'ids', to_jsonb(v_ids));
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- archive_question_bank_question — reversible, and never breaks a quiz.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.archive_question_bank_question(
  _question_id uuid, _archived boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_center uuid := public._my_question_bank_center();
  v_id uuid;
BEGIN
  UPDATE public.question_bank_questions
     SET archived_at = CASE WHEN _archived THEN now() ELSE NULL END,
         updated_at = now()
   WHERE id = _question_id AND center_id = v_center
   RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'question_not_found' USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('id', v_id, 'archived', _archived);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- save_question_bank_collection
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.save_question_bank_collection(
  _collection_id uuid, _name text, _description text, _subject_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_center uuid := public._my_question_bank_center();
  v_id uuid;
BEGIN
  IF length(TRIM(COALESCE(_name, ''))) = 0 THEN
    RAISE EXCEPTION 'collection_name_required' USING ERRCODE = '22023';
  END IF;
  IF _subject_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.subjects WHERE id = _subject_id AND center_id = v_center) THEN
    RAISE EXCEPTION 'subject_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF _collection_id IS NULL THEN
    INSERT INTO public.question_bank_collections
      (center_id, name, description, subject_id, created_by)
    VALUES (v_center, TRIM(_name), NULLIF(TRIM(COALESCE(_description, '')), ''),
            _subject_id, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.question_bank_collections
       SET name = TRIM(_name),
           description = NULLIF(TRIM(COALESCE(_description, '')), ''),
           subject_id = _subject_id, updated_at = now()
     WHERE id = _collection_id AND center_id = v_center
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'collection_not_found' USING ERRCODE = 'P0002';
    END IF;
  END IF;
  RETURN jsonb_build_object('id', v_id);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- add_question_bank_questions_to_quiz — THE SNAPSHOT.
--
-- Copies each bank question into the quiz. The copy is independent from the
-- moment it lands: later edits to the bank row do not touch it.
--
-- Idempotent per (quiz, bank question): a double tap on "Add 6 questions"
-- inserts nothing the second time, and reports how many were skipped.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.add_question_bank_questions_to_quiz(
  _quiz_id uuid, _question_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_center uuid := public._my_question_bank_center();
  v_quiz   public.quizzes%ROWTYPE;
  v_src    uuid;
  v_new    uuid;
  v_added  int := 0;
  v_skipped int := 0;
  v_next   int;
BEGIN
  IF _question_ids IS NULL OR array_length(_question_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'no_questions_selected' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_quiz FROM public.quizzes WHERE id = _quiz_id;
  IF v_quiz.id IS NULL THEN
    RAISE EXCEPTION 'quiz_not_found' USING ERRCODE = 'P0002';
  END IF;
  -- Host authority is derived, and the quiz must be in the caller's centre.
  IF v_quiz.class_id IS NULL OR NOT public.can_manage_class(v_quiz.class_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;
  IF v_quiz.center_id <> v_center THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(max(COALESCE(order_index, sort_order, 0)) + 1, 0)
    INTO v_next FROM public.quiz_questions WHERE quiz_id = _quiz_id;

  FOREACH v_src IN ARRAY _question_ids LOOP
    -- Already copied into this quiz? Then this is a repeat of the same tap.
    IF EXISTS (SELECT 1 FROM public.quiz_questions
                WHERE quiz_id = _quiz_id AND source_bank_question_id = v_src) THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.quiz_questions
      (quiz_id, question, question_type, points, explanation,
       order_index, sort_order, center_id, source_bank_question_id)
    SELECT _quiz_id, q.question, q.question_type, q.points, q.explanation,
           v_next, v_next, v_quiz.center_id, q.id
      FROM public.question_bank_questions q
     WHERE q.id = v_src AND q.center_id = v_center AND q.archived_at IS NULL
    RETURNING id INTO v_new;

    IF v_new IS NULL THEN
      -- Archived, missing, or another centre's: skipped, never a partial copy.
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    INSERT INTO public.quiz_options
      (question_id, center_id, option_text, is_correct, order_index)
    SELECT v_new, v_quiz.center_id, o.option_text, o.is_correct, o.order_index
      FROM public.question_bank_options o WHERE o.question_id = v_src;

    v_added := v_added + 1;
    v_next  := v_next + 1;
    v_new   := NULL;
  END LOOP;

  -- Keep the quiz's own totals honest.
  UPDATE public.quizzes
     SET total_points = COALESCE(
           (SELECT sum(COALESCE(points, 1)) FROM public.quiz_questions WHERE quiz_id = _quiz_id), 0),
         updated_at = now()
   WHERE id = _quiz_id;

  RETURN jsonb_build_object('added', v_added, 'skipped', v_skipped, 'quiz_id', _quiz_id);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- list_quizzes_for_question_bank — the "choose a quiz" picker.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.list_quizzes_for_question_bank()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_center uuid := public._my_question_bank_center();
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY x->>'updated_at' DESC) FROM (
      SELECT jsonb_build_object(
               'id', z.id, 'title', z.title, 'status', z.status,
               'class_id', z.class_id, 'class_title', c.title,
               'subject_name', s.name,
               'question_count', (SELECT count(*) FROM public.quiz_questions qq
                                   WHERE qq.quiz_id = z.id),
               'updated_at', z.updated_at
             ) AS x
        FROM public.quizzes z
        JOIN public.classes c ON c.id = z.class_id
        LEFT JOIN public.subjects s ON s.id = z.subject_id
       WHERE z.center_id = v_center
         AND z.status <> 'archived'
         AND public.can_manage_class(z.class_id)
       ORDER BY z.updated_at DESC
       LIMIT 50
    ) t
  ), '[]'::jsonb);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Grants — authenticated only, PUBLIC revoked first.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.list_question_bank()',
    'public.search_question_bank(text, uuid, uuid, text, text, text, boolean, integer, integer)',
    'public.get_question_bank_question(uuid)',
    'public.save_question_bank_question(uuid, text, text, integer, text, text, uuid, uuid, jsonb)',
    'public.duplicate_question_bank_questions(uuid[])',
    'public.archive_question_bank_question(uuid, boolean)',
    'public.save_question_bank_collection(uuid, text, text, uuid)',
    'public.add_question_bank_questions_to_quiz(uuid, uuid[])',
    'public.list_quizzes_for_question_bank()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;

  EXECUTE 'REVOKE ALL ON FUNCTION public._my_question_bank_center() FROM PUBLIC';
  EXECUTE 'GRANT EXECUTE ON FUNCTION public._can_use_question_bank(uuid) TO authenticated';
END $$;

-- Clients read collections and question rows through RLS (for realtime-free
-- listing); they never write these tables, and never read the answer key off
-- question_bank_options.
GRANT SELECT ON public.question_bank_collections TO authenticated;
GRANT SELECT ON public.question_bank_questions   TO authenticated;