-- Remove legacy, over-permissive invitation policies. These granted every
-- authenticated member of a centre (students included) full read/write access
-- to invitations, allowing invite-token theft and admin-role forgery.
DROP POLICY IF EXISTS "Users can view invitations for their center" ON public.invitations;
DROP POLICY IF EXISTS "Users can insert invitations for their center" ON public.invitations;
DROP POLICY IF EXISTS "Users can update invitations for their center" ON public.invitations;
DROP POLICY IF EXISTS "Users can delete invitations for their center" ON public.invitations;
DROP POLICY IF EXISTS "Tenant isolation for invitations" ON public.invitations;
DROP POLICY IF EXISTS "Admins can manage center invitations" ON public.invitations;

-- Single canonical rule: centre admins (and superadmins) manage invitations for
-- their own centre only. Anonymous invite redemption continues to work through
-- the SECURITY DEFINER routines (get_invitation_by_token / claim_invitation_for_signup).
CREATE POLICY "invitations admin manage same center"
  ON public.invitations
  FOR ALL
  TO authenticated
  USING (
    public.is_superadmin()
    OR (public.is_admin() AND center_id = public.get_user_center(auth.uid()))
  )
  WITH CHECK (
    public.is_superadmin()
    OR (public.is_admin() AND center_id = public.get_user_center(auth.uid()))
  );

REVOKE ALL ON public.invitations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;