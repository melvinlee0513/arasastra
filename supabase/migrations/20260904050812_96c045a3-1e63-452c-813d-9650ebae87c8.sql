ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS email_message_id uuid,
  ADD COLUMN IF NOT EXISTS email_queued_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_send_error text,
  ADD COLUMN IF NOT EXISTS resend_count integer NOT NULL DEFAULT 0;

DROP FUNCTION IF EXISTS public.list_center_invitations(uuid);

CREATE FUNCTION public.list_center_invitations(_center_id uuid)
RETURNS TABLE (
  id uuid,
  email text,
  role text,
  status text,
  created_at timestamptz,
  expires_at timestamptz,
  used_at timestamptz,
  revoked_at timestamptz,
  invited_by uuid,
  invited_by_name text,
  auth_account_created boolean,
  email_verified boolean,
  profile_created boolean,
  role_assigned boolean,
  accepted_at timestamptz,
  email_queued_at timestamptz,
  email_failed_at timestamptz,
  last_send_error text,
  resend_count integer,
  email_delivery_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public._admin_can_manage_center(_center_id) THEN
    RAISE EXCEPTION 'not authorised' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    i.id,
    i.email,
    i.role::text,
    i.status,
    i.created_at,
    i.expires_at,
    i.used_at,
    i.revoked_at,
    i.invited_by,
    p_inv.full_name AS invited_by_name,
    (u.id IS NOT NULL) AS auth_account_created,
    (u.email_confirmed_at IS NOT NULL) AS email_verified,
    (p_target.id IS NOT NULL) AS profile_created,
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = u.id
        AND ur.role::text = i.role
    ) AS role_assigned,
    i.used_at AS accepted_at,
    i.email_queued_at,
    i.email_failed_at,
    i.last_send_error,
    i.resend_count,
    (
      SELECT l.status
      FROM public.email_send_log l
      WHERE i.email_message_id IS NOT NULL
        AND l.message_id = i.email_message_id::text
      ORDER BY l.created_at DESC
      LIMIT 1
    ) AS email_delivery_status
  FROM public.invitations i
  LEFT JOIN auth.users u ON lower(u.email) = lower(i.email)
  LEFT JOIN public.profiles p_target ON p_target.user_id = u.id
  LEFT JOIN public.profiles p_inv ON p_inv.user_id = i.invited_by
  WHERE i.center_id = _center_id
  ORDER BY i.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.list_center_invitations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_center_invitations(uuid) TO authenticated, service_role;