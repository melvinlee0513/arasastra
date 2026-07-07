
-- Drop the overly-broad (student_id, subject_id) unique constraint that blocked
-- enrolling a student in multiple class instances of the same subject/tutor.
ALTER TABLE public.enrollments
  DROP CONSTRAINT IF EXISTS enrollments_student_subject_unique;

-- Keep the exact-class uniqueness rule. Recreate as a partial unique index so
-- it only fires when class_id is set (subject-only enrollment rows, if any,
-- remain allowed).
ALTER TABLE public.enrollments
  DROP CONSTRAINT IF EXISTS enrollments_student_id_class_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS unique_student_class_enrollment
  ON public.enrollments (student_id, class_id)
  WHERE class_id IS NOT NULL;
