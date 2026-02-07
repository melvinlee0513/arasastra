
-- Add rating and years_experience columns to tutors table
ALTER TABLE public.tutors 
ADD COLUMN IF NOT EXISTS rating numeric DEFAULT 4.8,
ADD COLUMN IF NOT EXISTS years_experience integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS student_count integer DEFAULT 0;
