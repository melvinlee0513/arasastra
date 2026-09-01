-- ═══════════════════════════════════════════════════════════════════════════
-- Question Bank: resolve the caller's centre the way the rest of the app does.
--
-- `_my_question_bank_center()` opened with
--
--     SELECT r.center_id FROM public.user_roles r
--      WHERE r.user_id = auth.uid() AND r.role IN ('admin','superadmin')
--        AND r.center_id IS NOT NULL
--
-- and `public.user_roles` has no `center_id` column. Production's user_roles is
-- (id, user_id, role, created_at) — confirmed against the generated
-- src/integrations/supabase/types.ts, which is produced from the live database.
--
-- Because that is the FIRST statement in the body, plpgsql fails to plan it on
-- every invocation, so the error is not confined to admins: every Question Bank
-- RPC resolves its centre through this function, so all thirteen of them raise
-- `column r.center_id does not exist` for every role. The Question Bank was
-- entirely non-functional in production, not partially.
--
-- The test fixture had invented a `user_roles.center_id` column, which is why
-- this passed 206 assertions while being unable to run at all. The fixture now
-- mirrors production and reproduces the failure.
--
-- ─── The fix ───────────────────────────────────────────────────────────────
-- This app already has one canonical answer to "which centre is this user in":
--
--     public.get_user_center(_user_id DEFAULT auth.uid())   -- 20260706172344
--       → profiles.center_id
--
-- and `_admin_can_manage_center` (20260717111646) already reads the same
-- column. So the correct fix is not to add a column to user_roles — that would
-- introduce a second, competing source of truth for tenant membership — but to
-- use the resolver the rest of the app uses.
--
-- Tutors keep their class-based fallback, because a tutor account whose profile
-- carries no centre still legitimately teaches classes that belong to one.
--
-- Authorisation is unchanged and still lives in `_can_use_question_bank`, which
-- this function now delegates to rather than re-deciding. That function was
-- always correct: it reads `_admin_can_manage_center` and `class_tutors`, never
-- `user_roles`.
--
-- Additive. Replaces one function body. No table, column, policy, grant or row
-- is changed.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._my_question_bank_center()
RETURNS uuid
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501';
  END IF;

  -- The canonical resolver: profiles.center_id. Covers admins, tutors and
  -- anyone else whose profile records a centre.
  v_id := public.get_user_center();

  -- A tutor whose profile has no centre still teaches classes that belong to
  -- one. Never trusted for authorisation — only to name a candidate centre,
  -- which _can_use_question_bank then has to agree with.
  IF v_id IS NULL THEN
    SELECT c.center_id INTO v_id
      FROM public.class_tutors ct
      JOIN public.classes c ON c.id = ct.class_id
     WHERE ct.tutor_user_id = auth.uid()
     LIMIT 1;
  END IF;

  IF v_id IS NULL THEN
    RAISE EXCEPTION 'no_question_bank_access' USING ERRCODE = '42501';
  END IF;

  -- Checked before the authorisation predicate purely so an operator reading a
  -- log can tell "this centre is not in the pilot" apart from "this user may
  -- not use the bank". _can_use_question_bank re-checks it, so the two can
  -- never disagree.
  IF NOT public.tenant_feature_enabled(v_id, 'questionBank', false) THEN
    RAISE EXCEPTION 'feature_disabled: questionBank' USING ERRCODE = '42501';
  END IF;

  -- The single authorisation decision, shared with the bank's RLS policies.
  -- A student's profile names a centre just as a tutor's does, so without this
  -- the resolver would happily hand a student their centre's bank.
  --
  -- A superadmin passes for whatever centre their profile names, which is the
  -- existing semantics of _admin_can_manage_center. A superadmin with no centre
  -- on their profile and no class gets no_question_bank_access: the bank is a
  -- centre-scoped resource and there is no basis to pick one for them.
  IF NOT public._can_use_question_bank(v_id) THEN
    RAISE EXCEPTION 'no_question_bank_access' USING ERRCODE = '42501';
  END IF;

  RETURN v_id;
END $$;

COMMENT ON FUNCTION public._my_question_bank_center() IS
  'Resolves the caller''s Question Bank centre from profiles.center_id via '
  'get_user_center(), falling back to the centre of a class they tutor. '
  'Authorisation is delegated to _can_use_question_bank, which the bank''s RLS '
  'policies also call. Do NOT reintroduce a user_roles.center_id lookup: that '
  'column does not exist, and a second source of tenant membership would be a '
  'competing truth rather than a fix.';

-- Internal helper. It is called by the bank's SECURITY DEFINER RPCs as the
-- owner, so nothing legitimate needs the grant — and 20260901095939 established
-- exactly this posture for the other internal helpers.
REVOKE ALL ON FUNCTION public._my_question_bank_center() FROM PUBLIC, anon, authenticated;

-- Prove the fix in the same transaction that made it: the old body could not be
-- planned at all, so a body that still references the missing column would fail
-- here rather than at a tutor's first click.
DO $$
DECLARE v_src text;
BEGIN
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = '_my_question_bank_center';

  IF v_src IS NULL THEN
    RAISE EXCEPTION '_my_question_bank_center is missing after replacement';
  END IF;
  IF v_src LIKE '%user_roles%' THEN
    RAISE EXCEPTION
      '_my_question_bank_center still reads user_roles, which has no center_id';
  END IF;
  IF v_src NOT LIKE '%get_user_center%' THEN
    RAISE EXCEPTION
      '_my_question_bank_center does not use the canonical get_user_center()';
  END IF;
  IF has_function_privilege('authenticated', 'public._my_question_bank_center()', 'EXECUTE') THEN
    RAISE EXCEPTION '_my_question_bank_center is still executable by authenticated';
  END IF;
END $$;