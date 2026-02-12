
-- 1. Add columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS lead_status text NOT NULL DEFAULT 'New',
  ADD COLUMN IF NOT EXISTS admin_remarks text,
  ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz;

-- 2. Add zoom_link to classes
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS zoom_link text;

-- 3. Create attendance table
CREATE TABLE public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'absent',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, class_id, date)
);
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage attendance" ON public.attendance FOR ALL USING (is_admin());
CREATE POLICY "Users can view own attendance" ON public.attendance FOR SELECT USING ((user_id = auth.uid()) OR is_admin());

-- 4. Create assignments table
CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  due_date timestamptz,
  file_url text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view assignments" ON public.assignments FOR SELECT USING (true);
CREATE POLICY "Admins can manage assignments" ON public.assignments FOR ALL USING (is_admin());

-- 5. Create submissions table
CREATE TABLE public.submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  grade text,
  feedback text,
  submitted_at timestamptz DEFAULT now(),
  graded_at timestamptz
);
ALTER TABLE public.submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own submissions" ON public.submissions FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can view own submissions" ON public.submissions FOR SELECT USING ((user_id = auth.uid()) OR is_admin());
CREATE POLICY "Admins can manage submissions" ON public.submissions FOR ALL USING (is_admin());

-- 6. Create quizzes table
CREATE TABLE public.quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id uuid REFERENCES public.classes(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view quizzes" ON public.quizzes FOR SELECT USING (true);
CREATE POLICY "Admins can manage quizzes" ON public.quizzes FOR ALL USING (is_admin());

-- 7. Create quiz_questions table
CREATE TABLE public.quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question text NOT NULL,
  options jsonb NOT NULL DEFAULT '[]',
  correct_answer text NOT NULL,
  sort_order integer DEFAULT 0
);
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view quiz questions" ON public.quiz_questions FOR SELECT USING (true);
CREATE POLICY "Admins can manage quiz questions" ON public.quiz_questions FOR ALL USING (is_admin());

-- 8. Create quiz_results table
CREATE TABLE public.quiz_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  score integer NOT NULL DEFAULT 0,
  total_questions integer NOT NULL DEFAULT 0,
  completed_at timestamptz DEFAULT now(),
  UNIQUE(quiz_id, user_id)
);
ALTER TABLE public.quiz_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own results" ON public.quiz_results FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users can view own results" ON public.quiz_results FOR SELECT USING ((user_id = auth.uid()) OR is_admin());
CREATE POLICY "Admins can manage results" ON public.quiz_results FOR ALL USING (is_admin());

-- 9. Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('homework', 'homework', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('submissions', 'submissions', false) ON CONFLICT DO NOTHING;

-- Storage policies for homework
CREATE POLICY "Anyone can view homework files" ON storage.objects FOR SELECT USING (bucket_id = 'homework');
CREATE POLICY "Admins can upload homework" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'homework' AND is_admin());
CREATE POLICY "Admins can delete homework" ON storage.objects FOR DELETE USING (bucket_id = 'homework' AND is_admin());

-- Storage policies for submissions
CREATE POLICY "Users can upload own submissions" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'submissions' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "Users can view own submissions" ON storage.objects FOR SELECT USING (bucket_id = 'submissions' AND (auth.uid()::text = (storage.foldername(name))[1] OR is_admin()));

-- 10. Update handle_new_user to save email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student');
  
  RETURN NEW;
END;
$$;

-- 11. Enable realtime for attendance
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
