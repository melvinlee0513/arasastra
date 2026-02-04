-- Add unique constraint on enrollments for student_id + subject_id
-- This enables the upsert functionality when approving payments
ALTER TABLE public.enrollments
ADD CONSTRAINT enrollments_student_subject_unique 
UNIQUE (student_id, subject_id);