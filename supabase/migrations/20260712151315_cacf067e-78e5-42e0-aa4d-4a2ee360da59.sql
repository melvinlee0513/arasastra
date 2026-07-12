
-- 1. Email → generic routing hint (no center_id, no is_superadmin exposure)
DROP FUNCTION IF EXISTS public.get_signin_redirect_for_email(text);
CREATE OR REPLACE FUNCTION public.get_signin_redirect_for_email(_email text)
RETURNS TABLE(destination text, subdomain_slug text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(_email));
  v_user_id uuid;
  v_center_id uuid;
  v_slug text;
  v_super boolean := false;
BEGIN
  -- Always return exactly one row so anonymous callers cannot distinguish
  -- "no such user" from other outcomes via row count.
  IF v_email IS NULL OR v_email = '' OR length(v_email) > 320 THEN
    RETURN QUERY SELECT 'hq'::text, NULL::text;
    RETURN;
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email LIMIT 1;

  IF v_user_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.user_roles
      WHERE user_id = v_user_id AND role = 'superadmin'::public.app_role
    ) INTO v_super;
    SELECT p.center_id INTO v_center_id
    FROM public.profiles p WHERE p.user_id = v_user_id LIMIT 1;
  END IF;

  IF v_center_id IS NULL THEN
    SELECT i.center_id INTO v_center_id
    FROM public.invitations i
    WHERE lower(i.email) = v_email AND i.status = 'pending'
    ORDER BY i.created_at DESC NULLS LAST LIMIT 1;
  END IF;

  IF v_center_id IS NOT NULL THEN
    SELECT c.subdomain_slug INTO v_slug
    FROM public.tuition_centers c
    WHERE c.id = v_center_id AND c.domain_status = 'active' LIMIT 1;
  END IF;

  -- Superadmins are never routed to a tenant subdomain by this helper, even
  -- if they also happen to belong to a centre — they stay on HQ.
  IF v_super OR v_slug IS NULL THEN
    RETURN QUERY SELECT 'hq'::text, NULL::text;
  ELSE
    RETURN QUERY SELECT 'tenant'::text, v_slug;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.get_signin_redirect_for_email(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_signin_redirect_for_email(text) TO anon, authenticated;

-- 2. Invite token → tenant slug only (no center_id in public response)
DROP FUNCTION IF EXISTS public.get_invite_redirect(uuid);
CREATE OR REPLACE FUNCTION public.get_invite_redirect(_token uuid)
RETURNS TABLE(subdomain_slug text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT c.subdomain_slug
  FROM public.invitations i
  JOIN public.tuition_centers c
    ON c.id = i.center_id AND c.domain_status = 'active'
  WHERE i.id = _token AND i.status = 'pending'
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.get_invite_redirect(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_invite_redirect(uuid) TO anon, authenticated;
