DROP POLICY IF EXISTS "user_roles insert admin only" ON public.user_roles;
CREATE POLICY "user_roles insert admin only"
ON public.user_roles
FOR INSERT
WITH CHECK (
  is_superadmin()
  OR (
    is_admin()
    AND get_user_center(user_id) = get_user_center(auth.uid())
    AND role::text <> 'superadmin'
  )
);

DROP POLICY IF EXISTS "user_roles update admin only" ON public.user_roles;
CREATE POLICY "user_roles update admin only"
ON public.user_roles
FOR UPDATE
USING (
  is_superadmin()
  OR (
    is_admin()
    AND get_user_center(user_id) = get_user_center(auth.uid())
    AND role::text <> 'superadmin'
  )
)
WITH CHECK (
  is_superadmin()
  OR (
    is_admin()
    AND get_user_center(user_id) = get_user_center(auth.uid())
    AND role::text <> 'superadmin'
  )
);