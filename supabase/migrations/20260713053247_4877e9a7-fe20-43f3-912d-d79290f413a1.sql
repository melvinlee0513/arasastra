-- Repair SELECT policies on public.classes so that enrolled students and
-- assigned tutors (via class_tutors) can read their own class row. The prior
-- policies filtered on status='published' (classes actually use 'active') and
-- only checked the legacy classes.tutor_id column, which is why the real
-- production classroom returned "Class not found" for everyone but admins.

DROP POLICY IF EXISTS "Authenticated users can view published classes" ON public.classes;
DROP POLICY IF EXISTS "Tutors can view their classes" ON public.classes;

CREATE POLICY "classes select visible to member"
  ON public.classes
  FOR SELECT
  TO authenticated
  USING (
    public.is_admin()
    OR public.is_tutor_of_class(id)
    OR public.is_enrolled_in_class(id)
  );
