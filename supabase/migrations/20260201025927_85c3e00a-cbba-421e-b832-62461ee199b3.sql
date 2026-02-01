-- Create storage bucket for notes/resources
INSERT INTO storage.buckets (id, name, public)
VALUES ('notes', 'notes', true);

-- Storage policies for notes bucket
CREATE POLICY "Anyone can view notes files"
ON storage.objects FOR SELECT
USING (bucket_id = 'notes');

CREATE POLICY "Admins can upload notes"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'notes' AND is_admin());

CREATE POLICY "Admins can update notes"
ON storage.objects FOR UPDATE
USING (bucket_id = 'notes' AND is_admin());

CREATE POLICY "Admins can delete notes"
ON storage.objects FOR DELETE
USING (bucket_id = 'notes' AND is_admin());

-- Create notes table
CREATE TABLE public.notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE SET NULL,
  file_url TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  file_type TEXT DEFAULT 'application/pdf',
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;

-- RLS policies for notes
CREATE POLICY "Anyone can view notes"
ON public.notes FOR SELECT
USING (true);

CREATE POLICY "Admins can manage notes"
ON public.notes FOR ALL
USING (is_admin());

-- Trigger for updated_at
CREATE TRIGGER update_notes_updated_at
BEFORE UPDATE ON public.notes
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();