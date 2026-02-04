-- Create CMS assets storage bucket (if not exists)
INSERT INTO storage.buckets (id, name, public)
VALUES ('cms-assets', 'cms-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for cms-assets bucket (drop first if exists to avoid conflict)
DROP POLICY IF EXISTS "Public can view cms assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can upload cms assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can update cms assets" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete cms assets" ON storage.objects;

CREATE POLICY "Public can view cms assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'cms-assets');

CREATE POLICY "Admins can upload cms assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'cms-assets' AND is_admin());

CREATE POLICY "Admins can update cms assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'cms-assets' AND is_admin());

CREATE POLICY "Admins can delete cms assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'cms-assets' AND is_admin());

-- Seed default content sections if empty
INSERT INTO public.content_sections (section_key, title, subtitle, content, display_order) VALUES
('hero', 'Welcome to Arasa A+', 'Your gateway to academic excellence', 
 '{"tagline": "Master your SPM subjects with Malaysia''s top tutors", "cta_text": "Get Started", "hero_image": ""}'::jsonb, 1),
('subjects', 'Featured Subjects', 'Explore our comprehensive curriculum',
 '{"description": "We offer expert tutoring in all major SPM subjects", "featured_subjects": "Mathematics, Physics, Chemistry, Biology"}'::jsonb, 2),
('tutors', 'Meet Our Tutors', 'Learn from the best educators in Malaysia',
 '{"featured_tutor": "Dr. Sarah Chen", "tutor_description": "20+ years of teaching experience", "tutor_avatar": ""}'::jsonb, 3),
('testimonials', 'Student Success Stories', 'See what our students say',
 '{"quote": "Arasa A+ helped me score straight A''s in SPM!", "student_name": "Ahmad Ibrahim", "grade": "Form 5"}'::jsonb, 4)
ON CONFLICT (section_key) DO NOTHING;

-- Enable realtime for content_sections (ignore if already exists)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.content_sections;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;