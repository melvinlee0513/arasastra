
-- Helper: is the current user enrolled in a given class?
CREATE OR REPLACE FUNCTION public.is_enrolled_in_class(_class_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enrollments e
    JOIN public.profiles p ON p.id = e.student_id
    WHERE p.user_id = auth.uid()
      AND e.class_id = _class_id
      AND COALESCE(e.is_active, true) = true
  );
$$;

-- Helper: is the current user enrolled in any class for a given subject
-- (used for materials that are subject-scoped but not class-scoped, e.g. flashcard_decks)?
CREATE OR REPLACE FUNCTION public.is_enrolled_in_subject(_subject_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.enrollments e
    JOIN public.profiles p ON p.id = e.student_id
    WHERE p.user_id = auth.uid()
      AND COALESCE(e.is_active, true) = true
      AND (
        e.subject_id = _subject_id
        OR EXISTS (
          SELECT 1 FROM public.classes c
          WHERE c.id = e.class_id AND c.subject_id = _subject_id
        )
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_enrolled_in_class(uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_enrolled_in_subject(uuid) TO authenticated, anon;

-- ============ video_resources ============
DROP POLICY IF EXISTS "Authenticated can view published videos" ON public.video_resources;
DROP POLICY IF EXISTS "Anon can view demo videos" ON public.video_resources;

CREATE POLICY "Public can view demo published videos"
ON public.video_resources
FOR SELECT
TO anon, authenticated
USING (
  is_published = true
  AND access_level = 'demo'::material_access_level
);

CREATE POLICY "Enrolled or owner can view exclusive videos"
ON public.video_resources
FOR SELECT
TO authenticated
USING (
  access_level = 'exclusive'::material_access_level
  AND (
    is_admin()
    OR created_by = auth.uid()
    OR (class_id IS NOT NULL AND public.is_enrolled_in_class(class_id))
  )
);

-- ============ notes ============
DROP POLICY IF EXISTS "Authenticated can view notes" ON public.notes;
DROP POLICY IF EXISTS "Anon can view demo notes" ON public.notes;

CREATE POLICY "Public can view demo notes"
ON public.notes
FOR SELECT
TO anon, authenticated
USING (access_level = 'demo'::material_access_level);

CREATE POLICY "Enrolled or owner can view exclusive notes"
ON public.notes
FOR SELECT
TO authenticated
USING (
  access_level = 'exclusive'::material_access_level
  AND (
    is_admin()
    OR uploaded_by = auth.uid()
    OR (class_id IS NOT NULL AND public.is_enrolled_in_class(class_id))
  )
);

-- ============ quizzes ============
DROP POLICY IF EXISTS "Authenticated can view quizzes" ON public.quizzes;
DROP POLICY IF EXISTS "Anon can view demo quizzes" ON public.quizzes;

CREATE POLICY "Public can view demo quizzes"
ON public.quizzes
FOR SELECT
TO anon, authenticated
USING (access_level = 'demo'::material_access_level);

CREATE POLICY "Enrolled can view exclusive quizzes"
ON public.quizzes
FOR SELECT
TO authenticated
USING (
  access_level = 'exclusive'::material_access_level
  AND (
    is_admin()
    OR (class_id IS NOT NULL AND public.is_enrolled_in_class(class_id))
  )
);

-- ============ flashcard_decks (subject-scoped) ============
DROP POLICY IF EXISTS "Authenticated can view flashcard decks" ON public.flashcard_decks;
DROP POLICY IF EXISTS "Anon can view demo flashcard decks" ON public.flashcard_decks;

CREATE POLICY "Public can view demo flashcard decks"
ON public.flashcard_decks
FOR SELECT
TO anon, authenticated
USING (access_level = 'demo'::material_access_level);

CREATE POLICY "Enrolled or owner can view exclusive flashcard decks"
ON public.flashcard_decks
FOR SELECT
TO authenticated
USING (
  access_level = 'exclusive'::material_access_level
  AND (
    is_admin()
    OR created_by = auth.uid()
    OR (subject_id IS NOT NULL AND public.is_enrolled_in_subject(subject_id))
  )
);
