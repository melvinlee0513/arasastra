-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 3 — Quiz analytics for tutors and admins.
--
-- Read-only and additive: no new tables, no column changes, no policy changes.
-- Everything is derived from data the quiz engine already writes —
-- quiz_attempts, quiz_results and student_quiz_answers — so nothing here can
-- drift from the grading that produced it.
--
-- All five functions are SECURITY DEFINER with a pinned search_path and gate on
-- can_manage_class(quiz.class_id). A student calling them directly is refused;
-- there is no "read your own analytics" mode, because a student's own result
-- already has its own RPCs with their own visibility rules.
--
-- Aggregation happens here, in one round trip per screen. The alternative —
-- pulling every student's answers into the browser to average them — is what
-- the connection-pool incident taught this project not to do.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Difficulty thresholds ─────────────────────────────────────────────────
-- Defined once, server-side, so the tutor UI and any future report agree on
-- what "difficult" means instead of each hard-coding a percentage.
CREATE OR REPLACE FUNCTION public.quiz_difficulty_band(_accuracy_pct numeric)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN _accuracy_pct IS NULL THEN 'unknown'
    WHEN _accuracy_pct < 50 THEN 'difficult'
    WHEN _accuracy_pct >= 80 THEN 'strong'
    ELSE 'moderate'
  END
$$;

COMMENT ON FUNCTION public.quiz_difficulty_band(numeric) IS
  'Single source of truth for the difficult/moderate/strong bands used by quiz '
  'analytics. Change the thresholds here, not in the client.';

-- ─── Shared guard ──────────────────────────────────────────────────────────
/**
 * Resolve a quiz the caller is allowed to analyse, or raise.
 *
 * Returns the quiz row. Raises access_denied for a quiz in a class the caller
 * cannot manage — including every quiz in another centre, because
 * can_manage_class is already centre-scoped.
 */
CREATE OR REPLACE FUNCTION public._quiz_for_analytics(_quiz_id uuid)
RETURNS public.quizzes
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_q public.quizzes%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_q FROM public.quizzes WHERE id = _quiz_id;
  IF v_q.id IS NULL THEN
    RAISE EXCEPTION 'quiz_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF v_q.class_id IS NULL OR NOT public.can_manage_class(v_q.class_id) THEN
    RAISE EXCEPTION 'access_denied' USING ERRCODE = '42501';
  END IF;
  RETURN v_q;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- get_quiz_analytics_overview
