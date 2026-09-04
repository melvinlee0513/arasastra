CREATE OR REPLACE FUNCTION public.can_read_quiz_media(_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT public.can_write_quiz_media(_name)
      OR EXISTS (
           SELECT 1
             FROM public.quiz_questions qq
             JOIN public.quizzes q ON q.id = qq.quiz_id
            WHERE qq.image_path = 'quiz-question-media/' || _name
              AND public.is_enrolled_in_class(q.class_id)
              AND (
                    q.status = 'published'
                 OR EXISTS (
                      SELECT 1 FROM public.quiz_attempts a
                       WHERE a.quiz_id = q.id
                         AND a.user_id = auth.uid()
                    )
              )
         );
$function$;