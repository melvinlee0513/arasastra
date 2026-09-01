-- Two centres. Centre A has a graded quiz with a spread of results that the
-- analytics assertions can check exact numbers against.
BEGIN;

-- Centre A is the pilot centre: the Phase 1-5 flags are ON for it and unset
-- for Centre B, which is what enablement actually looks like — one UPDATE
-- against one centre's row, no hardcoded id or slug anywhere in code.
INSERT INTO public.tuition_centers (id, name, subdomain_slug, feature_flags) VALUES
  ('aaaaaaaa-0000-0000-0000-00000000000a', 'Centre A', 'centre-a',
   '{"liveQuizMultiplayer": true, "quizAnalytics": true,
     "questionBank": true, "expandedQuestionTypes": true}'::jsonb),
  -- Centre B has the BANK on too, so every cross-tenant assertion below tests
  -- tenancy rather than the flag: a foreign tutor with the feature fully
  -- enabled must still be refused. Its other flags stay unset, which is what
  -- an un-enrolled centre looks like.
  ('bbbbbbbb-0000-0000-0000-00000000000b', 'Centre B', 'centre-b',
   '{"questionBank": true}'::jsonb);

INSERT INTO auth.users (id) VALUES
  ('11111111-0000-0000-0000-000000000001'), -- tutor A
  ('22222222-0000-0000-0000-000000000002'), -- student 1
  ('22222222-0000-0000-0000-000000000003'), -- student 2
  ('22222222-0000-0000-0000-000000000004'), -- student 3
  ('22222222-0000-0000-0000-000000000005'), -- student 4 (never attempted)
  ('33333333-0000-0000-0000-000000000006'), -- tutor B (foreign)
  ('44444444-0000-0000-0000-000000000007'), -- admin A
  ('55555555-0000-0000-0000-000000000008'), -- admin B (foreign)
  ('66666666-0000-0000-0000-000000000009'), -- superadmin, centre A on profile
  ('77777777-0000-0000-0000-00000000000a'); -- superadmin, NO centre anywhere

