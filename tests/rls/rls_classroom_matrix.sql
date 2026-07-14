-- ============================================================================
-- Classroom-resource access-control regression matrix.
-- ----------------------------------------------------------------------------
-- Actors : same-centre admin, assigned tutor, same-centre unassigned tutor,
--          enrolled student, same-centre unenrolled student,
--          foreign-tenant admin, foreign-tenant tutor, foreign-tenant student,
--          anonymous.
--
-- Actions: read class metadata; read published resource; read draft resource;
--          create / update / publish / delete resource;
--          read class_tutors; insert/remove class_tutors;
--          read class_enrollments; insert/remove class_enrollments;
--          foreign-tenant class + resource metadata read.
--
-- Runs inside a transaction and ROLLBACKs — never persists rows. Uses
-- set_config() to simulate the Supabase JWT claim and `SET LOCAL ROLE` to
-- swap between anon / authenticated the same way PostgREST does at request
-- time.
--
-- Usage:
--     psql "$SUPABASE_DB_URL" -f tests/rls/rls_classroom_matrix.sql
--
-- Requires a role with permission to INSERT into `auth.users` and to
-- `SET LOCAL ROLE authenticated|anon` (i.e. the Supabase superuser
-- connection string). The sandbox `sandbox_exec` role does NOT have these
-- privileges — running this file as sandbox_exec fails at fixture setup
-- and at role-switching. All writes happen inside a transaction and are
-- rolled back at the end, so nothing persists.
-- ============================================================================

\set ON_ERROR_STOP on
\timing off

BEGIN;

-- --------------------------------------------------------------------------
-- Helpers
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.assume(_role text, _uid uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _uid IS NULL THEN
    PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  ELSE
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', _uid::text, 'role', _role)::text,
      true
    );
  END IF;
  EXECUTE format('SET LOCAL ROLE %I', _role);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS void LANGUAGE sql AS $$ RESET ROLE; $$;

CREATE OR REPLACE FUNCTION pg_temp.expect(_label text, _ok boolean, _detail text DEFAULT '')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _ok THEN
    RAISE NOTICE '[PASS] %', _label;
  ELSE
    RAISE EXCEPTION '[FAIL] % %', _label, _detail;
  END IF;
END;
$$;

-- Try an operation as the current role; capture whether it succeeded or was
-- rejected by RLS / privileges. Returns true when the statement succeeded.
CREATE OR REPLACE FUNCTION pg_temp.try(_sql text) RETURNS boolean
LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    EXECUTE _sql;
    RETURN true;
  EXCEPTION
    WHEN insufficient_privilege OR check_violation OR others THEN
      RETURN false;
  END;
END;
$$;

-- Count rows visible to the current role from a SELECT expression.
CREATE OR REPLACE FUNCTION pg_temp.visible_count(_sql text) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  EXECUTE format('SELECT count(*) FROM (%s) _q', _sql) INTO n;
  RETURN n;
EXCEPTION
  WHEN insufficient_privilege OR others THEN RETURN -1;
END;
$$;

-- --------------------------------------------------------------------------
-- Fixture set-up (all rows scoped to two disposable centres A + B).
-- --------------------------------------------------------------------------
DO $$
DECLARE
  center_a uuid := gen_random_uuid();
  center_b uuid := gen_random_uuid();
  subj_a   uuid := gen_random_uuid();
  class_a  uuid := gen_random_uuid();
  class_b  uuid := gen_random_uuid();
  admin_a  uuid := gen_random_uuid();
  tutor_asg uuid := gen_random_uuid();  -- assigned tutor in A
  tutor_un uuid := gen_random_uuid();   -- unassigned tutor in A
  stu_enr  uuid := gen_random_uuid();   -- enrolled student in A
  stu_unen uuid := gen_random_uuid();   -- unenrolled student in A
  admin_b  uuid := gen_random_uuid();
  tutor_b  uuid := gen_random_uuid();
  stu_b    uuid := gen_random_uuid();
  res_pub  uuid := gen_random_uuid();
  res_drft uuid := gen_random_uuid();
  ok       boolean;
  n        integer;
