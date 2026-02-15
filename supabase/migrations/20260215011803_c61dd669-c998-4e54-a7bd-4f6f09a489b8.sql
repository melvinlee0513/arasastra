
-- Content versions table for draft/publish workflow
CREATE TABLE public.content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.content_sections(id) ON DELETE CASCADE,
  draft_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  draft_title text,
  draft_subtitle text,
  status text NOT NULL DEFAULT 'draft',
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.content_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage content versions"
  ON public.content_versions FOR ALL
  USING (public.is_admin());

CREATE POLICY "Anyone can view published versions"
  ON public.content_versions FOR SELECT
  USING (status = 'published' OR public.is_admin());

-- Admin audit log
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL REFERENCES auth.users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only admins can manage audit log"
  ON public.admin_audit_log FOR ALL
  USING (public.is_admin());

-- Trigger for updated_at on content_versions
CREATE TRIGGER update_content_versions_updated_at
  BEFORE UPDATE ON public.content_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
