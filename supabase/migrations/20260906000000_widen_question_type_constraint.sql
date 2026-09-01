-- ═══════════════════════════════════════════════════════════════════════════
-- Phase 5's question types could not be saved at all.
--
-- 20260718074806 put this on quiz_questions and nothing ever widened it:
--
--   ALTER TABLE public.quiz_questions ADD CONSTRAINT quiz_questions_type_ck
--     CHECK (question_type IN ('mcq','multiple_choice','true_false'));
--
-- So on a real database every Phase 5 type — multiple_select, short_answer,
-- numeric, fill_blank — is rejected on INSERT. The builder cannot save one, and
-- add_question_bank_questions_to_quiz cannot copy one out of the bank. Grading,
-- redaction and the live engine were all correct and all unreachable.
--
-- The Phase 5 test fixture created quiz_questions from scratch, without the
-- constraint, so the suite proved the grader rather than the schema. The
-- fixture now reproduces the constraint, which is what makes this migration
-- provable rather than assumed.
--
-- Widening a CHECK to a superset cannot fail on existing rows.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.quiz_questions DROP CONSTRAINT IF EXISTS quiz_questions_type_ck;
ALTER TABLE public.quiz_questions ADD CONSTRAINT quiz_questions_type_ck
  CHECK (question_type IN (
    'mcq', 'multiple_choice', 'true_false',
    'multiple_select', 'short_answer', 'numeric', 'fill_blank'
  ));

COMMENT ON CONSTRAINT quiz_questions_type_ck ON public.quiz_questions IS
  'The types the engine can actually grade. This list must agree with the '
  'branches in _quiz_answer_is_correct and with the allow-list in '
  'create_live_quiz_session; supabase/tests/quiz_phase345 asserts that it does. '
  'Adding a type here without a grading branch makes it saveable and '
  'ungradeable — every answer to it would be marked wrong.';

-- ─── The bank had no constraint at all ─────────────────────────────────────
-- A bank question could be saved with any type string; the failure only
-- appeared later, as a constraint violation on the COPY into a quiz, with a
-- message about a different table. Better to refuse it where it is authored.
DO $$
DECLARE v_bad text;
BEGIN
  IF to_regclass('public.question_bank_questions') IS NULL THEN
    RETURN;
  END IF;

  SELECT string_agg(DISTINCT question_type, ', ')
    INTO v_bad
    FROM public.question_bank_questions
   WHERE question_type NOT IN (
     'mcq', 'multiple_choice', 'true_false',
     'multiple_select', 'short_answer', 'numeric', 'fill_blank');

  -- Report the offenders rather than failing with "constraint violated" and no
  -- indication of what to fix.
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION
      'question_bank_questions holds ungradeable question_type values: %. '
      'Fix or archive those rows before applying this migration.', v_bad;
  END IF;

  ALTER TABLE public.question_bank_questions
    DROP CONSTRAINT IF EXISTS qb_questions_type_ck;
  ALTER TABLE public.question_bank_questions
    ADD CONSTRAINT qb_questions_type_ck
    CHECK (question_type IN (
      'mcq', 'multiple_choice', 'true_false',
      'multiple_select', 'short_answer', 'numeric', 'fill_blank'
    ));
END $$;

-- Prove the constraint admits every type the engine grades, in the same
-- transaction that widened it — a CHECK that silently kept its old definition
-- would otherwise look identical from here.
DO $$
DECLARE
  t       text;
  v_quiz  uuid;
  v_class uuid;
  v_ctr   uuid;
BEGIN
  SELECT c.id, c.center_id INTO v_class, v_ctr FROM public.classes c LIMIT 1;
  IF v_class IS NULL THEN
    -- An empty database has nothing to insert against. The constraint text is
    -- still asserted below.
    NULL;
  ELSE
    INSERT INTO public.quizzes (class_id, center_id, title, status)
    VALUES (v_class, v_ctr, '__type_ck_probe__', 'draft')
    RETURNING id INTO v_quiz;

    FOREACH t IN ARRAY ARRAY['mcq','multiple_choice','true_false',
                             'multiple_select','short_answer','numeric','fill_blank'] LOOP
      INSERT INTO public.quiz_questions (quiz_id, question, question_type)
      VALUES (v_quiz, 'probe', t);
    END LOOP;

    -- Rolled back by hand: the probe must leave nothing behind.
    DELETE FROM public.quiz_questions WHERE quiz_id = v_quiz;
    DELETE FROM public.quizzes WHERE id = v_quiz;
  END IF;

  FOREACH t IN ARRAY ARRAY['multiple_select','short_answer','numeric','fill_blank'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
       WHERE conname = 'quiz_questions_type_ck'
         AND conrelid = 'public.quiz_questions'::regclass
         AND pg_get_constraintdef(oid) LIKE '%' || t || '%') THEN
      RAISE EXCEPTION 'quiz_questions_type_ck still rejects %', t;
    END IF;
  END LOOP;
END $$;
