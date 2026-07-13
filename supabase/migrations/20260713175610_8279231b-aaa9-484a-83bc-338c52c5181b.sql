CREATE OR REPLACE FUNCTION public.is_enrolled_in_class(_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_enrollments ce
    WHERE ce.class_id = _class_id
      AND ce.student_user_id = auth.uid()
      AND ce.status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_enrolled_in_subject(_subject_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.class_enrollments ce
    JOIN public.classes c ON c.id = ce.class_id
    WHERE ce.student_user_id = auth.uid()
      AND ce.status = 'active'
      AND c.subject_id = _subject_id
  );
$$;