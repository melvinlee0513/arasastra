
-- Restrict tutor_assignments reads to same-center users.
-- Superadmins (is_admin) already have full read via the existing FOR ALL policy.
-- Tutor assignments have no direct center_id; scope via the tutor's profile.

DROP POLICY IF EXISTS "Authenticated can read tutor assignments" ON public.tutor_assignments;

CREATE POLICY "Same-center users can read tutor assignments"
ON public.tutor_assignments
FOR SELECT
TO authenticated
USING (
  is_admin()
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.user_id = tutor_assignments.tutor_id
      AND public.same_center_as_current_user(p.center_id)
  )
);
