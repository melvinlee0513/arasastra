-- Remove profile policies that can recursively traverse profiles during login.
DROP POLICY IF EXISTS "Admins can manage all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Tutors can view student profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Tenant isolation for profiles" ON public.profiles;

-- Helper: safe same-center comparison without exposing cross-tenant data.
CREATE OR REPLACE FUNCTION public.same_center_as_current_user(_center_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_center_id uuid;
BEGIN
  SELECT center_id
  FROM public.profiles
  WHERE user_id = auth.uid()
  LIMIT 1
  INTO caller_center_id;

  RETURN caller_center_id IS NOT NULL AND caller_center_id = _center_id;
END;
$$;

REVOKE ALL ON FUNCTION public.same_center_as_current_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.same_center_as_current_user(uuid) TO authenticated, service_role;

-- Non-recursive profile policies. Keep center-admin tenant scope, and keep
-- superadmin independent from center assignment.
CREATE POLICY "Users can read own profile"
  ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Superadmins can read all profiles"
  ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_superadmin());

CREATE POLICY "Center admins can read center profiles"
  ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin() AND public.same_center_as_current_user(center_id));

CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Superadmins can manage all profiles"
  ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

CREATE POLICY "Center admins can manage center profiles"
  ON public.profiles
  FOR ALL TO authenticated
  USING (public.is_admin() AND public.same_center_as_current_user(center_id))
  WITH CHECK (public.is_admin() AND public.same_center_as_current_user(center_id));