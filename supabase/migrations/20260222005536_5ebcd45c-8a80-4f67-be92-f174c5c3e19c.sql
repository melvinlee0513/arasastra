
-- Create quiz_attempts table for save/resume functionality
CREATE TABLE public.quiz_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'in-progress',
  score INTEGER NOT NULL DEFAULT 0,
  current_question_index INTEGER NOT NULL DEFAULT 0,
  saved_answers JSONB NOT NULL DEFAULT '[]'::jsonb,
  streak INTEGER NOT NULL DEFAULT 0,
  power_ups_used JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

-- Users can view their own attempts
CREATE POLICY "Users can view own attempts"
  ON public.quiz_attempts FOR SELECT
  USING ((user_id = auth.uid()) OR is_admin());

-- Users can insert own attempts
CREATE POLICY "Users can insert own attempts"
  ON public.quiz_attempts FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Users can update own attempts
CREATE POLICY "Users can update own attempts"
  ON public.quiz_attempts FOR UPDATE
  USING (user_id = auth.uid());

-- Users can delete own attempts
CREATE POLICY "Users can delete own attempts"
  ON public.quiz_attempts FOR DELETE
  USING (user_id = auth.uid());

-- Admins can manage all
CREATE POLICY "Admins can manage all attempts"
  ON public.quiz_attempts FOR ALL
  USING (is_admin());

-- Trigger for updated_at
CREATE TRIGGER update_quiz_attempts_updated_at
  BEFORE UPDATE ON public.quiz_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();
