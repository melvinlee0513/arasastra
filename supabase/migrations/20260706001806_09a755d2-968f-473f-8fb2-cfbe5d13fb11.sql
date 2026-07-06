
-- Drop legacy triggers on auth.users that reference public.handle_new_user / handle_new_user_from_invite
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user ON auth.users;
DROP TRIGGER IF EXISTS handle_new_user_from_invite ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;

-- Replace the buggy handler with a bulletproof version
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
  -- Safely extract metadata
  v_full_name := NULLIF(TRIM(COALESCE(v_meta->>'full_name', '')), '');
  v_role_text := NULLIF(TRIM(COALESCE(v_meta->>'role', '')), '');

  BEGIN
    v_center_id := NULLIF(v_meta->>'center_id', '')::uuid;
  EXCEPTION WHEN others THEN
    v_center_id := NULL;
  END;

  BEGIN
    v_invite_token := NULLIF(v_meta->>'invite_token', '')::uuid;
  EXCEPTION WHEN others THEN
    v_invite_token := NULL;
  END;

  -- If an invite token is present, prefer authoritative values from the invitation row
  IF v_invite_token IS NOT NULL THEN
    SELECT * INTO v_invite
    FROM public.invitations
    WHERE id = v_invite_token
    LIMIT 1;

    IF FOUND THEN
      v_role_text := COALESCE(v_role_text, v_invite.role);
      v_center_id := COALESCE(v_center_id, v_invite.center_id);
    END IF;
  END IF;

  -- Coerce role text -> app_role enum, defaulting to 'student'
  BEGIN
    v_role := COALESCE(v_role_text, 'student')::public.app_role;
  EXCEPTION WHEN others THEN
    v_role := 'student'::public.app_role;
  END;

  -- Ensure required NOT NULL columns have safe fallbacks
  v_full_name := COALESCE(v_full_name, split_part(NEW.email, '@', 1), 'Member');

  -- Insert profile (profiles has no 'role' column — role goes to user_roles)
  IF v_center_id IS NOT NULL THEN
    INSERT INTO public.profiles (id, user_id, email, full_name, center_id, is_registered)
    VALUES (NEW.id, NEW.id, NEW.email, v_full_name, v_center_id, true)
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Record role in user_roles (canonical location)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, v_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Auto-provision a Free Tier subscription row (mirrors legacy handle_new_user_subscription)
  INSERT INTO public.subscriptions (user_id, plan_name, status)
  VALUES (NEW.id, 'Free Tier', 'inactive')
  ON CONFLICT DO NOTHING;

  -- Consume the invitation
  IF v_invite_token IS NOT NULL THEN
    UPDATE public.invitations
    SET status = 'accepted'
    WHERE id = v_invite_token
      AND status = 'pending';
  END IF;

  RETURN NEW;

EXCEPTION WHEN others THEN
  -- Never block auth.users insert; log via NOTICE for diagnostics
  RAISE WARNING 'handle_new_user_bulletproof failed for %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Re-create the trigger
DROP TRIGGER IF EXISTS handle_new_user_bulletproof ON auth.users;
CREATE TRIGGER handle_new_user_bulletproof
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_bulletproof();
