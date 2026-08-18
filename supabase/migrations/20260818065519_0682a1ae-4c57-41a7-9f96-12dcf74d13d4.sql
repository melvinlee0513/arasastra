ALTER TABLE public.subjects ADD COLUMN IF NOT EXISTS subject_key text;

ALTER TABLE public.subjects DROP CONSTRAINT IF EXISTS subjects_subject_key_valid;
ALTER TABLE public.subjects ADD CONSTRAINT subjects_subject_key_valid CHECK (
  subject_key IS NULL OR subject_key IN (
    'bahasa_melayu','english','mathematics','additional_mathematics',
    'science','physics','chemistry','biology','sejarah'
  )
);

-- Backfill canonical keys from legacy free-text names (aliases mirror src/lib/subjectConfig.ts).
UPDATE public.subjects SET subject_key = CASE
  WHEN name ~* '(add(itional)?[[:space:].-]*math|matematik[[:space:]]*tambahan)' THEN 'additional_mathematics'
  WHEN name ~* '(math|matematik)' THEN 'mathematics'
  WHEN name ~* '(physic|fizik)' THEN 'physics'
  WHEN name ~* '(chem|kimia)' THEN 'chemistry'
  WHEN name ~* 'bio' THEN 'biology'
  WHEN name ~* '(science|sains)' THEN 'science'
  WHEN name ~* '(sejarah|history)' THEN 'sejarah'
  WHEN name ~* '(bahasa[[:space:]]*melayu|bahasa[[:space:]]*malaysia|^[[:space:]]*bm[[:space:]]*$)' THEN 'bahasa_melayu'
  WHEN name ~* '(english|bahasa[[:space:]]*inggeris|^[[:space:]]*bi[[:space:]]*$)' THEN 'english'
  ELSE NULL
END
WHERE subject_key IS NULL;

-- Consolidate duplicate canonical subjects inside the same centre.
DO $$
DECLARE
  keeper uuid;
  dup uuid;
BEGIN
  FOR keeper, dup IN
    SELECT ranked.keeper_id, ranked.id
    FROM (
      SELECT s.id,
             first_value(s.id) OVER (
               PARTITION BY coalesce(s.center_id, '00000000-0000-0000-0000-000000000000'::uuid), s.subject_key
               ORDER BY s.created_at, s.id
             ) AS keeper_id
      FROM public.subjects s
      WHERE s.subject_key IS NOT NULL AND coalesce(s.status, 'active') <> 'archived'
    ) ranked
    WHERE ranked.id <> ranked.keeper_id
  LOOP
    UPDATE public.classes SET subject_id = keeper WHERE subject_id = dup;
    UPDATE public.notes SET subject_id = keeper WHERE subject_id = dup;
    UPDATE public.quizzes SET subject_id = keeper WHERE subject_id = dup;
    UPDATE public.flashcard_decks SET subject_id = keeper WHERE subject_id = dup;
    UPDATE public.video_resources SET subject_id = keeper WHERE subject_id = dup;
    UPDATE public.class_resources SET subject_id = keeper WHERE subject_id = dup;
    UPDATE public.enrollments SET subject_id = keeper WHERE subject_id = dup;
    DELETE FROM public.tutor_assignments ta
      WHERE ta.subject_id = dup
        AND EXISTS (
          SELECT 1 FROM public.tutor_assignments k
          WHERE k.subject_id = keeper AND k.tutor_id = ta.tutor_id
            AND coalesce(k.standard_id, '00000000-0000-0000-0000-000000000000'::uuid)
                = coalesce(ta.standard_id, '00000000-0000-0000-0000-000000000000'::uuid)
        );
    UPDATE public.tutor_assignments SET subject_id = keeper WHERE subject_id = dup;

    UPDATE public.subjects
       SET status = 'archived', is_active = false, archived_at = now(), subject_key = NULL
     WHERE id = dup;
  END LOOP;
END $$;

-- Canonical display labels for keyed subjects.
UPDATE public.subjects s
   SET name = m.label
  FROM (VALUES
    ('bahasa_melayu','Bahasa Melayu'),
    ('english','English'),
    ('mathematics','Mathematics'),
    ('additional_mathematics','Additional Mathematics'),
    ('science','Science'),
    ('physics','Physics'),
    ('chemistry','Chemistry'),
    ('biology','Biology'),
    ('sejarah','Sejarah')
  ) AS m(key, label)
 WHERE s.subject_key = m.key AND s.name <> m.label;

CREATE UNIQUE INDEX IF NOT EXISTS subjects_center_subject_key_unique
  ON public.subjects (coalesce(center_id, '00000000-0000-0000-0000-000000000000'::uuid), subject_key)
  WHERE subject_key IS NOT NULL AND coalesce(status, 'active') <> 'archived';