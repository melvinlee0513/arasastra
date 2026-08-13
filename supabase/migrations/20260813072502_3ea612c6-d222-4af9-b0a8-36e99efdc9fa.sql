-- 1. Pin search_path on functions missing it
ALTER FUNCTION public._quiz_attempt_deadline(quiz_attempts, quizzes) SET search_path = public, pg_temp;
ALTER FUNCTION public.delete_email(text, bigint) SET search_path = public, pgmq, pg_temp;
ALTER FUNCTION public.enqueue_email(text, jsonb) SET search_path = public, pgmq, pg_temp;
ALTER FUNCTION public.move_to_dlq(text, text, bigint, jsonb) SET search_path = public, pgmq, pg_temp;
ALTER FUNCTION public.read_email_batch(text, integer, integer) SET search_path = public, pgmq, pg_temp;

-- 2. Revoke EXECUTE on internal / service-only SECURITY DEFINER functions
REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.email_queue_dispatch() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.email_queue_dispatch() TO service_role;

-- Trigger functions: EXECUTE is only checked at CREATE TRIGGER time, so API roles never need it
REVOKE ALL ON FUNCTION public.email_queue_wake() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.class_about_enforce_center() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.class_announcements_enforce() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.handle_new_user_bulletproof() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.profiles_profile_fields_guard() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.quizzes_visibility_guard() FROM anon, authenticated, PUBLIC;

-- Admin-only RPC must never be callable anonymously
REVOKE ALL ON FUNCTION public.admin_delete_user_account(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user_account(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.revoke_invitation(uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_invitation(uuid) TO authenticated;

-- 3. course-videos storage: drop over-permissive legacy policies
DROP POLICY IF EXISTS "Authenticated can upload course videos" ON storage.objects;
DROP POLICY IF EXISTS "Owners can update course videos" ON storage.objects;
DROP POLICY IF EXISTS "Owners or admins can delete course videos" ON storage.objects;

-- 4. notifications: broadcast rows must not be readable anonymously
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications"
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (user_id IS NULL AND auth.uid() IS NOT NULL));

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage all notifications" ON public.notifications;
CREATE POLICY "Admins can manage all notifications"
  ON public.notifications FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5. Quiz answer keys: ensure no API role can read answer columns directly
REVOKE ALL ON TABLE public.quiz_questions FROM anon, authenticated;
REVOKE ALL ON TABLE public.quiz_options FROM anon, authenticated;
GRANT ALL ON TABLE public.quiz_questions TO service_role;
GRANT ALL ON TABLE public.quiz_options TO service_role;