
-- 1. Relax non-null author fields so we can preserve centre-owned content.
ALTER TABLE public.class_announcements ALTER COLUMN author_user_id DROP NOT NULL;
ALTER TABLE public.admin_audit_log ALTER COLUMN admin_id DROP NOT NULL;
ALTER TABLE public.video_resources ALTER COLUMN created_by DROP NOT NULL;

-- 2. Repoint FKs to auth.users so deleting an auth user does not nuke centre content.
ALTER TABLE public.video_resources DROP CONSTRAINT IF EXISTS video_resources_created_by_fkey;
ALTER TABLE public.video_resources
  ADD CONSTRAINT video_resources_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.classes DROP CONSTRAINT IF EXISTS classes_cover_image_updated_by_fkey;
ALTER TABLE public.classes
  ADD CONSTRAINT classes_cover_image_updated_by_fkey
  FOREIGN KEY (cover_image_updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.content_versions DROP CONSTRAINT IF EXISTS content_versions_updated_by_fkey;
ALTER TABLE public.content_versions
  ADD CONSTRAINT content_versions_updated_by_fkey
  FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.admin_audit_log DROP CONSTRAINT IF EXISTS admin_audit_log_admin_id_fkey;
ALTER TABLE public.admin_audit_log
  ADD CONSTRAINT admin_audit_log_admin_id_fkey
  FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. Deletion job tracking table.
CREATE TABLE IF NOT EXISTS public.user_deletion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id uuid NOT NULL,
  target_center_id uuid,
  target_email_hash text,
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  current_step text,
  completed_at timestamptz,
  failure_category text,
  retry_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.user_deletion_jobs TO authenticated;
GRANT ALL ON public.user_deletion_jobs TO service_role;

ALTER TABLE public.user_deletion_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Superadmins can see all deletion jobs"
  ON public.user_deletion_jobs FOR SELECT TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Admins can see jobs they requested"
  ON public.user_deletion_jobs FOR SELECT TO authenticated
  USING (requested_by = auth.uid());

CREATE OR REPLACE FUNCTION public._user_deletion_jobs_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_deletion_jobs_touch ON public.user_deletion_jobs;
CREATE TRIGGER user_deletion_jobs_touch
  BEFORE UPDATE ON public.user_deletion_jobs
  FOR EACH ROW EXECUTE FUNCTION public._user_deletion_jobs_touch();

-- 4. Core deletion helper. Runs with elevated privileges but re-checks the
-- calling identity via auth.uid() and enforces the full permission matrix.
CREATE OR REPLACE FUNCTION public.admin_delete_user_account(_target uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller uuid := auth.uid();
  v_caller_center uuid;
  v_target_center uuid;
  v_avatar_path text;
  v_target_email text;
  v_target_is_super boolean;
  v_target_is_admin boolean;
  v_caller_is_super boolean;
  v_caller_is_admin boolean;
  v_super_count integer;
  v_storage_paths jsonb := '[]'::jsonb;
BEGIN
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501';
  END IF;
  IF _target IS NULL THEN
    RAISE EXCEPTION 'target required' USING ERRCODE = '22023';
  END IF;
  IF _target = v_caller THEN
    RAISE EXCEPTION 'cannot delete your own account' USING ERRCODE = '42501';
  END IF;

  v_caller_is_super := public.is_superadmin();
  v_caller_is_admin := public.is_admin();
  IF NOT (v_caller_is_super OR v_caller_is_admin) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _target AND role = 'superadmin'::public.app_role)
    INTO v_target_is_super;
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _target AND role = 'admin'::public.app_role)
    INTO v_target_is_admin;

  IF v_target_is_super THEN
    RAISE EXCEPTION 'superadmins cannot be deleted via this flow' USING ERRCODE = '42501';
  END IF;

  IF v_target_is_admin AND NOT v_caller_is_super THEN
    RAISE EXCEPTION 'only a superadmin may delete a tenant admin' USING ERRCODE = '42501';
  END IF;

  SELECT p.center_id, p.avatar_path, p.email
    INTO v_target_center, v_avatar_path, v_target_email
    FROM public.profiles p WHERE p.user_id = _target LIMIT 1;

  IF NOT v_caller_is_super THEN
    SELECT center_id INTO v_caller_center FROM public.profiles WHERE user_id = v_caller LIMIT 1;
    IF v_caller_center IS NULL OR v_target_center IS NULL OR v_caller_center <> v_target_center THEN
      RAISE EXCEPTION 'target is in a different centre' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Defensive: final active superadmin check (should never trip here because
  -- superadmins are already rejected above, but keep it explicit).
  IF v_target_is_super THEN
    SELECT count(*) INTO v_super_count FROM public.user_roles WHERE role = 'superadmin'::public.app_role;
    IF v_super_count <= 1 THEN
      RAISE EXCEPTION 'cannot delete the final superadmin' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Collect storage paths the caller (edge function) should remove after commit.
  IF v_avatar_path IS NOT NULL THEN
    v_storage_paths := v_storage_paths ||
      jsonb_build_array(jsonb_build_object('bucket', 'avatars', 'path', v_avatar_path));
  END IF;

  -- 5. Preserve centre-owned content by anonymising personal attribution.
  UPDATE public.class_announcements SET author_user_id = NULL WHERE author_user_id = _target;
  UPDATE public.class_resources     SET uploaded_by    = NULL WHERE uploaded_by    = _target;
  UPDATE public.classes             SET created_by     = NULL WHERE created_by     = _target;
  UPDATE public.classes             SET cover_image_updated_by = NULL WHERE cover_image_updated_by = _target;
  UPDATE public.quizzes             SET created_by     = NULL WHERE created_by     = _target;
  UPDATE public.flashcard_decks     SET created_by     = NULL WHERE created_by     = _target;
  UPDATE public.class_about         SET updated_by     = NULL WHERE updated_by     = _target;
  UPDATE public.notes               SET uploaded_by    = NULL WHERE uploaded_by    = _target;
  UPDATE public.class_enrollments   SET enrolled_by    = NULL WHERE enrolled_by    = _target;
  UPDATE public.invitations         SET invited_by     = NULL WHERE invited_by     = _target;
  UPDATE public.admin_audit_log     SET admin_id       = NULL WHERE admin_id       = _target;
  UPDATE public.audit_logs          SET changed_by     = NULL WHERE changed_by     = _target;
  UPDATE public.content_versions    SET updated_by     = NULL WHERE updated_by     = _target;
  UPDATE public.video_resources     SET created_by     = NULL WHERE created_by     = _target;

  -- 6. Remove membership and personal activity records.
  DELETE FROM public.class_enrollments       WHERE student_user_id = _target;
  DELETE FROM public.class_tutors            WHERE tutor_user_id  = _target;
  DELETE FROM public.tutor_connected_accounts WHERE tutor_user_id  = _target;
  DELETE FROM public.announcement_reads      WHERE student_user_id = _target;
  DELETE FROM public.student_streaks         WHERE student_user_id = _target;
  DELETE FROM public.student_xp_events       WHERE student_user_id = _target;
  DELETE FROM public.flashcard_progress      WHERE user_id         = _target;
  DELETE FROM public.quiz_attempts           WHERE user_id         = _target;
  DELETE FROM public.video_comments          WHERE user_id         = _target;
  DELETE FROM public.parent_student_links
    WHERE student_profile_id IN (SELECT id FROM public.profiles WHERE user_id = _target);
  -- Detach the legacy tutors row if present (kept for historical assignments).
  UPDATE public.tutors SET user_id = NULL, is_active = false WHERE user_id = _target;

  -- Purge pending/revoked invitations for the target's email so a re-invite is clean.
  IF v_target_email IS NOT NULL THEN
    DELETE FROM public.invitations
      WHERE lower(email) = lower(v_target_email)
        AND status IN ('pending','revoked');
  END IF;

  -- 7. Membership + identity rows. Remaining CASCADE FKs on auth.users
  -- (profiles, user_roles, subscriptions, attendance, notifications,
  -- payment_submissions, quiz_results→student_quiz_answers, submissions,
  -- auth.sessions, auth.identities, etc.) are cleaned up automatically when
  -- the edge function deletes the auth.users row.
  DELETE FROM public.user_roles WHERE user_id = _target;

  RETURN jsonb_build_object(
    'target_user_id', _target,
    'target_center_id', v_target_center,
    'storage_paths', v_storage_paths
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_delete_user_account(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_account(uuid) TO service_role;
