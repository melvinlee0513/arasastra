-- Fix recursive RLS evaluation in role/profile helpers.
-- SQL-language SECURITY DEFINER helpers can be inlined by the planner; using
-- plpgsql prevents profile/user_roles policies from recursively expanding.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_requested_role boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
  INTO has_requested_role;

  RETURN COALESCE(has_requested_role, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.has_role(auth.uid(), 'superadmin'::public.app_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.has_role(auth.uid(), 'admin'::public.app_role)
      OR public.has_role(auth.uid(), 'superadmin'::public.app_role);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_user_center(_user_id uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resolved_center_id uuid;
BEGIN
  SELECT center_id
  FROM public.profiles
  WHERE user_id = _user_id
  LIMIT 1
  INTO resolved_center_id;

  RETURN resolved_center_id;
END;
$$;

-- Keep function access explicit for the Data API roles used by the app.
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_user_center(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_center(uuid) TO authenticated, service_role;

-- Replace recursive profile/user role tenant policies with helper-based checks.
DROP POLICY IF EXISTS "Tenant isolation for profiles" ON public.profiles;
CREATE POLICY "Tenant isolation for profiles"
  ON public.profiles AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_superadmin()
    OR (center_id IS NOT NULL AND center_id = public.get_user_center(auth.uid()))
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_superadmin()
    OR (center_id IS NOT NULL AND center_id = public.get_user_center(auth.uid()))
  );

DROP POLICY IF EXISTS "Tenant isolation for user_roles" ON public.user_roles;
CREATE POLICY "Tenant isolation for user_roles"
  ON public.user_roles AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_superadmin()
    OR public.get_user_center(user_id) = public.get_user_center(auth.uid())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.is_superadmin()
    OR public.get_user_center(user_id) = public.get_user_center(auth.uid())
  );