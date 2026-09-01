-- Two centres, and a published quiz that uses every type the engine claims to
-- support. The point of the seed is that the correct answer for each question
-- is known by hand, so a grading assertion can be exact rather than circular.
BEGIN;

-- Both centres have live multiplayer ON, so every cross-tenant assertion tests
-- tenancy rather than the flag: a foreign tutor with the feature fully enabled
-- must still be refused. Enablement is data on the centre row — there is no
-- hardcoded id or slug anywhere in the product.
INSERT INTO public.tuition_centers (id, name, subdomain_slug, feature_flags) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Centre A', 'centre-a',
   '{"liveQuizMultiplayer": true, "expandedQuestionTypes": true}'::jsonb),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Centre B', 'centre-b',
   '{"liveQuizMultiplayer": true}'::jsonb);

INSERT INTO auth.users (id) VALUES
  ('11111111-0000-0000-0000-000000000001'), -- tutor A (host)
  ('22222222-0000-0000-0000-000000000002'), -- student 1 (A) answers correctly
  ('22222222-0000-0000-0000-000000000003'), -- student 2 (A) answers wrongly
  ('33333333-0000-0000-0000-000000000005'), -- tutor B (foreign tenant)
  ('44444444-0000-0000-0000-000000000006'); -- student B (foreign tenant)

INSERT INTO public.profiles (user_id, full_name) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Tutor Aisyah'),
  ('22222222-0000-0000-0000-000000000002', 'Melvin Lee'),
  ('22222222-0000-0000-0000-000000000003', 'Daniel Lim'),
  ('33333333-0000-0000-0000-000000000005', 'Tutor Foreign'),
  ('44444444-0000-0000-0000-000000000006', 'Student Foreign');

