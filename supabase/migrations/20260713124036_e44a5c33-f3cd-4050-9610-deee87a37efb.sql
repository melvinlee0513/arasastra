
-- 1. Rebuild user_roles RLS so no permissive policy grants self-insert.
DROP POLICY IF EXISTS "Allow read access to user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Only admins can manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "Tenant isolation for user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;

-- Read: user sees own roles; admins see roles in their centre; superadmin sees all.
CREATE POLICY "user_roles read own or admin same centre"
ON public.user_roles FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_superadmin()
  OR (public.is_admin() AND public.get_user_center(user_id) = public.get_user_center(auth.uid()))
);

-- Write: only superadmin or same-centre admin may modify roles. Never self-grant.
CREATE POLICY "user_roles insert admin only"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  public.is_superadmin()
  OR (public.is_admin() AND public.get_user_center(user_id) = public.get_user_center(auth.uid()))
);

CREATE POLICY "user_roles update admin only"
ON public.user_roles FOR UPDATE TO authenticated
USING (
  public.is_superadmin()
  OR (public.is_admin() AND public.get_user_center(user_id) = public.get_user_center(auth.uid()))
)
WITH CHECK (
  public.is_superadmin()
  OR (public.is_admin() AND public.get_user_center(user_id) = public.get_user_center(auth.uid()))
);

CREATE POLICY "user_roles delete admin only"
ON public.user_roles FOR DELETE TO authenticated
USING (
  public.is_superadmin()
  OR (public.is_admin() AND public.get_user_center(user_id) = public.get_user_center(auth.uid()))
);

-- 2. Revoke anon EXECUTE on role-management RPCs (defense in depth).
REVOKE EXECUTE ON FUNCTION public.assign_tutor_role(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.revoke_tutor_role(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_tutor_role(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_tutor_role(uuid) TO authenticated;