--
-- Headline numbers plus a score distribution. There is deliberately NO
-- "average score over time" series: a quiz has one graded result per attempt,
-- not a time series, and inventing one would be a chart that means nothing.
-- The distribution is what the data actually supports.
--
-- avg_seconds_per_question is derived from submitted_at - started_at divided by
-- the question count. student_quiz_answers carries no per-question timing, so
-- this is explicitly an average across the attempt, and the client labels it
-- that way rather than implying per-question measurement.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_quiz_analytics_overview(_quiz_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_q         public.quizzes%ROWTYPE;
  v_qcount    int;
  v_eligible  int;
  v_out       jsonb;
BEGIN
  v_q := public._quiz_for_analytics(_quiz_id);

  SELECT count(*) INTO v_qcount FROM public.quiz_questions WHERE quiz_id = _quiz_id;

  -- Denominator for "completed": students enrolled in the class, which is the
  -- only population that could have taken it.
  SELECT count(*) INTO v_eligible
    FROM public.class_enrollments ce
   WHERE ce.class_id = v_q.class_id AND ce.status = 'active';

  WITH best AS (
    -- One row per student: their most recent graded result.
    SELECT DISTINCT ON (r.user_id)
           r.user_id, r.id AS result_id, r.attempt_id, r.percentage,
           r.score, r.total_points, r.total_questions, r.completed_at
      FROM public.quiz_results r
     WHERE r.quiz_id = _quiz_id
     ORDER BY r.user_id, r.completed_at DESC NULLS LAST
  ),
  timed AS (
    SELECT b.user_id,
           EXTRACT(EPOCH FROM (a.submitted_at - a.started_at)) AS secs
      FROM best b
      JOIN public.quiz_attempts a ON a.id = b.attempt_id
     WHERE a.submitted_at IS NOT NULL AND a.started_at IS NOT NULL
       AND a.submitted_at > a.started_at
  )
  SELECT jsonb_build_object(
    'quiz_id',        v_q.id,
    'quiz_title',     v_q.title,
    'class_id',       v_q.class_id,
    'status',         v_q.status,
    'question_count', v_qcount,
    'total_points',   v_q.total_points,
    'eligible_students', v_eligible,
    'participants',   (SELECT count(*) FROM best),
    'avg_score_pct',  (SELECT round(avg(percentage))::int FROM best),
    'completion_pct', CASE WHEN v_eligible > 0
                           THEN round((SELECT count(*) FROM best)::numeric * 100 / v_eligible)::int
                           ELSE NULL END,
    -- NULL, not 0, when no attempt has usable timestamps: the client shows a
    -- dash instead of claiming every student finished instantly.
    'avg_seconds_per_question',
      (SELECT CASE WHEN v_qcount > 0 AND count(*) > 0
                   THEN round(avg(secs) / v_qcount, 1) END FROM timed),
    'avg_attempt_seconds', (SELECT round(avg(secs))::int FROM timed),
    'distribution', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('band', band, 'label', label, 'count', n)
                       ORDER BY lo)
        FROM (
          SELECT b.lo, b.band, b.label,
                 count(x.user_id) AS n
            FROM (VALUES (0,'0-39','0–39%'), (40,'40-59','40–59%'),
                         (60,'60-79','60–79%'), (80,'80-100','80–100%')
                 ) AS b(lo, band, label)
            LEFT JOIN best x
              ON x.percentage >= b.lo
             AND x.percentage < CASE b.lo WHEN 0 THEN 40 WHEN 40 THEN 60
                                          WHEN 60 THEN 80 ELSE 101 END
           GROUP BY b.lo, b.band, b.label
        ) d
    ), '[]'::jsonb),
    'last_completed_at', (SELECT max(completed_at) FROM best)
  ) INTO v_out;

  RETURN v_out;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- get_quiz_question_analytics
