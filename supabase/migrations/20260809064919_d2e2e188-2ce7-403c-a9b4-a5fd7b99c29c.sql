ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_header_color text NOT NULL DEFAULT 'navy';

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_home_header_color_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_home_header_color_check
  CHECK (home_header_color IN ('navy','indigo','purple','teal','emerald','blue','coral','slate'));