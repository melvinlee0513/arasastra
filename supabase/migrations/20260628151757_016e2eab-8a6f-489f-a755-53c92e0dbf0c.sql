
DO $$ BEGIN
  CREATE TYPE public.material_access_level AS ENUM ('exclusive', 'demo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.video_resources
  ADD COLUMN IF NOT EXISTS access_level public.material_access_level NOT NULL DEFAULT 'exclusive';
ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS access_level public.material_access_level NOT NULL DEFAULT 'exclusive';
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS access_level public.material_access_level NOT NULL DEFAULT 'exclusive';
ALTER TABLE public.flashcard_decks
  ADD COLUMN IF NOT EXISTS access_level public.material_access_level NOT NULL DEFAULT 'exclusive';

-- Allow anonymous visitors to view demo materials
GRANT SELECT ON public.video_resources TO anon;
GRANT SELECT ON public.notes TO anon;
GRANT SELECT ON public.quizzes TO anon;
GRANT SELECT ON public.flashcard_decks TO anon;

DROP POLICY IF EXISTS "Anon can view demo videos" ON public.video_resources;
CREATE POLICY "Anon can view demo videos"
  ON public.video_resources FOR SELECT
  TO anon
  USING (is_published = true AND access_level = 'demo');

DROP POLICY IF EXISTS "Anon can view demo notes" ON public.notes;
CREATE POLICY "Anon can view demo notes"
  ON public.notes FOR SELECT
  TO anon
  USING (access_level = 'demo');

DROP POLICY IF EXISTS "Anon can view demo quizzes" ON public.quizzes;
CREATE POLICY "Anon can view demo quizzes"
  ON public.quizzes FOR SELECT
  TO anon
  USING (access_level = 'demo');

DROP POLICY IF EXISTS "Anon can view demo flashcard decks" ON public.flashcard_decks;
CREATE POLICY "Anon can view demo flashcard decks"
  ON public.flashcard_decks FOR SELECT
  TO anon
  USING (access_level = 'demo');
