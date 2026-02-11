
-- Add onboarding columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_registered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS parent_name text,
  ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.pricing_plans(id);
