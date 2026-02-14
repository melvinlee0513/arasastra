
-- Add assigned_tutor_id to profiles if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'assigned_tutor_id') THEN
    ALTER TABLE public.profiles ADD COLUMN assigned_tutor_id uuid REFERENCES public.tutors(id);
  END IF;
END $$;

-- Add unique constraint on enrollments for upsert support
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'enrollments_student_id_subject_id_key'
  ) THEN
    ALTER TABLE public.enrollments ADD CONSTRAINT enrollments_student_id_subject_id_key UNIQUE (student_id, subject_id);
  END IF;
END $$;

-- Allow tutors to view their own classes
CREATE POLICY "Tutors can view their classes"
ON public.classes
FOR SELECT
USING (
  tutor_id IN (
    SELECT id FROM public.tutors WHERE user_id = auth.uid()
  )
);

-- Allow tutors to view attendance for their classes
CREATE POLICY "Tutors can view attendance for their classes"
ON public.attendance
FOR SELECT
USING (
  class_id IN (
    SELECT c.id FROM public.classes c
    JOIN public.tutors t ON c.tutor_id = t.id
    WHERE t.user_id = auth.uid()
  )
);

-- Allow tutors to manage attendance for their classes
CREATE POLICY "Tutors can manage attendance for their classes"
ON public.attendance
FOR INSERT
WITH CHECK (
  class_id IN (
    SELECT c.id FROM public.classes c
    JOIN public.tutors t ON c.tutor_id = t.id
    WHERE t.user_id = auth.uid()
  )
);

CREATE POLICY "Tutors can update attendance for their classes"
ON public.attendance
FOR UPDATE
USING (
  class_id IN (
    SELECT c.id FROM public.classes c
    JOIN public.tutors t ON c.tutor_id = t.id
    WHERE t.user_id = auth.uid()
  )
);

-- Allow tutors to upload notes
CREATE POLICY "Tutors can insert notes"
ON public.notes
FOR INSERT
WITH CHECK (uploaded_by = auth.uid());

-- Allow tutors to manage their own notes
CREATE POLICY "Tutors can update own notes"
ON public.notes
FOR UPDATE
USING (uploaded_by = auth.uid());

CREATE POLICY "Tutors can delete own notes"
ON public.notes
FOR DELETE
USING (uploaded_by = auth.uid());

-- Allow tutors to view enrollments for subjects they teach
CREATE POLICY "Tutors can view enrollments for their subjects"
ON public.enrollments
FOR SELECT
USING (
  subject_id IN (
    SELECT s.id FROM public.subjects s
    JOIN public.tutors t ON t.specialization = s.name
    WHERE t.user_id = auth.uid()
  )
);

-- Allow tutors to view profiles of their students
CREATE POLICY "Tutors can view student profiles"
ON public.profiles
FOR SELECT
USING (
  id IN (
    SELECT e.student_id FROM public.enrollments e
    JOIN public.subjects s ON e.subject_id = s.id
    JOIN public.tutors t ON t.specialization = s.name
    WHERE t.user_id = auth.uid() AND e.is_active = true
  )
);

-- Allow tutors to view their own tutor record
CREATE POLICY "Tutors can view own tutor record"
ON public.tutors
FOR SELECT
USING (user_id = auth.uid());

-- Allow tutors to view submissions for their classes
CREATE POLICY "Tutors can view submissions for their classes"
ON public.submissions
FOR SELECT
USING (
  assignment_id IN (
    SELECT a.id FROM public.assignments a
    JOIN public.classes c ON a.class_id = c.id
    JOIN public.tutors t ON c.tutor_id = t.id
    WHERE t.user_id = auth.uid()
  )
);

-- Allow tutors to grade submissions for their classes
CREATE POLICY "Tutors can grade submissions"
ON public.submissions
FOR UPDATE
USING (
  assignment_id IN (
    SELECT a.id FROM public.assignments a
    JOIN public.classes c ON a.class_id = c.id
    JOIN public.tutors t ON c.tutor_id = t.id
    WHERE t.user_id = auth.uid()
  )
);
