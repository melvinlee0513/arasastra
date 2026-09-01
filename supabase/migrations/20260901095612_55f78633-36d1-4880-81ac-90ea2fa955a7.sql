-- ═══════════════════════════════════════════════════════════════════════════
-- Answer keys: back to least privilege.
--
-- 20260831000000 WIDENED access to quiz_options, on a premise I did not check.
--
-- It reasoned that `authenticated` held table-level SELECT (granted
-- 20260707023326, and again 20260718074806) and that the fix was to revoke
-- that and grant back every column except `is_correct`. But 20260813072502
-- had already done the stronger thing, three weeks earlier:
--
--   REVOKE ALL ON TABLE public.quiz_questions FROM anon, authenticated;
--   REVOKE ALL ON TABLE public.quiz_options   FROM anon, authenticated;
--
-- and nothing re-granted it. So `authenticated` held NOTHING on either table,
-- the direct read that migration set out to close was already shut, and its
-- column-level GRANT handed back SELECT on every column except is_correct — a
-- privilege the role had not had since August. It looked like a real leak
-- because the fixture it was proven against granted the table itself: the
-- harness was permissive, not production.
--
-- Nothing outside the database reads either table directly — there is no
-- `from("quiz_options")` or `from("quiz_questions")` anywhere in the client —
-- so the correct privilege is none, for every column, including the four
-- answer-key columns Phase 5 added to quiz_questions.
--
-- The companion fix — get_quiz_result never learned those Phase 5 keys — is
-- 20260905000100, kept separate because a privilege change and a function
-- change have no reason to share a transaction.
-- ═══════════════════════════════════════════════════════════════════════════

-- Both roles, both tables, every privilege. Idempotent, and correct whether or
-- not the deployment still carries the July grants or the August revoke.
REVOKE ALL ON TABLE public.quiz_questions FROM anon, authenticated;
REVOKE ALL ON TABLE public.quiz_options   FROM anon, authenticated;

-- Prove it took, in the same transaction that made the change. A revoke that
-- silently no-ops is exactly how the last one went wrong.
DO $$
DECLARE
  v_role text;
  v_priv text;
  v_left text;
BEGIN
  FOREACH v_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH v_priv IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      IF has_table_privilege(v_role, 'public.quiz_questions', v_priv)
         OR has_table_privilege(v_role, 'public.quiz_options', v_priv) THEN
        RAISE EXCEPTION '% still holds % on a quiz answer-key table', v_role, v_priv;
      END IF;
    END LOOP;
  END LOOP;

  -- A COLUMN grant is invisible to has_table_privilege. That is precisely how
  -- the last widening went unnoticed, so it is checked separately — and against
  -- the catalogue rather than a written-out column list, so a key column added
  -- later is covered without anyone remembering to add it here.
  SELECT string_agg(DISTINCT table_name || '.' || column_name || ' -> ' || grantee, ', ')
    INTO v_left
    FROM information_schema.column_privileges
   WHERE table_schema = 'public'
     AND table_name IN ('quiz_questions', 'quiz_options')
     AND grantee IN ('anon', 'authenticated');
  IF v_left IS NOT NULL THEN
    RAISE EXCEPTION 'column privileges survive on the answer-key tables: %', v_left;
  END IF;
END $$;

COMMENT ON TABLE public.quiz_options IS
  'Answer key. NO privilege is granted to anon or authenticated: every read and '
  'write goes through a SECURITY DEFINER function that has already decided the '
  'caller may see or change it. Granting this table to authenticated — even a '
  'single column — re-opens a direct read for every user whose RLS policy '
  'admits the row.';

COMMENT ON TABLE public.quiz_questions IS
  'Carries answer keys in correct_answer, explanation, accepted_answers, '
  'numeric_answer and numeric_tolerance. NO privilege is granted to anon or '
  'authenticated; the RLS policies on this table exist for the SECURITY '
  'INVOKER paths that no longer have any grant to use them.';