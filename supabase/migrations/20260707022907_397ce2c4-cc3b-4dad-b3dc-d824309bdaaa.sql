
-- ============ SUBJECTS: add status/archived_at ============
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- ============ CLASSES: instance metadata ============
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS class_name text,
  ADD COLUMN IF NOT EXISTS cohort_name text,
  ADD COLUMN IF NOT EXISTS academic_year text,
  ADD COLUMN IF NOT EXISTS schedule_label text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- Backfill class_name from existing title
UPDATE public.classes SET class_name = title WHERE class_name IS NULL;

-- ============ CLASS_TUTORS ============
CREATE TABLE IF NOT EXISTS public.class_tutors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  tutor_user_id uuid NOT NULL,
  assigned_by uuid,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (center_id, class_id, tutor_user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_tutors TO authenticated;
GRANT ALL ON public.class_tutors TO service_role;
ALTER TABLE public.class_tutors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "class_tutors admin manage same center"
ON public.class_tutors FOR ALL
TO authenticated
USING (public.is_admin() AND public.same_center_as_current_user(center_id))
WITH CHECK (public.is_admin() AND public.same_center_as_current_user(center_id));

CREATE POLICY "class_tutors tutor read own"
ON public.class_tutors FOR SELECT
TO authenticated
USING (tutor_user_id = auth.uid());

CREATE POLICY "class_tutors students read same center"
ON public.class_tutors FOR SELECT
TO authenticated
USING (public.same_center_as_current_user(center_id));

-- Backfill from classes.tutor_id (which references tutors.id -> tutors.user_id)
INSERT INTO public.class_tutors (center_id, class_id, tutor_user_id, assigned_at)
SELECT c.center_id, c.id, t.user_id, COALESCE(c.created_at, now())
FROM public.classes c
JOIN public.tutors t ON t.id = c.tutor_id
WHERE c.tutor_id IS NOT NULL AND c.center_id IS NOT NULL AND t.user_id IS NOT NULL
ON CONFLICT (center_id, class_id, tutor_user_id) DO NOTHING;

-- ============ is_tutor_of_class helper ============
CREATE OR REPLACE FUNCTION public.is_tutor_of_class(_class_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.class_tutors
    WHERE class_id = _class_id AND tutor_user_id = auth.uid()
  );
$$;

-- ============ CLASS_ENROLLMENTS ============
CREATE TABLE IF NOT EXISTS public.class_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL,
  enrolled_by uuid,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'active'
);

CREATE UNIQUE INDEX IF NOT EXISTS class_enrollments_active_unique
  ON public.class_enrollments (center_id, student_user_id, class_id)
  WHERE status = 'active';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_enrollments TO authenticated;
GRANT ALL ON public.class_enrollments TO service_role;
ALTER TABLE public.class_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "class_enrollments admin manage same center"
ON public.class_enrollments FOR ALL
TO authenticated
USING (public.is_admin() AND public.same_center_as_current_user(center_id))
WITH CHECK (public.is_admin() AND public.same_center_as_current_user(center_id));

CREATE POLICY "class_enrollments student read own"
ON public.class_enrollments FOR SELECT
TO authenticated
USING (student_user_id = auth.uid());

CREATE POLICY "class_enrollments tutor read assigned class"
ON public.class_enrollments FOR SELECT
TO authenticated
USING (public.is_tutor_of_class(class_id));

-- Backfill from legacy enrollments (student_id references profiles.id; profiles has user_id)
INSERT INTO public.class_enrollments (center_id, class_id, student_user_id, enrolled_at, status)
SELECT c.center_id, e.class_id, p.user_id, COALESCE(e.enrolled_at, now()),
       CASE WHEN COALESCE(e.is_active, true) THEN 'active' ELSE 'removed' END
FROM public.enrollments e
JOIN public.profiles p ON p.id = e.student_id
JOIN public.classes c ON c.id = e.class_id
WHERE e.class_id IS NOT NULL AND c.center_id IS NOT NULL AND p.user_id IS NOT NULL
ON CONFLICT DO NOTHING;
