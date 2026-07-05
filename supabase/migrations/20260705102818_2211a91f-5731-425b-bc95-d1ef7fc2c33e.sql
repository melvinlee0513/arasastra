
ALTER FUNCTION public.handle_new_user_from_invite() SET search_path = public;
ALTER FUNCTION public.is_superadmin() SET search_path = public;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user_subscription() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user_from_invite() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.audit_trigger_func() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_updated_at() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;
REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
REVOKE ALL ON FUNCTION public.is_enrolled_in_class(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_enrolled_in_class(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.is_enrolled_in_subject(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_enrolled_in_subject(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.tutor_can_teach(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tutor_can_teach(uuid, uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_profile_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_id() TO authenticated;

DROP POLICY IF EXISTS "Anon can read pending invitations by token" ON public.invitations;

CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token uuid)
RETURNS TABLE (id uuid, email text, role text, center_id uuid, status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT i.id, i.email, i.role::text, i.center_id, i.status
  FROM public.invitations i
  WHERE i.id = _token AND i.status = 'pending'
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_invitation_by_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Authenticated can read course videos" ON storage.objects;
CREATE POLICY "Enrolled users or admins can read course videos"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'course-videos'
  AND (
    public.is_admin()
    OR public.has_role(auth.uid(), 'tutor'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.video_resources vr
      WHERE vr.video_url LIKE '%' || storage.objects.name || '%'
        AND (vr.class_id IS NULL OR public.is_enrolled_in_class(vr.class_id))
    )
  )
);

DROP POLICY IF EXISTS "Authenticated can view homework files" ON storage.objects;
CREATE POLICY "Owner or staff can view homework files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'homework'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR public.is_admin()
    OR public.has_role(auth.uid(), 'tutor'::public.app_role)
  )
);

DROP POLICY IF EXISTS "Authenticated can view notes files" ON storage.objects;
CREATE POLICY "Enrolled users or admins can view notes files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'notes'
  AND (
    public.is_admin()
    OR public.has_role(auth.uid(), 'tutor'::public.app_role)
    OR EXISTS (
      SELECT 1 FROM public.notes n
      WHERE n.file_url LIKE '%' || storage.objects.name || '%'
        AND (n.class_id IS NULL OR public.is_enrolled_in_class(n.class_id))
    )
  )
);

DROP POLICY IF EXISTS "Public can view cms assets" ON storage.objects;
CREATE POLICY "Anyone can read individual cms assets"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'cms-assets' AND name IS NOT NULL);
