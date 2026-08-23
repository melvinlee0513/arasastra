-- 1) Fix fragile tutor enrollment visibility (name-matching join -> canonical assignments)
DROP POLICY IF EXISTS "Tutors can view enrollments for their subjects" ON public.enrollments;
CREATE POLICY "Tutors can view enrollments for assigned subjects"
ON public.enrollments FOR SELECT TO authenticated
USING (
  subject_id IN (
    SELECT ta.subject_id
    FROM public.tutor_assignments ta
    JOIN public.tutors t ON t.id = ta.tutor_id
    WHERE t.user_id = auth.uid()
  )
  OR subject_id IN (
    SELECT c.subject_id
    FROM public.classes c
    JOIN public.class_tutors ct ON ct.class_id = c.id
    WHERE ct.tutor_user_id = auth.uid()
  )
);

-- 2) Remove cross-tenant anonymous exposure of subjects & tutors
DROP POLICY IF EXISTS "Anyone can view active subjects" ON public.subjects;
CREATE POLICY "Members can view active subjects in their center"
ON public.subjects FOR SELECT TO authenticated
USING (is_active = true OR is_admin());

DROP POLICY IF EXISTS "Anyone can view active tutors" ON public.tutors;
CREATE POLICY "Members can view active tutors in their center"
ON public.tutors FOR SELECT TO authenticated
USING (is_active = true OR is_admin());

-- Tenant-scoped public catalogue for signed-out marketing/guest pages.
CREATE OR REPLACE FUNCTION public.get_public_subjects(_slug text DEFAULT NULL)
RETURNS TABLE (id uuid, name text, description text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_center uuid;
BEGIN
  IF _slug IS NOT NULL AND length(trim(_slug)) > 0 THEN
    SELECT tc.id INTO v_center
    FROM public.tuition_centers tc
    WHERE tc.subdomain_slug = lower(trim(_slug))
      AND tc.domain_status = 'active'
    LIMIT 1;
  END IF;

  IF v_center IS NULL THEN
    -- No tenant host resolved: only serve a catalogue when the platform has a
    -- single active tenant, so data from multiple centers is never mixed.
    SELECT tc.id INTO v_center
    FROM public.tuition_centers tc
    WHERE tc.domain_status = 'active'
    LIMIT 2;
    IF (SELECT count(*) FROM public.tuition_centers tc WHERE tc.domain_status = 'active') <> 1 THEN
      v_center := NULL;
    END IF;
  END IF;

  IF v_center IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT s.id, s.name, s.description
  FROM public.subjects s
  WHERE s.is_active = true
    AND s.center_id = v_center
  ORDER BY s.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_tutors(_slug text DEFAULT NULL)
RETURNS TABLE (id uuid, name text, specialization text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_center uuid;
BEGIN
  IF _slug IS NOT NULL AND length(trim(_slug)) > 0 THEN
    SELECT tc.id INTO v_center
    FROM public.tuition_centers tc
    WHERE tc.subdomain_slug = lower(trim(_slug))
      AND tc.domain_status = 'active'
    LIMIT 1;
  END IF;

  IF v_center IS NULL THEN
    IF (SELECT count(*) FROM public.tuition_centers tc WHERE tc.domain_status = 'active') = 1 THEN
      SELECT tc.id INTO v_center
      FROM public.tuition_centers tc
      WHERE tc.domain_status = 'active'
      LIMIT 1;
    END IF;
  END IF;

  IF v_center IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT t.id, t.name, t.specialization
  FROM public.tutors t
  WHERE t.is_active = true
    AND t.center_id = v_center
  ORDER BY t.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_subjects(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_tutors(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_subjects(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_tutors(text) TO anon, authenticated;

-- 3) Tighten EXECUTE on SECURITY DEFINER functions that no client or policy needs.
DO $do$
DECLARE
  r record;
  pol_exprs text;
  anon_allow text[] := ARRAY[
    'get_invitation_by_token','get_invite_redirect','get_signin_redirect_for_email',
    'resolve_tenant_by_subdomain','get_public_subjects','get_public_tutors'
  ];
BEGIN
  SELECT string_agg(coalesce(qual,'') || ' ' || coalesce(with_check,''), ' ')
    INTO pol_exprs FROM pg_policies;

  FOR r IN
    SELECT p.oid, p.proname, p.prokind, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    -- Keep functions referenced from RLS policies (evaluated as the caller role).
    IF pol_exprs LIKE '%' || r.proname || '(%' THEN
      CONTINUE;
    END IF;

    -- Anonymous callers only keep the intentionally public RPCs.
    IF NOT (r.proname = ANY(anon_allow)) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM anon', r.proname, r.args);
    END IF;

    -- Internal helpers / trigger functions: no direct client execution at all.
    IF r.proname LIKE '\_%'
       OR r.proname IN (
         'class_content_folders_validate','assign_tutor_role','revoke_tutor_role',
         'admin_clear_student_profile'
       )
       OR r.prokind = 't'
    THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM authenticated', r.proname, r.args);
    END IF;
  END LOOP;
END
$do$;