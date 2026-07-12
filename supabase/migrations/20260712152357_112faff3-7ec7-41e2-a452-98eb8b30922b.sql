
-- 1) Columns
ALTER TABLE public.invitations
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS used_at    timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

-- Backfill existing rows: 72h from creation.
UPDATE public.invitations
SET expires_at = COALESCE(expires_at, created_at + interval '72 hours');

-- Default for new rows.
ALTER TABLE public.invitations
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '72 hours');

ALTER TABLE public.invitations
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS invitations_email_center_pending_idx
  ON public.invitations (lower(email), center_id)
  WHERE status = 'pending' AND used_at IS NULL AND revoked_at IS NULL;

-- 2) Harden get_invitation_by_token
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(_token uuid)
RETURNS TABLE(id uuid, email text, role text, center_id uuid, status text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT i.id, i.email, i.role::text, i.center_id, i.status
  FROM public.invitations i
  WHERE i.id = _token
    AND i.status = 'pending'
    AND i.used_at IS NULL
    AND i.revoked_at IS NULL
    AND i.expires_at > now()
  LIMIT 1;
$$;

-- 3) Harden get_invite_redirect (same freshness checks; still minimal payload)
CREATE OR REPLACE FUNCTION public.get_invite_redirect(_token uuid)
RETURNS TABLE(subdomain_slug text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.subdomain_slug
  FROM public.invitations i
  JOIN public.tuition_centers c
    ON c.id = i.center_id AND c.domain_status = 'active'
  WHERE i.id = _token
    AND i.status = 'pending'
    AND i.used_at IS NULL
    AND i.revoked_at IS NULL
    AND i.expires_at > now()
  LIMIT 1;
$$;

-- 4) Mark invitation used on signup (replace the older 'accepted' behaviour).
CREATE OR REPLACE FUNCTION public.handle_new_user_bulletproof()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_meta         jsonb := COALESCE(NEW.raw_user_meta_data, '{}'::jsonb);
  v_full_name    text;
  v_role_text    text;
  v_role         public.app_role;
  v_center_id    uuid;
  v_invite_token uuid;
  v_invite       RECORD;
BEGIN
  v_full_name := NULLIF(TRIM(COALESCE(v_meta->>'full_name', '')), '');
  v_role_text := NULLIF(TRIM(COALESCE(v_meta->>'role', '')), '');

  BEGIN v_center_id := NULLIF(v_meta->>'center_id','')::uuid;
  EXCEPTION WHEN others THEN v_center_id := NULL; END;
  BEGIN v_invite_token := NULLIF(v_meta->>'invite_token','')::uuid;
  EXCEPTION WHEN others THEN v_invite_token := NULL; END;

  IF v_invite_token IS NOT NULL THEN
    SELECT * INTO v_invite
    FROM public.invitations
    WHERE id = v_invite_token
      AND status = 'pending'
      AND used_at IS NULL
      AND revoked_at IS NULL
      AND expires_at > now()
    LIMIT 1;

    IF FOUND THEN
      v_role_text := COALESCE(v_role_text, v_invite.role);
      v_center_id := COALESCE(v_center_id, v_invite.center_id);
    ELSE
      -- Invalid/expired/used/revoked token: ignore it silently, do not attach centre.
      v_invite_token := NULL;
    END IF;
  END IF;

  BEGIN v_role := COALESCE(v_role_text,'student')::public.app_role;
  EXCEPTION WHEN others THEN v_role := 'student'::public.app_role; END;

  v_full_name := COALESCE(v_full_name, split_part(NEW.email,'@',1), 'Member');

  IF v_center_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, user_id, email, full_name, center_id, is_registered)
    VALUES (NEW.id, NEW.id, NEW.email, v_full_name, v_center_id, true)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.subscriptions (user_id, plan_name, status)
  VALUES (NEW.id, 'Free Tier', 'inactive')
  ON CONFLICT DO NOTHING;

  IF v_invite_token IS NOT NULL THEN
    UPDATE public.invitations
    SET status = 'accepted',
        used_at = now()
    WHERE id = v_invite_token
      AND used_at IS NULL
      AND revoked_at IS NULL
      AND status = 'pending';
  END IF;

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'handle_new_user_bulletproof failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- 5) Revoke RPC (tenant admin / superadmin, within their own scope)
CREATE OR REPLACE FUNCTION public.revoke_invitation(_invitation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_center uuid;
  v_caller_center uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;

  SELECT center_id INTO v_center FROM public.invitations
  WHERE id = _invitation_id
    AND status = 'pending'
    AND used_at IS NULL
    AND revoked_at IS NULL
  LIMIT 1;

  IF v_center IS NULL THEN RETURN false; END IF;

  IF public.is_superadmin() THEN
    -- allowed
    NULL;
  ELSE
    IF NOT public.is_admin() THEN RETURN false; END IF;
    SELECT center_id INTO v_caller_center FROM public.profiles WHERE user_id = auth.uid();
    IF v_caller_center IS DISTINCT FROM v_center THEN RETURN false; END IF;
  END IF;

  UPDATE public.invitations
  SET status = 'revoked',
      revoked_at = now()
  WHERE id = _invitation_id;

  RETURN true;
END;
$$;

-- 6) Permissions
REVOKE ALL ON FUNCTION public.get_invitation_by_token(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.get_invite_redirect(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_invite_redirect(uuid) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.revoke_invitation(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.revoke_invitation(uuid) TO authenticated;