BEGIN
  -- Centres
  INSERT INTO public.tuition_centers (id, name, subdomain_slug, domain_status)
  VALUES (center_a, 'Test Centre A', 'test-a-' || substr(center_a::text,1,6), 'active'),
         (center_b, 'Test Centre B', 'test-b-' || substr(center_b::text,1,6), 'active');

  -- Subjects + classes
  INSERT INTO public.subjects (id, name, center_id) VALUES (subj_a, 'Test Subject', center_a);
  INSERT INTO public.classes (id, title, subject_id, center_id, scheduled_at, status)
  VALUES (class_a, 'Class A', subj_a, center_a, now(), 'active'),
         (class_b, 'Class B', NULL,   center_b, now(), 'active');

  -- auth.users first (profiles.user_id references it).
  INSERT INTO auth.users (id, email, instance_id, aud, role) VALUES
    (admin_a, 'a@a.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (tutor_asg, 't1@a.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (tutor_un, 't2@a.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (stu_enr, 's1@a.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (stu_unen, 's2@a.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (admin_b, 'a@b.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (tutor_b, 't@b.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
    (stu_b, 's@b.test', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  -- Profiles (needed by same_center_as_current_user + has_role)
  INSERT INTO public.profiles (id, user_id, email, full_name, center_id, is_registered) VALUES
    (admin_a, admin_a, 'a@a.test', 'Admin A', center_a, true),
    (tutor_asg, tutor_asg, 't1@a.test', 'Tutor Assigned', center_a, true),
    (tutor_un, tutor_un, 't2@a.test', 'Tutor Unassigned', center_a, true),
    (stu_enr, stu_enr, 's1@a.test', 'Student Enrolled', center_a, true),
    (stu_unen, stu_unen, 's2@a.test', 'Student Unenrolled', center_a, true),
    (admin_b, admin_b, 'a@b.test', 'Admin B', center_b, true),
    (tutor_b, tutor_b, 't@b.test', 'Tutor B', center_b, true),
    (stu_b, stu_b, 's@b.test', 'Student B', center_b, true);

  INSERT INTO public.user_roles (user_id, role) VALUES
    (admin_a, 'admin'), (tutor_asg, 'tutor'), (tutor_un, 'tutor'),
    (stu_enr, 'student'), (stu_unen, 'student'),
    (admin_b, 'admin'), (tutor_b, 'tutor'), (stu_b, 'student');

  -- Assignments + enrolments
  INSERT INTO public.class_tutors (class_id, tutor_user_id, center_id)
  VALUES (class_a, tutor_asg, center_a);
  INSERT INTO public.class_enrollments (class_id, student_user_id, center_id, status)
  VALUES (class_a, stu_enr, center_a, 'active');

  -- Resources: one published video + one draft.
  INSERT INTO public.class_resources
    (id, center_id, class_id, uploaded_by, title, resource_type, source_type,
     embed_url, status, published_at)
  VALUES
    (res_pub, center_a, class_a, tutor_asg, 'Published Video', 'video', 'youtube',
     'https://www.youtube.com/embed/aaaaaaaaaaa', 'published', now()),
    (res_drft, center_a, class_a, tutor_asg, 'Draft Video', 'video', 'youtube',
     'https://www.youtube.com/embed/bbbbbbbbbbb', 'draft', NULL);

  RAISE NOTICE '── Fixtures created (centre_a=%, centre_b=%) ──', center_a, center_b;

  -- =====================================================================
  -- ACTOR 1: Same-centre admin
  -- =====================================================================
  PERFORM pg_temp.assume('authenticated', admin_a);
  PERFORM pg_temp.expect('A1 class read',
    pg_temp.visible_count(format('SELECT 1 FROM public.classes WHERE id=%L', class_a)) = 1);
  PERFORM pg_temp.expect('A1 sees both published+draft resources',
    pg_temp.visible_count(format('SELECT 1 FROM public.class_resources WHERE class_id=%L', class_a)) = 2);
  PERFORM pg_temp.expect('A1 can insert class_tutors',
    pg_temp.try(format('INSERT INTO public.class_tutors(class_id,tutor_user_id,center_id) VALUES (%L,%L,%L)',
      class_a, tutor_un, center_a)));
  PERFORM pg_temp.expect('A1 can delete class_tutors it just added',
    pg_temp.try(format('DELETE FROM public.class_tutors WHERE class_id=%L AND tutor_user_id=%L', class_a, tutor_un)));
  PERFORM pg_temp.expect('A1 can insert class_enrollments',
    pg_temp.try(format('INSERT INTO public.class_enrollments(class_id,student_user_id,center_id,status) VALUES (%L,%L,%L,%L)',
      class_a, stu_unen, center_a, 'active')));
  PERFORM pg_temp.expect('A1 can remove class_enrollments',
    pg_temp.try(format('DELETE FROM public.class_enrollments WHERE class_id=%L AND student_user_id=%L', class_a, stu_unen)));
  PERFORM pg_temp.expect('A1 cannot see foreign centre class',
    pg_temp.visible_count(format('SELECT 1 FROM public.classes WHERE id=%L', class_b)) = 0);
  PERFORM pg_temp.reset_role();

  -- =====================================================================
  -- ACTOR 2: Assigned tutor
  -- =====================================================================
  PERFORM pg_temp.assume('authenticated', tutor_asg);
  PERFORM pg_temp.expect('A2 class read',
    pg_temp.visible_count(format('SELECT 1 FROM public.classes WHERE id=%L', class_a)) = 1);
  PERFORM pg_temp.expect('A2 sees published + draft resources',
    pg_temp.visible_count(format('SELECT 1 FROM public.class_resources WHERE class_id=%L', class_a)) = 2);
  PERFORM pg_temp.expect('A2 can create resource',
    pg_temp.try(format($f$INSERT INTO public.class_resources(center_id,class_id,uploaded_by,title,resource_type,source_type,embed_url,status) VALUES (%L,%L,%L,'T2-new','video','youtube','https://www.youtube.com/embed/ccccccccccc','draft')$f$,
      center_a, class_a, tutor_asg)));
  PERFORM pg_temp.expect('A2 can update its resource',
    pg_temp.try(format($f$UPDATE public.class_resources SET title='T2-upd' WHERE class_id=%L AND uploaded_by=%L AND title='T2-new'$f$, class_a, tutor_asg)));
  PERFORM pg_temp.expect('A2 can publish its resource',
    pg_temp.try(format($f$UPDATE public.class_resources SET status='published', published_at=now() WHERE class_id=%L AND title='T2-upd'$f$, class_a)));
  PERFORM pg_temp.expect('A2 can delete its resource',
    pg_temp.try(format('DELETE FROM public.class_resources WHERE class_id=%L AND title=%L', class_a, 'T2-upd')));
  PERFORM pg_temp.expect('A2 CANNOT enrol a student',
    NOT pg_temp.try(format('INSERT INTO public.class_enrollments(class_id,student_user_id,center_id,status) VALUES (%L,%L,%L,%L)',
      class_a, stu_unen, center_a, 'active')));
  PERFORM pg_temp.expect('A2 cannot see foreign centre class',
    pg_temp.visible_count(format('SELECT 1 FROM public.classes WHERE id=%L', class_b)) = 0);
  PERFORM pg_temp.reset_role();

  -- =====================================================================
  -- ACTOR 3: Same-centre unassigned tutor
  -- =====================================================================
  PERFORM pg_temp.assume('authenticated', tutor_un);
  PERFORM pg_temp.expect('A3 CANNOT read resources of unassigned class',
    pg_temp.visible_count(format('SELECT 1 FROM public.class_resources WHERE class_id=%L', class_a)) = 0);
  PERFORM pg_temp.expect('A3 CANNOT create resource in unassigned class',
    NOT pg_temp.try(format($f$INSERT INTO public.class_resources(center_id,class_id,uploaded_by,title,resource_type,source_type,embed_url,status) VALUES (%L,%L,%L,'nope','video','youtube','https://www.youtube.com/embed/ddddddddddd','draft')$f$,
      center_a, class_a, tutor_un)));
  PERFORM pg_temp.expect('A3 CANNOT update published resource',
    NOT pg_temp.try(format('UPDATE public.class_resources SET title=''hijack'' WHERE id=%L', res_pub)));
  PERFORM pg_temp.expect('A3 CANNOT delete published resource',
    NOT pg_temp.try(format('DELETE FROM public.class_resources WHERE id=%L', res_pub)));
  PERFORM pg_temp.reset_role();

  -- =====================================================================
  -- ACTOR 4: Enrolled student
  -- =====================================================================
  PERFORM pg_temp.assume('authenticated', stu_enr);
  PERFORM pg_temp.expect('A4 class read',
    pg_temp.visible_count(format('SELECT 1 FROM public.classes WHERE id=%L', class_a)) = 1);
  PERFORM pg_temp.expect('A4 sees published resource only',
    pg_temp.visible_count(format('SELECT 1 FROM public.class_resources WHERE class_id=%L', class_a)) = 1);
  PERFORM pg_temp.expect('A4 CANNOT see draft resource',
    pg_temp.visible_count(format('SELECT 1 FROM public.class_resources WHERE id=%L', res_drft)) = 0);
  PERFORM pg_temp.expect('A4 CANNOT create resource',
    NOT pg_temp.try(format($f$INSERT INTO public.class_resources(center_id,class_id,uploaded_by,title,resource_type,source_type,embed_url,status) VALUES (%L,%L,%L,'nope','video','youtube','https://www.youtube.com/embed/eeeeeeeeeee','draft')$f$,
      center_a, class_a, stu_enr)));
  PERFORM pg_temp.expect('A4 CANNOT update published resource',
    NOT pg_temp.try(format('UPDATE public.class_resources SET title=''hijack'' WHERE id=%L', res_pub)));
  PERFORM pg_temp.expect('A4 CANNOT delete published resource',
    NOT pg_temp.try(format('DELETE FROM public.class_resources WHERE id=%L', res_pub)));
  PERFORM pg_temp.expect('A4 CANNOT enrol themselves elsewhere',
    NOT pg_temp.try(format('INSERT INTO public.class_enrollments(class_id,student_user_id,center_id,status) VALUES (%L,%L,%L,%L)',
      class_b, stu_enr, center_b, 'active')));
  PERFORM pg_temp.expect('A4 is_enrolled_in_class helper agrees',
    (SELECT public.is_enrolled_in_class(class_a)));
  PERFORM pg_temp.reset_role();

  -- =====================================================================
  -- ACTOR 5: Same-centre unenrolled student
  -- =====================================================================
  PERFORM pg_temp.assume('authenticated', stu_unen);
  PERFORM pg_temp.expect('A5 CANNOT see any resource of class_a',
    pg_temp.visible_count(format('SELECT 1 FROM public.class_resources WHERE class_id=%L', class_a)) = 0);
  PERFORM pg_temp.expect('A5 is_enrolled_in_class helper agrees (false)',
    NOT (SELECT public.is_enrolled_in_class(class_a)));
  PERFORM pg_temp.reset_role();

  -- =====================================================================
  -- ACTOR 6-8: Foreign-tenant admin / tutor / student
  -- =====================================================================
  FOR n IN 1..3 LOOP
    DECLARE foreign_uid uuid := (ARRAY[admin_b, tutor_b, stu_b])[n];
            label       text := (ARRAY['admin_b','tutor_b','student_b'])[n];
    BEGIN
      PERFORM pg_temp.assume('authenticated', foreign_uid);
      PERFORM pg_temp.expect(format('%s cannot see class_a', label),
        pg_temp.visible_count(format('SELECT 1 FROM public.classes WHERE id=%L', class_a)) = 0);
      PERFORM pg_temp.expect(format('%s cannot see class_a resources', label),
        pg_temp.visible_count(format('SELECT 1 FROM public.class_resources WHERE class_id=%L', class_a)) = 0);
      PERFORM pg_temp.expect(format('%s cannot see class_a enrolments', label),
        pg_temp.visible_count(format('SELECT 1 FROM public.class_enrollments WHERE class_id=%L', class_a)) = 0);
      PERFORM pg_temp.reset_role();
    END;
  END LOOP;

  -- =====================================================================
  -- ACTOR 9: Anonymous
  -- =====================================================================
  PERFORM pg_temp.assume('anon', NULL);
  PERFORM pg_temp.expect('anon cannot see class_a',
    pg_temp.visible_count(format('SELECT 1 FROM public.classes WHERE id=%L', class_a)) = 0);
  PERFORM pg_temp.expect('anon cannot see class_a resources',
    pg_temp.visible_count(format('SELECT 1 FROM public.class_resources WHERE class_id=%L', class_a)) = 0);
  PERFORM pg_temp.expect('anon cannot see class_tutors',
    pg_temp.visible_count(format('SELECT 1 FROM public.class_tutors WHERE class_id=%L', class_a)) = 0);
  PERFORM pg_temp.expect('anon cannot see class_enrollments',
    pg_temp.visible_count(format('SELECT 1 FROM public.class_enrollments WHERE class_id=%L', class_a)) = 0);
  PERFORM pg_temp.reset_role();

  RAISE NOTICE '════════════════════════════════════════════════════════';
  RAISE NOTICE 'All classroom RLS matrix assertions passed.';
END;
$$;

ROLLBACK;
