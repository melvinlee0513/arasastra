
CREATE OR REPLACE FUNCTION public.bulk_enroll_students(
  requested_class_id uuid,
  requested_student_user_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_center uuid;
  v_class_center uuid;
  v_is_super boolean;
  v_ids uuid[];
  v_newly int := 0;
  v_already int := 0;
  v_skipped_role int := 0;
  v_skipped_foreign int := 0;
  v_failed int := 0;
  v_id uuid;
  v_student_center uuid;
  v_has_role boolean;
  v_existing_status text;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF requested_class_id IS NULL THEN
    RAISE EXCEPTION 'class required' USING ERRCODE = '22023';
  END IF;

  v_is_super := public.is_superadmin();
  IF NOT (v_is_super OR public.is_admin()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT center_id INTO v_class_center FROM public.classes WHERE id = requested_class_id;
  IF v_class_center IS NULL THEN
    RAISE EXCEPTION 'class not found' USING ERRCODE = '22023';
  END IF;

  IF NOT v_is_super THEN
    SELECT center_id INTO v_caller_center FROM public.profiles WHERE user_id = v_caller LIMIT 1;
    IF v_caller_center IS NULL OR v_caller_center <> v_class_center THEN
      RAISE EXCEPTION 'foreign centre' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Deduplicate + drop nulls
  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::uuid[])
    INTO v_ids
    FROM unnest(COALESCE(requested_student_user_ids, ARRAY[]::uuid[])) AS t(x)
   WHERE x IS NOT NULL;

  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      SELECT center_id INTO v_student_center FROM public.profiles WHERE user_id = v_id LIMIT 1;
      IF v_student_center IS NULL OR v_student_center <> v_class_center THEN
        v_skipped_foreign := v_skipped_foreign + 1;
        CONTINUE;
      END IF;

      SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = v_id AND role = 'student'::public.app_role)
        INTO v_has_role;
      IF NOT v_has_role THEN
        v_skipped_role := v_skipped_role + 1;
        CONTINUE;
      END IF;

      SELECT status INTO v_existing_status
        FROM public.class_enrollments
       WHERE center_id = v_class_center
         AND class_id = requested_class_id
         AND student_user_id = v_id
       ORDER BY (status = 'active') DESC, enrolled_at DESC
       LIMIT 1;

      IF v_existing_status = 'active' THEN
        v_already := v_already + 1;
      ELSIF v_existing_status IS NOT NULL THEN
        UPDATE public.class_enrollments
           SET status = 'active', enrolled_by = v_caller, enrolled_at = now()
         WHERE center_id = v_class_center
           AND class_id = requested_class_id
           AND student_user_id = v_id
           AND status <> 'active';
        v_newly := v_newly + 1;
      ELSE
        INSERT INTO public.class_enrollments (center_id, class_id, student_user_id, enrolled_by, status)
        VALUES (v_class_center, requested_class_id, v_id, v_caller, 'active');
        v_newly := v_newly + 1;
      END IF;
    EXCEPTION WHEN unique_violation THEN
      v_already := v_already + 1;
    WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'class_id', requested_class_id,
    'requested', COALESCE(array_length(v_ids, 1), 0),
    'newly_enrolled', v_newly,
    'already_enrolled', v_already,
    'skipped_no_student_role', v_skipped_role,
    'skipped_foreign_center', v_skipped_foreign,
    'failed', v_failed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_enroll_students(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_enroll_students(uuid, uuid[]) TO authenticated;


CREATE OR REPLACE FUNCTION public.bulk_remove_students(
  requested_class_id uuid,
  requested_student_user_ids uuid[]
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_center uuid;
  v_class_center uuid;
  v_is_super boolean;
  v_ids uuid[];
  v_removed int := 0;
  v_not_enrolled int := 0;
  v_skipped_foreign int := 0;
  v_failed int := 0;
  v_id uuid;
  v_student_center uuid;
  v_updated int;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF requested_class_id IS NULL THEN
    RAISE EXCEPTION 'class required' USING ERRCODE = '22023';
  END IF;

  v_is_super := public.is_superadmin();
  IF NOT (v_is_super OR public.is_admin()) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT center_id INTO v_class_center FROM public.classes WHERE id = requested_class_id;
  IF v_class_center IS NULL THEN
    RAISE EXCEPTION 'class not found' USING ERRCODE = '22023';
  END IF;

  IF NOT v_is_super THEN
    SELECT center_id INTO v_caller_center FROM public.profiles WHERE user_id = v_caller LIMIT 1;
    IF v_caller_center IS NULL OR v_caller_center <> v_class_center THEN
      RAISE EXCEPTION 'foreign centre' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT x), ARRAY[]::uuid[])
    INTO v_ids
    FROM unnest(COALESCE(requested_student_user_ids, ARRAY[]::uuid[])) AS t(x)
   WHERE x IS NOT NULL;

  FOREACH v_id IN ARRAY v_ids LOOP
    BEGIN
      SELECT center_id INTO v_student_center FROM public.profiles WHERE user_id = v_id LIMIT 1;
      IF v_student_center IS NULL OR v_student_center <> v_class_center THEN
        v_skipped_foreign := v_skipped_foreign + 1;
        CONTINUE;
      END IF;

      UPDATE public.class_enrollments
         SET status = 'removed'
       WHERE center_id = v_class_center
         AND class_id = requested_class_id
         AND student_user_id = v_id
         AND status = 'active';
      GET DIAGNOSTICS v_updated = ROW_COUNT;

      IF v_updated > 0 THEN
        v_removed := v_removed + 1;
      ELSE
        v_not_enrolled := v_not_enrolled + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'class_id', requested_class_id,
    'requested', COALESCE(array_length(v_ids, 1), 0),
    'removed', v_removed,
    'not_enrolled', v_not_enrolled,
    'skipped_foreign_center', v_skipped_foreign,
    'failed', v_failed
  );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_remove_students(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_remove_students(uuid, uuid[]) TO authenticated;
