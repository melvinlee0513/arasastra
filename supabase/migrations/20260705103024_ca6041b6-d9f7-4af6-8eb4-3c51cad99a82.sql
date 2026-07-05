
ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS center_id uuid REFERENCES public.tuition_centers(id) ON DELETE CASCADE;

ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS center_id uuid REFERENCES public.tuition_centers(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_subjects_center_id ON public.subjects(center_id);
CREATE INDEX IF NOT EXISTS idx_classes_center_id ON public.classes(center_id);