--
-- Per-question accuracy plus the option distribution. Correct answers ARE
-- included: the caller has already been proven to be staff for this class, and
-- a tutor cannot read the answer key off quiz_options any more (Phase 2 revoked
-- that column), so this RPC is now the canonical staff-side read.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_quiz_question_analytics(_quiz_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_q   public.quizzes%ROWTYPE;
  v_out jsonb;
BEGIN
  v_q := public._quiz_for_analytics(_quiz_id);

  WITH best AS (
    SELECT DISTINCT ON (r.user_id) r.user_id, r.id AS result_id
      FROM public.quiz_results r
     WHERE r.quiz_id = _quiz_id
     ORDER BY r.user_id, r.completed_at DESC NULLS LAST
  ),
  ans AS (
    SELECT sa.*
      FROM public.student_quiz_answers sa
      JOIN best b ON b.result_id = sa.result_id
  ),
  per_q_raw AS (
    SELECT qq.id,
           qq.question,
           qq.question_type,
           COALESCE(qq.points, 1) AS points,
           COALESCE(qq.order_index, qq.sort_order, 0) AS ord,
           count(a.id)                                  AS answered,
           count(a.id) FILTER (WHERE a.is_correct)      AS correct
      FROM public.quiz_questions qq
      LEFT JOIN ans a ON a.question_id = qq.id
     WHERE qq.quiz_id = _quiz_id
     GROUP BY qq.id, qq.question, qq.question_type, qq.points, qq.order_index, qq.sort_order
  ),
  -- The ordinal has to be numbered in its own step: a window function cannot
  -- be evaluated inside the jsonb_agg that consumes it.
  per_q AS (
    SELECT r.*, (row_number() OVER (ORDER BY r.ord, r.id))::int - 1 AS idx
      FROM per_q_raw r
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'question_id',   p.id,
      'index',         p.idx,
      'question',      p.question,
      'question_type', CASE WHEN p.question_type = 'multiple_choice'
                            THEN 'mcq' ELSE p.question_type END,
      'points',        p.points,
      'answered',      p.answered,
      'correct',       p.correct,
      'incorrect',     p.answered - p.correct,
      'accuracy_pct',  CASE WHEN p.answered > 0
                            THEN round(p.correct::numeric * 100 / p.answered)::int END,
      'band',          public.quiz_difficulty_band(
                         CASE WHEN p.answered > 0
                              THEN p.correct::numeric * 100 / p.answered END),
      'options', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
                 'option_id',   o.id,
                 'text',        o.option_text,
                 'is_correct',  o.is_correct,
                 'count',       (SELECT count(*) FROM ans a2
                                  WHERE a2.question_id = p.id
                                    AND a2.selected_option_id = o.id),
                 'pct',         CASE WHEN p.answered > 0 THEN round(
                                  (SELECT count(*) FROM ans a3
                                    WHERE a3.question_id = p.id
                                      AND a3.selected_option_id = o.id)::numeric
                                  * 100 / p.answered)::int END
               ) ORDER BY COALESCE(o.order_index, 0), o.id)
          FROM public.quiz_options o WHERE o.question_id = p.id
      ), '[]'::jsonb)
    ) ORDER BY p.ord, p.id
  ), '[]'::jsonb) INTO v_out FROM per_q p;

  RETURN jsonb_build_object(
    'quiz_id', v_q.id, 'quiz_title', v_q.title, 'questions', v_out);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- get_quiz_student_analytics — one row per student, ranked. Never one RPC each.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_quiz_student_analytics(_quiz_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_q      public.quizzes%ROWTYPE;
  v_qcount int;
  v_out    jsonb;
BEGIN
  v_q := public._quiz_for_analytics(_quiz_id);
  SELECT count(*) INTO v_qcount FROM public.quiz_questions WHERE quiz_id = _quiz_id;

  WITH best AS (
    SELECT DISTINCT ON (r.user_id)
           r.user_id, r.id AS result_id, r.attempt_id, r.percentage,
           r.score, r.total_points, r.total_questions, r.completed_at
      FROM public.quiz_results r
     WHERE r.quiz_id = _quiz_id
     ORDER BY r.user_id, r.completed_at DESC NULLS LAST
  ),
  rows AS (
    SELECT b.*,
           p.full_name, p.display_name, p.avatar_url,
           (SELECT count(*) FROM public.student_quiz_answers sa
             WHERE sa.result_id = b.result_id AND NOT sa.is_correct) AS weak_count,
           CASE WHEN a.submitted_at IS NOT NULL AND a.started_at IS NOT NULL
                     AND a.submitted_at > a.started_at AND v_qcount > 0
                THEN round(EXTRACT(EPOCH FROM (a.submitted_at - a.started_at)) / v_qcount, 1)
           END AS avg_secs,
           ROW_NUMBER() OVER (
             ORDER BY b.percentage DESC NULLS LAST, b.score DESC, b.completed_at ASC
           ) AS rank
      FROM best b
      LEFT JOIN public.profiles p ON p.user_id = b.user_id
      LEFT JOIN public.quiz_attempts a ON a.id = b.attempt_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id',      r.user_id,
    'result_id',    r.result_id,
    'display_name', COALESCE(NULLIF(TRIM(r.display_name), ''),
                             NULLIF(TRIM(r.full_name), ''), 'Student'),
    'avatar_url',   r.avatar_url,
    'score',        r.score,
    'total_questions', r.total_questions,
    'total_points', r.total_points,
    'accuracy_pct', round(r.percentage)::int,
    'rank',         r.rank,
    'avg_seconds_per_question', r.avg_secs,
    'weak_questions', r.weak_count,
    'completed_at', r.completed_at,
    'band',         public.quiz_difficulty_band(r.percentage)
  ) ORDER BY r.rank), '[]'::jsonb) INTO v_out FROM rows r;

  RETURN jsonb_build_object(
    'quiz_id', v_q.id, 'quiz_title', v_q.title,
    'question_count', v_qcount, 'students', v_out);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- get_student_quiz_report — one student, with their full question breakdown.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_student_quiz_report(_quiz_id uuid, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_q       public.quizzes%ROWTYPE;
  v_qcount  int;
  v_result  public.quiz_results%ROWTYPE;
  v_rank    int;
  v_avg     numeric;
  v_break   jsonb;
BEGIN
  v_q := public._quiz_for_analytics(_quiz_id);
  SELECT count(*) INTO v_qcount FROM public.quiz_questions WHERE quiz_id = _quiz_id;

  SELECT * INTO v_result FROM public.quiz_results
   WHERE quiz_id = _quiz_id AND user_id = _user_id
   ORDER BY completed_at DESC NULLS LAST LIMIT 1;
  IF v_result.id IS NULL THEN
    RAISE EXCEPTION 'no_result_for_student' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) + 1 INTO v_rank
    FROM (
      SELECT DISTINCT ON (r.user_id) r.user_id, r.percentage, r.score
        FROM public.quiz_results r WHERE r.quiz_id = _quiz_id
       ORDER BY r.user_id, r.completed_at DESC NULLS LAST
    ) o
   WHERE o.user_id <> _user_id
     AND (o.percentage > v_result.percentage
          OR (o.percentage = v_result.percentage AND o.score > v_result.score));

  SELECT CASE WHEN a.submitted_at IS NOT NULL AND a.started_at IS NOT NULL
                   AND a.submitted_at > a.started_at AND v_qcount > 0
              THEN round(EXTRACT(EPOCH FROM (a.submitted_at - a.started_at)) / v_qcount, 1)
         END INTO v_avg
    FROM public.quiz_attempts a WHERE a.id = v_result.attempt_id;

  -- Numbered first, aggregated second: a window function cannot be evaluated
  -- inside the jsonb_agg that consumes it.
  WITH rows AS (
    SELECT qq.id, qq.question, qq.question_type, COALESCE(qq.points, 1) AS points,
           COALESCE(qq.order_index, qq.sort_order, 0) AS ord,
           sa.id AS answer_id, sa.is_correct, sa.points_awarded,
           sa.selected_option_id, sa.selected_answer,
           (row_number() OVER (
              ORDER BY COALESCE(qq.order_index, qq.sort_order, 0), qq.id))::int - 1 AS idx
      FROM public.quiz_questions qq
      LEFT JOIN public.student_quiz_answers sa
        ON sa.question_id = qq.id AND sa.result_id = v_result.id
     WHERE qq.quiz_id = _quiz_id
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'question_id',   r.id,
    'index',         r.idx,
    'question',      r.question,
    'question_type', CASE WHEN r.question_type = 'multiple_choice' THEN 'mcq' ELSE r.question_type END,
    'points',        r.points,
    'answered',      (r.answer_id IS NOT NULL),
    'is_correct',    COALESCE(r.is_correct, false),
    'points_awarded', COALESCE(r.points_awarded, 0),
    'selected_option_id', r.selected_option_id,
    'selected_answer',    r.selected_answer
  ) ORDER BY r.idx), '[]'::jsonb)
    INTO v_break FROM rows r;

  RETURN jsonb_build_object(
    'quiz_id', v_q.id,
    'quiz_title', v_q.title,
    'class_id', v_q.class_id,
    'question_count', v_qcount,
    'student', (
      SELECT jsonb_build_object(
        'user_id', _user_id,
        'display_name', COALESCE(NULLIF(TRIM(p.display_name), ''),
                                 NULLIF(TRIM(p.full_name), ''), 'Student'),
        'avatar_url', p.avatar_url)
        FROM public.profiles p WHERE p.user_id = _user_id),
    'result', jsonb_build_object(
      'result_id', v_result.id,
      'attempt_id', v_result.attempt_id,
      'score', v_result.score,
      'total_questions', v_result.total_questions,
      'total_points', v_result.total_points,
      'accuracy_pct', round(v_result.percentage)::int,
      'rank', v_rank,
      'avg_seconds_per_question', v_avg,
      'completed_at', v_result.completed_at),
    'breakdown', v_break);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- get_quiz_question_responses — who answered what, for one question.
