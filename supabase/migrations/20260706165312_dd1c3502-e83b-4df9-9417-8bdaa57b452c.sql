
-- ============================================================
-- Multi-tenant hardening: enforce center_id isolation via
-- RESTRICTIVE RLS policies so PERMISSIVE role policies cannot
-- OR-leak across centers. Superadmins bypass tenant scoping.
-- ============================================================

-- 1) Helper: return the caller's center_id (NULL for superadmins / signed-out).
CREATE OR REPLACE FUNCTION public.get_user_center(_user_id uuid DEFAULT auth.uid())
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT center_id
  FROM public.profiles
  WHERE user_id = _user_id
  LIMIT 1
$$;

-- 2) Add center_id to tutors (tenant-owned) and backfill from profiles.
ALTER TABLE public.tutors
  ADD COLUMN IF NOT EXISTS center_id uuid REFERENCES public.tuition_centers(id) ON DELETE CASCADE;

UPDATE public.tutors t
SET center_id = p.center_id
FROM public.profiles p
WHERE t.user_id = p.user_id
  AND t.center_id IS NULL
  AND p.center_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tutors_center_id ON public.tutors(center_id);

-- 3) RESTRICTIVE tenant isolation policies.
-- These AND with existing PERMISSIVE role policies so a Center Admin
-- can still `is_admin()` themselves, but only for rows in THEIR center.
-- Superadmins bypass via is_superadmin().

-- profiles
DROP POLICY IF EXISTS "Tenant isolation for profiles" ON public.profiles;
CREATE POLICY "Tenant isolation for profiles"
  ON public.profiles AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR is_superadmin()
    OR (center_id IS NOT NULL AND center_id = public.get_user_center())
  )
  WITH CHECK (
    user_id = auth.uid()
    OR is_superadmin()
    OR (center_id IS NOT NULL AND center_id = public.get_user_center())
  );

-- user_roles: scope to caller's center via joined profile
DROP POLICY IF EXISTS "Tenant isolation for user_roles" ON public.user_roles;
CREATE POLICY "Tenant isolation for user_roles"
  ON public.user_roles AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    user_id = auth.uid()
    OR is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = public.user_roles.user_id
        AND p.center_id = public.get_user_center()
    )
  )
  WITH CHECK (
    user_id = auth.uid()
    OR is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = public.user_roles.user_id
        AND p.center_id = public.get_user_center()
    )
  );

-- classes
DROP POLICY IF EXISTS "Tenant isolation for classes" ON public.classes;
CREATE POLICY "Tenant isolation for classes"
  ON public.classes AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (is_superadmin() OR center_id = public.get_user_center())
  WITH CHECK (is_superadmin() OR center_id = public.get_user_center());

-- subjects
DROP POLICY IF EXISTS "Tenant isolation for subjects" ON public.subjects;
CREATE POLICY "Tenant isolation for subjects"
  ON public.subjects AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (is_superadmin() OR center_id IS NULL OR center_id = public.get_user_center())
  WITH CHECK (is_superadmin() OR center_id = public.get_user_center());

-- tutors
DROP POLICY IF EXISTS "Tenant isolation for tutors" ON public.tutors;
CREATE POLICY "Tenant isolation for tutors"
  ON public.tutors AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    is_superadmin()
    OR user_id = auth.uid()
    OR center_id = public.get_user_center()
  )
  WITH CHECK (is_superadmin() OR center_id = public.get_user_center());

-- notes (already has PERMISSIVE tenant policy; add RESTRICTIVE to enforce AND)
DROP POLICY IF EXISTS "Tenant isolation for notes (restrictive)" ON public.notes;
CREATE POLICY "Tenant isolation for notes (restrictive)"
  ON public.notes AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (is_superadmin() OR access_level = 'demo' OR center_id = public.get_user_center())
  WITH CHECK (is_superadmin() OR center_id = public.get_user_center());

-- video_resources
DROP POLICY IF EXISTS "Tenant isolation for videos (restrictive)" ON public.video_resources;
CREATE POLICY "Tenant isolation for videos (restrictive)"
  ON public.video_resources AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    is_superadmin()
    OR (is_published = true AND access_level = 'demo')
    OR center_id = public.get_user_center()
  )
  WITH CHECK (is_superadmin() OR center_id = public.get_user_center());

-- flashcard_decks
DROP POLICY IF EXISTS "Tenant isolation for flashcards (restrictive)" ON public.flashcard_decks;
CREATE POLICY "Tenant isolation for flashcards (restrictive)"
  ON public.flashcard_decks AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (is_superadmin() OR access_level = 'demo' OR center_id = public.get_user_center())
  WITH CHECK (is_superadmin() OR center_id = public.get_user_center());

-- quizzes
DROP POLICY IF EXISTS "Tenant isolation for quizzes (restrictive)" ON public.quizzes;
CREATE POLICY "Tenant isolation for quizzes (restrictive)"
  ON public.quizzes AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (is_superadmin() OR access_level = 'demo' OR center_id = public.get_user_center())
  WITH CHECK (is_superadmin() OR center_id = public.get_user_center());

-- invitations
DROP POLICY IF EXISTS "Tenant isolation for invitations" ON public.invitations;
CREATE POLICY "Tenant isolation for invitations"
  ON public.invitations AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (is_superadmin() OR center_id = public.get_user_center())
  WITH CHECK (is_superadmin() OR center_id = public.get_user_center());

-- enrollments: scope via student's profile.center_id
DROP POLICY IF EXISTS "Tenant isolation for enrollments" ON public.enrollments;
CREATE POLICY "Tenant isolation for enrollments"
  ON public.enrollments AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.enrollments.student_id
        AND p.center_id = public.get_user_center()
    )
  )
  WITH CHECK (
    is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = public.enrollments.student_id
        AND p.center_id = public.get_user_center()
    )
  );

-- attendance: scope via class.center_id
DROP POLICY IF EXISTS "Tenant isolation for attendance" ON public.attendance;
CREATE POLICY "Tenant isolation for attendance"
  ON public.attendance AS RESTRICTIVE
  FOR ALL TO authenticated
  USING (
    is_superadmin()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = public.attendance.class_id
        AND c.center_id = public.get_user_center()
    )
  )
  WITH CHECK (
    is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.classes c
      WHERE c.id = public.attendance.class_id
        AND c.center_id = public.get_user_center()
    )
  );
