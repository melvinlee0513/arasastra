-- Two centres, so every cross-tenant assertion is against a real second tenant.
BEGIN;

INSERT INTO public.tuition_centers (id, name, slug) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Centre A', 'centre-a'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'Centre B', 'centre-b');

INSERT INTO auth.users (id) VALUES
  ('11111111-0000-0000-0000-000000000001'), -- tutor A
  ('22222222-0000-0000-0000-000000000002'), -- student 1 (A)
  ('22222222-0000-0000-0000-000000000003'), -- student 2 (A)
  ('22222222-0000-0000-0000-000000000004'), -- student 3 (A)
  ('33333333-0000-0000-0000-000000000005'), -- tutor B  (foreign tenant)
  ('44444444-0000-0000-0000-000000000006'), -- student B (foreign tenant)
  ('55555555-0000-0000-0000-000000000007'), -- student A, NOT enrolled
  ('66666666-0000-0000-0000-000000000008'); -- admin of Centre A

INSERT INTO public.profiles (user_id, full_name, avatar_url) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Tutor Aisyah', NULL),
  ('22222222-0000-0000-0000-000000000002', 'Melvin Lee', NULL),
  ('22222222-0000-0000-0000-000000000003', 'Daniel Lim', NULL),
  ('22222222-0000-0000-0000-000000000004', 'Sarah Wong', NULL),
  ('33333333-0000-0000-0000-000000000005', 'Tutor Foreign', NULL),
  ('44444444-0000-0000-0000-000000000006', 'Student Foreign', NULL),
  ('55555555-0000-0000-0000-000000000007', 'Unenrolled Student', NULL),
  ('66666666-0000-0000-0000-000000000008', 'Admin A', NULL);

INSERT INTO public.classes (id, center_id, title) VALUES
  ('c1111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Physics Form 4'),
  ('c2222222-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'Foreign Class');

INSERT INTO public.class_tutors (class_id, tutor_user_id) VALUES
  ('c1111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001'),
  ('c2222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000005');

INSERT INTO public.class_enrollments (class_id, student_user_id, status) VALUES
  ('c1111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'active'),
  ('c1111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003', 'active'),
  ('c1111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004', 'active'),
  ('c2222222-0000-0000-0000-000000000002', '44444444-0000-0000-0000-000000000006', 'active');

INSERT INTO public.user_roles (user_id, role, center_id) VALUES
  ('66666666-0000-0000-0000-000000000008', 'admin', 'aaaaaaaa-0000-0000-0000-000000000001');

-- Published quiz: 2 MCQ + 1 true/false.
INSERT INTO public.quizzes (id, class_id, center_id, title, status, total_points) VALUES
  ('d1111111-0000-0000-0000-000000000001', 'c1111111-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001', 'Photosynthesis Quiz', 'published', 300);

INSERT INTO public.quiz_questions (id, quiz_id, question, question_type, points, explanation, order_index) VALUES
  ('e1111111-0000-0000-0000-000000000001', 'd1111111-0000-0000-0000-000000000001',
   'What is the main pigment used in photosynthesis?', 'mcq', 100, 'Chlorophyll captures light energy.', 0),
  ('e1111111-0000-0000-0000-000000000002', 'd1111111-0000-0000-0000-000000000001',
   'Photosynthesis releases oxygen.', 'true_false', 100, 'Oxygen is a by-product.', 1),
  ('e1111111-0000-0000-0000-000000000003', 'd1111111-0000-0000-0000-000000000001',
   'Which organelle performs photosynthesis?', 'mcq', 100, 'The chloroplast.', 2);

INSERT INTO public.quiz_options (id, question_id, option_text, is_correct, order_index) VALUES
  ('0a111111-0000-0000-0000-000000000001', 'e1111111-0000-0000-0000-000000000001', 'Chlorophyll', true, 0),
  ('0a111111-0000-0000-0000-000000000002', 'e1111111-0000-0000-0000-000000000001', 'Carotene', false, 1),
  ('0a111111-0000-0000-0000-000000000003', 'e1111111-0000-0000-0000-000000000001', 'Hemoglobin', false, 2),
  ('0a222222-0000-0000-0000-000000000001', 'e1111111-0000-0000-0000-000000000002', 'True', true, 0),
  ('0a222222-0000-0000-0000-000000000002', 'e1111111-0000-0000-0000-000000000002', 'False', false, 1),
  ('0a333333-0000-0000-0000-000000000001', 'e1111111-0000-0000-0000-000000000003', 'Chloroplast', true, 0),
  ('0a333333-0000-0000-0000-000000000002', 'e1111111-0000-0000-0000-000000000003', 'Mitochondrion', false, 1);

-- A quiz in the foreign tenant, for cross-tenant host attempts.
INSERT INTO public.quizzes (id, class_id, center_id, title, status) VALUES
  ('d2222222-0000-0000-0000-000000000002', 'c2222222-0000-0000-0000-000000000002',
   'bbbbbbbb-0000-0000-0000-000000000002', 'Foreign Quiz', 'published');
INSERT INTO public.quiz_questions (id, quiz_id, question, question_type, points, order_index) VALUES
  ('e2222222-0000-0000-0000-000000000001', 'd2222222-0000-0000-0000-000000000002', 'Foreign Q', 'mcq', 100, 0);
INSERT INTO public.quiz_options (id, question_id, option_text, is_correct, order_index) VALUES
  ('0b111111-0000-0000-0000-000000000001', 'e2222222-0000-0000-0000-000000000001', 'A', true, 0),
  ('0b111111-0000-0000-0000-000000000002', 'e2222222-0000-0000-0000-000000000001', 'B', false, 1);

COMMIT;