-- Backs "View student responses". Staff-only, same guard.
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_quiz_question_responses(
  _quiz_id uuid, _question_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_q   public.quizzes%ROWTYPE;
  v_qq  public.quiz_questions%ROWTYPE;
  v_out jsonb;
BEGIN
  v_q := public._quiz_for_analytics(_quiz_id);

  SELECT * INTO v_qq FROM public.quiz_questions
   WHERE id = _question_id AND quiz_id = _quiz_id;
  IF v_qq.id IS NULL THEN
    RAISE EXCEPTION 'question_not_found' USING ERRCODE = 'P0002';
  END IF;

  WITH best AS (
    SELECT DISTINCT ON (r.user_id) r.user_id, r.id AS result_id
      FROM public.quiz_results r WHERE r.quiz_id = _quiz_id
     ORDER BY r.user_id, r.completed_at DESC NULLS LAST
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'user_id',      b.user_id,
    'display_name', COALESCE(NULLIF(TRIM(p.display_name), ''),
                             NULLIF(TRIM(p.full_name), ''), 'Student'),
    'avatar_url',   p.avatar_url,
    'answered',     (sa.id IS NOT NULL),
    'is_correct',   COALESCE(sa.is_correct, false),
    'points_awarded', COALESCE(sa.points_awarded, 0),
    'selected_option_id', sa.selected_option_id,
    'selected_option_text', o.option_text,
    'selected_answer', sa.selected_answer
  ) ORDER BY COALESCE(sa.is_correct, false), p.full_name), '[]'::jsonb)
    INTO v_out
    FROM best b
    LEFT JOIN public.profiles p ON p.user_id = b.user_id
    LEFT JOIN public.student_quiz_answers sa
      ON sa.result_id = b.result_id AND sa.question_id = _question_id
    LEFT JOIN public.quiz_options o ON o.id = sa.selected_option_id;

  RETURN jsonb_build_object(
    'quiz_id', v_q.id,
    'question_id', v_qq.id,
    'question', v_qq.question,
    'responses', v_out);
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- Grants — authenticated only. PUBLIC is revoked first: Postgres grants EXECUTE
-- to PUBLIC on every new function, and anon inherits it.
-- ═══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.get_quiz_analytics_overview(uuid)',
    'public.get_quiz_question_analytics(uuid)',
    'public.get_quiz_student_analytics(uuid)',
    'public.get_student_quiz_report(uuid, uuid)',
    'public.get_quiz_question_responses(uuid, uuid)',
    'public.quiz_difficulty_band(numeric)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
  -- Internal guard: never client-callable on its own.
  EXECUTE 'REVOKE ALL ON FUNCTION public._quiz_for_analytics(uuid) FROM PUBLIC';
END $$;

-- ─── Indexes for the access patterns above ─────────────────────────────────
CREATE INDEX IF NOT EXISTS quiz_results_quiz_user_completed_idx
  ON public.quiz_results (quiz_id, user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS student_quiz_answers_result_question_idx
  ON public.student_quiz_answers (result_id, question_id);
CREATE INDEX IF NOT EXISTS student_quiz_answers_question_idx
  ON public.student_quiz_answers (question_id);
