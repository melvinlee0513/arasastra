
CREATE TYPE public.video_source_type AS ENUM ('upload', 'youtube', 'zoom');

CREATE TABLE public.video_resources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  course_module TEXT,
  source_type public.video_source_type NOT NULL,
  video_url TEXT NOT NULL,
  youtube_id TEXT,
  thumbnail_url TEXT,
  file_size BIGINT,
  duration_seconds INTEGER,
  is_published BOOLEAN NOT NULL DEFAULT true,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_resources TO authenticated;
GRANT ALL ON public.video_resources TO service_role;

ALTER TABLE public.video_resources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view published videos"
  ON public.video_resources FOR SELECT
  TO authenticated
  USING (is_published = true OR created_by = auth.uid() OR public.is_admin());

CREATE POLICY "Creators can insert their own videos"
  ON public.video_resources FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY "Creators or admins can update videos"
  ON public.video_resources FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid() OR public.is_admin())
  WITH CHECK (created_by = auth.uid() OR public.is_admin());

CREATE POLICY "Creators or admins can delete videos"
  ON public.video_resources FOR DELETE
  TO authenticated
  USING (created_by = auth.uid() OR public.is_admin());

CREATE TRIGGER trg_video_resources_updated_at
  BEFORE UPDATE ON public.video_resources
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX idx_video_resources_created_by ON public.video_resources(created_by);
CREATE INDEX idx_video_resources_created_at ON public.video_resources(created_at DESC);
