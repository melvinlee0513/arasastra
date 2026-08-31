CREATE OR REPLACE FUNCTION public.profiles_block_client_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Server-side routines (auth.uid() IS NULL) and admins may insert profiles.
  IF auth.uid() IS NULL OR public.is_admin() OR public.is_superadmin() THEN
    RETURN NEW;
  END IF;
  -- Ordinary users may not create profile rows: this was the remaining path to
  -- self-assign center_id / plan_id / lead_status and escalate tenant access.
  RAISE EXCEPTION 'profile_insert_not_allowed' USING ERRCODE = '42501';
END;
$function$;

DROP TRIGGER IF EXISTS profiles_block_client_insert_trg ON public.profiles;
CREATE TRIGGER profiles_block_client_insert_trg
BEFORE INSERT ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.profiles_block_client_insert();

REVOKE ALL ON FUNCTION public.profiles_block_client_insert() FROM anon, authenticated;