ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_home_header_color_check;

UPDATE public.profiles
SET home_header_color = CASE home_header_color
  WHEN 'red' THEN 'red'
  WHEN 'blue' THEN 'blue'
  WHEN 'purple' THEN 'purple'
  WHEN 'green' THEN 'green'
  WHEN 'yellow' THEN 'yellow'
  WHEN 'orange' THEN 'orange'
  WHEN 'indigo' THEN 'blue'
  WHEN 'slate' THEN 'blue'
  WHEN 'teal' THEN 'green'
  WHEN 'emerald' THEN 'green'
  WHEN 'coral' THEN 'red'
  ELSE 'red'
END;

ALTER TABLE public.profiles ALTER COLUMN home_header_color SET DEFAULT 'red';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_home_header_color_check
  CHECK (home_header_color IN ('red','blue','purple','green','yellow','orange'));