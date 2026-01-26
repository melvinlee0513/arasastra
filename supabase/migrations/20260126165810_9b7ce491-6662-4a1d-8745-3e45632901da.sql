-- Create app_role enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'student');

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'student',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (user_id, role)
);

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  avatar_url TEXT,
  form_year TEXT, -- e.g., 'Year 5', 'Form 1', 'Form 5'
  phone TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create subjects table
CREATE TABLE public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT, -- emoji or icon name
  color TEXT, -- hex color for UI
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create tutors table
CREATE TABLE public.tutors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  bio TEXT,
  avatar_url TEXT,
  specialization TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create classes table
CREATE TABLE public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE,
  tutor_id UUID REFERENCES public.tutors(id) ON DELETE SET NULL,
  scheduled_at TIMESTAMP WITH TIME ZONE NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  video_url TEXT, -- YouTube/Vimeo/Zoom replay link
  live_url TEXT, -- Live class link
  is_live BOOLEAN DEFAULT false,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create enrollments table
CREATE TABLE public.enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  subject_id UUID REFERENCES public.subjects(id) ON DELETE CASCADE NOT NULL,
  enrolled_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  UNIQUE (student_id, subject_id)
);

-- Create progress table
CREATE TABLE public.progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
  watched_seconds INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  last_watched_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (student_id, class_id)
);

-- Create content_sections table for CMS
CREATE TABLE public.content_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key TEXT NOT NULL UNIQUE, -- e.g., 'hero', 'tutors', 'subjects'
  title TEXT,
  subtitle TEXT,
  content JSONB DEFAULT '{}',
  is_visible BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT,
  type TEXT DEFAULT 'system', -- 'system', 'class_reminder', 'announcement'
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tutors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Security definer function to check if user has a role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Helper function to check if current user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin')
$$;

-- Helper function to get current user's profile id
CREATE OR REPLACE FUNCTION public.get_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.profiles WHERE user_id = auth.uid() LIMIT 1
$$;

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "Only admins can manage roles" ON public.user_roles
  FOR ALL USING (public.is_admin());

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can manage all profiles" ON public.profiles
  FOR ALL USING (public.is_admin());

-- RLS Policies for subjects
CREATE POLICY "Anyone can view active subjects" ON public.subjects
  FOR SELECT USING (is_active = true OR public.is_admin());

CREATE POLICY "Only admins can manage subjects" ON public.subjects
  FOR ALL USING (public.is_admin());

-- RLS Policies for tutors
CREATE POLICY "Anyone can view active tutors" ON public.tutors
  FOR SELECT USING (is_active = true OR public.is_admin());

CREATE POLICY "Only admins can manage tutors" ON public.tutors
  FOR ALL USING (public.is_admin());

-- RLS Policies for classes
CREATE POLICY "Anyone can view published classes" ON public.classes
  FOR SELECT USING (is_published = true OR public.is_admin());

CREATE POLICY "Only admins can manage classes" ON public.classes
  FOR ALL USING (public.is_admin());

-- RLS Policies for enrollments
CREATE POLICY "Users can view their own enrollments" ON public.enrollments
  FOR SELECT USING (student_id = public.get_profile_id() OR public.is_admin());

CREATE POLICY "Admins can manage all enrollments" ON public.enrollments
  FOR ALL USING (public.is_admin());

-- RLS Policies for progress
CREATE POLICY "Users can view their own progress" ON public.progress
  FOR SELECT USING (student_id = public.get_profile_id() OR public.is_admin());

CREATE POLICY "Users can update their own progress" ON public.progress
  FOR INSERT WITH CHECK (student_id = public.get_profile_id());

CREATE POLICY "Users can modify their own progress" ON public.progress
  FOR UPDATE USING (student_id = public.get_profile_id());

CREATE POLICY "Admins can manage all progress" ON public.progress
  FOR ALL USING (public.is_admin());

-- RLS Policies for content_sections
CREATE POLICY "Anyone can view visible content" ON public.content_sections
  FOR SELECT USING (is_visible = true OR public.is_admin());

CREATE POLICY "Only admins can manage content" ON public.content_sections
  FOR ALL USING (public.is_admin());

-- RLS Policies for notifications
CREATE POLICY "Users can view their own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can update their own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "Admins can manage all notifications" ON public.notifications
  FOR ALL USING (public.is_admin());

-- Trigger for updated_at on profiles
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_profile_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER on_content_updated
  BEFORE UPDATE ON public.content_sections
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Insert default content sections
INSERT INTO public.content_sections (section_key, title, subtitle, content, is_visible, display_order) VALUES
  ('hero', 'Arasa A+', 'Your path to academic excellence', '{"tagline": "Learn from the best tutors", "cta_text": "Start Learning"}', true, 1),
  ('subjects', 'Our Subjects', 'Comprehensive curriculum for all levels', '{}', true, 2),
  ('tutors', 'Expert Tutors', 'Learn from experienced educators', '{}', true, 3),
  ('testimonials', 'Student Success Stories', 'Hear from our students', '{"items": []}', true, 4);

-- Create function to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  
  -- Default role is student
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'student');
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();