REVOKE ALL ON public.quizzes FROM anon;
REVOKE ALL ON public.quiz_questions FROM anon;
REVOKE ALL ON public.quiz_options FROM anon;
REVOKE ALL ON public.quiz_attempts FROM anon;
REVOKE ALL ON public.quiz_results FROM anon;
REVOKE ALL ON public.student_quiz_answers FROM anon;
REVOKE ALL ON public.classes FROM anon;

REVOKE EXECUTE ON FUNCTION public.get_quiz_definition_for_manager(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_quiz_definition_for_manager(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_learning_activity(text, integer, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_learning_activity(text, integer, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_quiz_definition_for_manager(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_learning_activity(text, integer, uuid, text) TO authenticated, service_role;