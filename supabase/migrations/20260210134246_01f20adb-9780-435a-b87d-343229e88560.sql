
-- Create pricing_plans table
CREATE TABLE public.pricing_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  subtitle TEXT,
  price TEXT NOT NULL,
  interval TEXT NOT NULL DEFAULT '/month',
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_popular BOOLEAN NOT NULL DEFAULT false,
  button_text TEXT NOT NULL DEFAULT 'Select Plan',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.pricing_plans ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can view active pricing plans"
ON public.pricing_plans
FOR SELECT
USING ((is_active = true) OR is_admin());

-- Admin full access
CREATE POLICY "Only admins can manage pricing plans"
ON public.pricing_plans
FOR ALL
USING (is_admin());

-- Seed data
INSERT INTO public.pricing_plans (name, subtitle, price, interval, features, is_popular, button_text, sort_order) VALUES
('Starter', '2 subjects', 'RM149', '/month', '["Access to 2 subjects", "Live online classes", "Class recordings", "WhatsApp support group", "Monthly progress report"]'::jsonb, false, 'Select Plan', 1),
('Standard', '4 subjects', 'RM269', '/month', '["Access to 4 subjects", "Live online classes", "HD class recordings", "Free revision notes", "WhatsApp support group", "Weekly progress report", "1-on-1 tutor consultation"]'::jsonb, false, 'Select Plan', 2),
('Complete', '5 subjects', 'RM299', '/month', '["Access to ALL subjects", "Live online classes", "HD class recordings", "Free revision notes", "24/7 tutor access", "Daily progress tracking", "Priority WhatsApp support", "Exam preparation workshops", "Practice paper library"]'::jsonb, true, 'Select Plan', 3);