-- Every user's centre lives on their profile. This is the canonical tenant
-- membership the whole app reads, and the only place the Question Bank should
-- resolve an admin's centre from.
INSERT INTO public.profiles (user_id, full_name, display_name, center_id) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Tutor Aisyah',   NULL, 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('22222222-0000-0000-0000-000000000002', 'Aisyah Ahmad',   NULL, 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('22222222-0000-0000-0000-000000000003', 'Marcus Tan',     NULL, 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('22222222-0000-0000-0000-000000000004', 'Melvin Lee',     NULL, 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('22222222-0000-0000-0000-000000000005', 'Sarah Lim',      NULL, 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('33333333-0000-0000-0000-000000000006', 'Tutor Foreign',  NULL, 'bbbbbbbb-0000-0000-0000-00000000000b'),
  ('44444444-0000-0000-0000-000000000007', 'Admin A',        NULL, 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('55555555-0000-0000-0000-000000000008', 'Admin B',        NULL, 'bbbbbbbb-0000-0000-0000-00000000000b'),
  ('66666666-0000-0000-0000-000000000009', 'Superadmin HQ',  NULL, 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('77777777-0000-0000-0000-00000000000a', 'Superadmin Roam', NULL, NULL);

-- Roles carry NO centre — production's user_roles has no such column. An
-- admin's centre comes from their profile, via get_user_center().
INSERT INTO public.user_roles (user_id, role) VALUES
  ('44444444-0000-0000-0000-000000000007', 'admin'),
  ('55555555-0000-0000-0000-000000000008', 'admin'),
  ('66666666-0000-0000-0000-000000000009', 'superadmin'),
  ('77777777-0000-0000-0000-00000000000a', 'superadmin');

INSERT INTO public.subjects (id, center_id, name) VALUES
  ('5b1e0000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Biology'),
  ('5b1e0000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Physics'),
  ('5b1e0000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-00000000000b', 'Chemistry');

INSERT INTO public.classes (id, center_id, subject_id, title) VALUES
  ('c1111111-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a',
   '5b1e0000-0000-0000-0000-000000000001', 'Biology Form 4'),
  ('c2222222-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-00000000000b',
   '5b1e0000-0000-0000-0000-000000000003', 'Foreign Class');

INSERT INTO public.class_tutors (class_id, tutor_user_id) VALUES
  ('c1111111-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001'),
  ('c2222222-0000-0000-0000-000000000002', '33333333-0000-0000-0000-000000000006');

INSERT INTO public.class_enrollments (class_id, student_user_id, status) VALUES
  ('c1111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000002', 'active'),
  ('c1111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000003', 'active'),
  ('c1111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000004', 'active'),
  ('c1111111-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000005', 'active');

-- Quiz: 4 questions, 4 points, published.
INSERT INTO public.quizzes (id, class_id, center_id, subject_id, title, status, total_points)
VALUES ('9012aaaa-0000-0000-0000-00000000000f', 'c1111111-0000-0000-0000-000000000001',
        'aaaaaaaa-0000-0000-0000-00000000000a', '5b1e0000-0000-0000-0000-000000000001',
        'Photosynthesis Quiz', 'published', 4);

INSERT INTO public.quiz_questions (id, quiz_id, question, question_type, points, order_index, center_id) VALUES
  ('90120001-0000-0000-0000-000000000001', '9012aaaa-0000-0000-0000-00000000000f',
   'What is the main pigment used in photosynthesis?', 'mcq', 1, 0, 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('90120002-0000-0000-0000-000000000002', '9012aaaa-0000-0000-0000-00000000000f',
   'Which part of the leaf absorbs sunlight?', 'mcq', 1, 1, 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('90120003-0000-0000-0000-000000000003', '9012aaaa-0000-0000-0000-00000000000f',
   'Which organelle contains chlorophyll?', 'mcq', 1, 2, 'aaaaaaaa-0000-0000-0000-00000000000a'),
  ('90120004-0000-0000-0000-000000000004', '9012aaaa-0000-0000-0000-00000000000f',
   'Photosynthesis releases oxygen.', 'true_false', 1, 3, 'aaaaaaaa-0000-0000-0000-00000000000a');

INSERT INTO public.quiz_options (id, question_id, center_id, option_text, is_correct, order_index) VALUES
  ('0f710001-0000-0000-0000-000000000001','90120001-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','Chlorophyll',true,0),
  ('0f710002-0000-0000-0000-000000000002','90120001-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','Carotene',false,1),
  ('0f710003-0000-0000-0000-000000000003','90120002-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-00000000000a','Chloroplast',true,0),
  ('0f710004-0000-0000-0000-000000000004','90120002-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-00000000000a','Cuticle',false,1),
  ('0f710005-0000-0000-0000-000000000005','90120003-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-00000000000a','Chloroplast',true,0),
  ('0f710006-0000-0000-0000-000000000006','90120003-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-00000000000a','Mitochondrion',false,1),
  ('0f710007-0000-0000-0000-000000000007','90120003-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-00000000000a','Nucleus',false,2),
  ('0f710008-0000-0000-0000-000000000008','90120004-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-00000000000a','True',true,0),
  ('0f710009-0000-0000-0000-000000000009','90120004-0000-0000-0000-000000000004','aaaaaaaa-0000-0000-0000-00000000000a','False',false,1);

-- Three attempts, three results, with deliberate accuracy:
--   Q1 3/3 correct = 100%, Q2 2/3 = 67%, Q3 1/3 = 33% (difficult), Q4 2/3 = 67%
--   Student scores: 4/4, 2/4, 2/4
INSERT INTO public.quiz_attempts (id, quiz_id, user_id, center_id, class_id, status,
  started_at, submitted_at, score, total_points, max_points, percentage)
VALUES
 ('a7100001-0000-0000-0000-000000000001','9012aaaa-0000-0000-0000-00000000000f','22222222-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-00000000000a','c1111111-0000-0000-0000-000000000001','submitted',
  now() - interval '30 minutes', now() - interval '29 minutes 36 seconds', 4, 4, 4, 100),
 ('a7100002-0000-0000-0000-000000000002','9012aaaa-0000-0000-0000-00000000000f','22222222-0000-0000-0000-000000000003',
  'aaaaaaaa-0000-0000-0000-00000000000a','c1111111-0000-0000-0000-000000000001','submitted',
  now() - interval '25 minutes', now() - interval '24 minutes 20 seconds', 2, 2, 4, 50),
 ('a7100003-0000-0000-0000-000000000003','9012aaaa-0000-0000-0000-00000000000f','22222222-0000-0000-0000-000000000004',
  'aaaaaaaa-0000-0000-0000-00000000000a','c1111111-0000-0000-0000-000000000001','submitted',
  now() - interval '20 minutes', now() - interval '19 minutes 8 seconds', 2, 2, 4, 50);

INSERT INTO public.quiz_results (id, quiz_id, user_id, attempt_id, center_id, class_id,
  score, total_questions, total_points, percentage, completed_at)
VALUES
 ('4e510001-0000-0000-0000-000000000001','9012aaaa-0000-0000-0000-00000000000f','22222222-0000-0000-0000-000000000002',
  'a7100001-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-00000000000a','c1111111-0000-0000-0000-000000000001',
  4,4,4,100, now() - interval '29 minutes'),
 ('4e510002-0000-0000-0000-000000000002','9012aaaa-0000-0000-0000-00000000000f','22222222-0000-0000-0000-000000000003',
  'a7100002-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-00000000000a','c1111111-0000-0000-0000-000000000001',
  2,4,2,50, now() - interval '24 minutes'),
 ('4e510003-0000-0000-0000-000000000003','9012aaaa-0000-0000-0000-00000000000f','22222222-0000-0000-0000-000000000004',
  'a7100003-0000-0000-0000-000000000003','aaaaaaaa-0000-0000-0000-00000000000a','c1111111-0000-0000-0000-000000000001',
  2,4,2,50, now() - interval '19 minutes');

INSERT INTO public.student_quiz_answers (center_id, result_id, question_id, selected_option_id, selected_answer, is_correct, points_awarded) VALUES
 -- Aisyah: all four correct
 ('aaaaaaaa-0000-0000-0000-00000000000a','4e510001-0000-0000-0000-000000000001','90120001-0000-0000-0000-000000000001','0f710001-0000-0000-0000-000000000001',NULL,true,1),
 ('aaaaaaaa-0000-0000-0000-00000000000a','4e510001-0000-0000-0000-000000000001','90120002-0000-0000-0000-000000000002','0f710003-0000-0000-0000-000000000003',NULL,true,1),
 ('aaaaaaaa-0000-0000-0000-00000000000a','4e510001-0000-0000-0000-000000000001','90120003-0000-0000-0000-000000000003','0f710005-0000-0000-0000-000000000005',NULL,true,1),
 ('aaaaaaaa-0000-0000-0000-00000000000a','4e510001-0000-0000-0000-000000000001','90120004-0000-0000-0000-000000000004',NULL,'true',true,1),
 -- Marcus: Q1 ok, Q2 wrong, Q3 wrong, Q4 ok
 ('aaaaaaaa-0000-0000-0000-00000000000a','4e510002-0000-0000-0000-000000000002','90120001-0000-0000-0000-000000000001','0f710001-0000-0000-0000-000000000001',NULL,true,1),
 ('aaaaaaaa-0000-0000-0000-00000000000a','4e510002-0000-0000-0000-000000000002','90120002-0000-0000-0000-000000000002','0f710004-0000-0000-0000-000000000004',NULL,false,0),
 ('aaaaaaaa-0000-0000-0000-00000000000a','4e510002-0000-0000-0000-000000000002','90120003-0000-0000-0000-000000000003','0f710006-0000-0000-0000-000000000006',NULL,false,0),
 ('aaaaaaaa-0000-0000-0000-00000000000a','4e510002-0000-0000-0000-000000000002','90120004-0000-0000-0000-000000000004',NULL,'true',true,1),
 -- Melvin: Q1 ok, Q2 ok, Q3 wrong, Q4 wrong
 ('aaaaaaaa-0000-0000-0000-00000000000a','4e510003-0000-0000-0000-000000000003','90120001-0000-0000-0000-000000000001','0f710001-0000-0000-0000-000000000001',NULL,true,1),
 ('aaaaaaaa-0000-0000-0000-00000000000a','4e510003-0000-0000-0000-000000000003','90120002-0000-0000-0000-000000000002','0f710003-0000-0000-0000-000000000003',NULL,true,1),
 ('aaaaaaaa-0000-0000-0000-00000000000a','4e510003-0000-0000-0000-000000000003','90120003-0000-0000-0000-000000000003','0f710007-0000-0000-0000-000000000007',NULL,false,0),
 ('aaaaaaaa-0000-0000-0000-00000000000a','4e510003-0000-0000-0000-000000000003','90120004-0000-0000-0000-000000000004',NULL,'false',false,0);

COMMIT;
