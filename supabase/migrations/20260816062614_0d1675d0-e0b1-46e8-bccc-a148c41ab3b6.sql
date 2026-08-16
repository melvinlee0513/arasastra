CREATE OR REPLACE FUNCTION public.enforce_profile_protected_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admins, superadmins and server-side roles may change anything.
  IF public.is_admin() OR public.is_superadmin() OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- A student editing their own profile may never change administrative or
  -- tenant/gamification fields, regardless of what the client sends.
  NEW.center_id          := OLD.center_id;
  NEW.plan_id            := OLD.plan_id;
  NEW.xp_points          := OLD.xp_points;
  NEW.lead_status        := OLD.lead_status;
  NEW.admin_remarks      := OLD.admin_remarks;
  NEW.assigned_tutor_id  := OLD.assigned_tutor_id;
  NEW.user_id            := OLD.user_id;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_profile_protected_columns() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS profiles_protect_admin_columns ON public.profiles;
CREATE TRIGGER profiles_protect_admin_columns
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.enforce_profile_protected_columns();