INSERT INTO public.classes (id, center_id, title) VALUES
  ('c1111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Physics Form 4'),
  ('c2222222-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'Foreign Class');

INSERT INTO public.class_tutors (class_id, tutor_user_id) VALUES
  ('c1111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001'),
  ('c2222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000005');

INSERT INTO public.class_enrollments (class_id, student_user_id, status) VALUES
  ('c1111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'active'),
  ('c1111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003', 'active'),
  ('c2222222-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000006', 'active');

-- ── The mixed quiz: one question of each supported type, in order. ─────────
INSERT INTO public.quizzes (id, class_id, center_id, title, status, total_points) VALUES
  ('d1111111-0000-0000-0000-000000000001', 'c1111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Mixed Types Quiz', 'published', 600);

INSERT INTO public.quiz_questions
  (id, quiz_id, question, question_type, points, explanation, order_index,
   correct_answer, accepted_answers, answer_match_mode, numeric_answer, numeric_tolerance, answer_unit)
VALUES
  -- 0 · mcq — correct option is 0a…01
  ('e1111111-0000-0000-0000-000000000001', 'd1111111-0000-0000-0000-000000000001',
   'Which pigment captures light?', 'mcq', 100, 'Chlorophyll.', 0,
   NULL, NULL, 'ignore_case', NULL, NULL, NULL),
  -- 1 · true_false — the key lives on the correct option, as builder quizzes do
  ('e1111111-0000-0000-0000-000000000002', 'd1111111-0000-0000-0000-000000000001',
   'Photosynthesis releases oxygen.', 'true_false', 100, 'A by-product.', 1,
   NULL, NULL, 'ignore_case', NULL, NULL, NULL),
  -- 2 · multiple_select — correct SET is {0a…31, 0a…32}
  ('e1111111-0000-0000-0000-000000000003', 'd1111111-0000-0000-0000-000000000001',
   'Select every renewable source.', 'multiple_select', 100, 'Solar and hydro.', 2,
   NULL, NULL, 'ignore_case', NULL, NULL, NULL),
  -- 3 · short_answer — ignore_case, two accepted forms
  ('e1111111-0000-0000-0000-000000000004', 'd1111111-0000-0000-0000-000000000001',
   'Who formulated the laws of motion?', 'short_answer', 100, 'Isaac Newton.', 3,
   NULL, ARRAY['Newton','Isaac Newton'], 'ignore_case', NULL, NULL, NULL),
  -- 4 · numeric — 9.81 ± 0.05, unit is a display label only
  ('e1111111-0000-0000-0000-000000000005', 'd1111111-0000-0000-0000-000000000001',
   'Acceleration due to gravity on Earth?', 'numeric', 100, 'About 9.81.', 4,
   NULL, NULL, 'ignore_case', 9.81, 0.05, 'm/s²'),
  -- 5 · fill_blank — exact match, so case matters
  ('e1111111-0000-0000-0000-000000000006', 'd1111111-0000-0000-0000-000000000001',
   'Water boils at 100 degrees ______ at sea level.', 'fill_blank', 100, 'Celsius.', 5,
   NULL, ARRAY['Celsius'], 'exact', NULL, NULL, NULL);

INSERT INTO public.quiz_options (id, question_id, option_text, is_correct, order_index) VALUES
  ('0a111111-0000-0000-0000-000000000011', 'e1111111-0000-0000-0000-000000000001', 'Chlorophyll', true, 0),
  ('0a111111-0000-0000-0000-000000000012', 'e1111111-0000-0000-0000-000000000001', 'Carotene', false, 1),
  ('0a111111-0000-0000-0000-000000000021', 'e1111111-0000-0000-0000-000000000002', 'True', true, 0),
  ('0a111111-0000-0000-0000-000000000022', 'e1111111-0000-0000-0000-000000000002', 'False', false, 1),
  ('0a111111-0000-0000-0000-000000000031', 'e1111111-0000-0000-0000-000000000003', 'Solar', true, 0),
  ('0a111111-0000-0000-0000-000000000032', 'e1111111-0000-0000-0000-000000000003', 'Hydro', true, 1),
  ('0a111111-0000-0000-0000-000000000033', 'e1111111-0000-0000-0000-000000000003', 'Coal', false, 2);

-- ── A published quiz carrying a type the engine genuinely cannot grade. ────
-- 'ordering' has no grading branch, and since 20260906000000 the schema refuses
-- it outright — that CHECK is the primary guard. The row below therefore has to
-- be planted THROUGH the constraint, because what it exercises is the second
-- guard: a database where such a row exists anyway (one that predates the
-- constraint, or a type added to the CHECK before its grading branch was
-- written) must still be refused at host time rather than played and failed
-- mid-session.
INSERT INTO public.quizzes (id, class_id, center_id, title, status, total_points) VALUES
  ('d1111111-0000-0000-0000-000000000002', 'c1111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Quiz With An Unknown Type', 'published', 200);

ALTER TABLE public.quiz_questions DROP CONSTRAINT IF EXISTS quiz_questions_type_ck;

INSERT INTO public.quiz_questions (id, quiz_id, question, question_type, points, order_index) VALUES
  ('e2222222-0000-0000-0000-000000000001', 'd1111111-0000-0000-0000-000000000002',
   'Which pigment captures light?', 'mcq', 100, 0),
  ('e2222222-0000-0000-0000-000000000002', 'd1111111-0000-0000-0000-000000000002',
   'Order these planets by distance.', 'ordering', 100, 1);

-- NOT VALID: the planted row survives, and every later insert is still checked,
-- so the rest of the suite runs against the production constraint.
ALTER TABLE public.quiz_questions ADD CONSTRAINT quiz_questions_type_ck
  CHECK (question_type IN (
    'mcq', 'multiple_choice', 'true_false',
    'multiple_select', 'short_answer', 'numeric', 'fill_blank'
  )) NOT VALID;

INSERT INTO public.quiz_options (id, question_id, option_text, is_correct, order_index) VALUES
  ('0a222222-0000-0000-0000-000000000011', 'e2222222-0000-0000-0000-000000000001', 'Chlorophyll', true, 0),
  ('0a222222-0000-0000-0000-000000000012', 'e2222222-0000-0000-0000-000000000001', 'Carotene', false, 1);

COMMIT;
