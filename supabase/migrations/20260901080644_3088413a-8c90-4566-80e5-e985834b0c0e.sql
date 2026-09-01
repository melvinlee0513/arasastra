-- 1. notes: remove the permissive center-wide grant that OR-bypassed enrollment gating
DROP POLICY IF EXISTS "Tenant isolation for notes" ON public.notes;

CREATE POLICY "Superadmins can manage notes"
ON public.notes
FOR ALL
TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

-- 2. video_resources: same fix
DROP POLICY IF EXISTS "Tenant isolation for videos" ON public.video_resources;

CREATE POLICY "Superadmins can manage videos"
ON public.video_resources
FOR ALL
TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

-- 3. tutor_assignments: scope reads to admins/superadmins and the owning tutor
DROP POLICY IF EXISTS "Same-center users can read tutor assignments" ON public.tutor_assignments;

CREATE POLICY "Admins and owning tutor can read tutor assignments"
ON public.tutor_assignments
FOR SELECT
TO authenticated
USING (
  public.is_admin()
  OR public.is_superadmin()
  OR EXISTS (
    SELECT 1
    FROM public.tutors t
    WHERE t.id = tutor_assignments.tutor_id
      AND t.user_id = auth.uid()
  )
);
