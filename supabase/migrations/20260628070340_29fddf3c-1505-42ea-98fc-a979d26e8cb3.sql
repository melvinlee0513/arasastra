
-- Standards (Form 1..6) for the LMS
CREATE TABLE IF NOT EXISTS public.standards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.standards TO anon, authenticated;
GRANT ALL ON public.standards TO service_role;
ALTER TABLE public.standards ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Standards readable by everyone" ON public.standards FOR SELECT USING (true);
CREATE POLICY "Admins manage standards" ON public.standards FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO public.standards (name, sort_order) VALUES
  ('Form 1', 1), ('Form 2', 2), ('Form 3', 3), ('Form 4', 4), ('Form 5', 5), ('Form 6', 6)
ON CONFLICT (name) DO NOTHING;

-- Tutor ↔ Subject ↔ Standard junction
CREATE TABLE IF NOT EXISTS public.tutor_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tutor_id uuid NOT NULL REFERENCES public.tutors(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  standard_id uuid REFERENCES public.standards(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tutor_id, subject_id, standard_id)
);
GRANT SELECT ON public.tutor_assignments TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.tutor_assignments TO authenticated;
GRANT ALL ON public.tutor_assignments TO service_role;
ALTER TABLE public.tutor_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tutor assignments readable" ON public.tutor_assignments FOR SELECT USING (true);
CREATE POLICY "Admins manage tutor assignments" ON public.tutor_assignments FOR ALL
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Extend classes to act as class instances with cohort tag + standard
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS standard_id uuid REFERENCES public.standards(id),
  ADD COLUMN IF NOT EXISTS cohort_label text,
  ADD COLUMN IF NOT EXISTS class_tag text;

-- Enrollments may target a specific class instance OR a whole subject (legacy)
ALTER TABLE public.enrollments
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE public.enrollments ALTER COLUMN subject_id DROP NOT NULL;

-- Materials linkage: tag videos and notes to a specific class instance (optional)
ALTER TABLE public.video_resources
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subject_id uuid REFERENCES public.subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS standard_id uuid REFERENCES public.standards(id) ON DELETE SET NULL;

ALTER TABLE public.notes
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS standard_id uuid REFERENCES public.standards(id) ON DELETE SET NULL;

-- Helper: tutor authorized to teach subject+standard
CREATE OR REPLACE FUNCTION public.tutor_can_teach(_user_id uuid, _subject_id uuid, _standard_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.tutor_assignments ta
    JOIN public.tutors t ON t.id = ta.tutor_id
    WHERE t.user_id = _user_id
      AND ta.subject_id = _subject_id
      AND (_standard_id IS NULL OR ta.standard_id IS NULL OR ta.standard_id = _standard_id)
  );
$$;
