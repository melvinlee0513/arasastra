ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS admin_response text,
  ADD COLUMN IF NOT EXISTS responded_by uuid,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid;

CREATE INDEX IF NOT EXISTS support_tickets_center_created_idx ON public.support_tickets (center_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_user_created_idx ON public.support_tickets (user_id, created_at DESC);

CREATE TABLE public.support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  center_id uuid,
  actor_user_id uuid,
  actor_role text,
  action text NOT NULL CHECK (action IN ('created','status_changed','response_added','completed','reopened')),
  from_status text,
  to_status text,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.support_ticket_events TO authenticated;
GRANT ALL ON public.support_ticket_events TO service_role;
ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX support_ticket_events_ticket_idx ON public.support_ticket_events (ticket_id, created_at);

CREATE POLICY "Submitters read own ticket events" ON public.support_ticket_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid()));
CREATE POLICY "Centre admins read ticket events" ON public.support_ticket_events
  FOR SELECT TO authenticated
  USING (center_id IS NOT NULL AND public._admin_can_manage_center(center_id));
CREATE POLICY "Superadmins read ticket events" ON public.support_ticket_events
  FOR SELECT TO authenticated USING (public.is_superadmin());

CREATE POLICY "Centre admins read centre support tickets" ON public.support_tickets
  FOR SELECT TO authenticated
  USING (center_id IS NOT NULL AND public._admin_can_manage_center(center_id));

CREATE OR REPLACE FUNCTION public._support_ticket_created_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO public.support_ticket_events (ticket_id, center_id, actor_user_id, actor_role, action, to_status)
  VALUES (NEW.id, NEW.center_id, NEW.user_id, NEW.role_snapshot, 'created', NEW.status);
  INSERT INTO public.audit_logs (table_name, record_id, action, new_data, changed_by)
  VALUES ('support_tickets', NEW.id::text, 'support_request_created',
          jsonb_build_object('center_id', NEW.center_id, 'category', NEW.category), NEW.user_id);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public._support_ticket_created_event() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER support_ticket_created_event AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public._support_ticket_created_event();

-- Status lifecycle: open -> in_progress -> resolved (shown as "Completed").
CREATE OR REPLACE FUNCTION public.update_support_ticket(_ticket_id uuid, _status text DEFAULT NULL, _response text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
SET lock_timeout = '3s' AS $$
DECLARE
  t public.support_tickets;
  v_uid uuid := auth.uid();
  v_role text;
  v_resp text := NULLIF(btrim(COALESCE(_response, '')), '');
  v_new text;
  v_was_done boolean;
  v_now_done boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated' USING ERRCODE = '42501'; END IF;
  SELECT * INTO t FROM public.support_tickets WHERE id = _ticket_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT (public.is_superadmin() OR (t.center_id IS NOT NULL AND public._admin_can_manage_center(t.center_id))) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  v_role := CASE WHEN public.is_superadmin() THEN 'superadmin' ELSE 'admin' END;
  v_new := COALESCE(_status, t.status);
  IF v_new NOT IN ('open','in_progress','resolved') AND v_new <> t.status THEN
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;
  IF v_resp IS NOT NULL AND length(v_resp) > 4000 THEN RAISE EXCEPTION 'response_too_long' USING ERRCODE = '22023'; END IF;
  v_was_done := t.status IN ('resolved','closed');
  v_now_done := v_new IN ('resolved','closed');
  IF v_now_done AND NOT v_was_done AND v_resp IS NULL THEN
    RAISE EXCEPTION 'response_required' USING ERRCODE = '22023';
  END IF;

  IF v_resp IS NOT NULL THEN
    UPDATE public.support_tickets SET admin_response = v_resp, responded_by = v_uid, responded_at = now() WHERE id = t.id;
    INSERT INTO public.support_ticket_events (ticket_id, center_id, actor_user_id, actor_role, action, message)
    VALUES (t.id, t.center_id, v_uid, v_role, 'response_added', v_resp);
    INSERT INTO public.audit_logs (table_name, record_id, action, new_data, changed_by)
    VALUES ('support_tickets', t.id::text, 'support_request_response_added', jsonb_build_object('center_id', t.center_id, 'actor_role', v_role), v_uid);
  END IF;

  IF v_new <> t.status THEN
    UPDATE public.support_tickets SET status = v_new,
      resolved_at = CASE WHEN v_now_done THEN now() ELSE NULL END,
      resolved_by = CASE WHEN v_now_done THEN v_uid ELSE NULL END,
      updated_at = now()
    WHERE id = t.id;
    INSERT INTO public.support_ticket_events (ticket_id, center_id, actor_user_id, actor_role, action, from_status, to_status)
    VALUES (t.id, t.center_id, v_uid, v_role,
      CASE WHEN v_now_done THEN 'completed' WHEN v_was_done THEN 'reopened' ELSE 'status_changed' END,
      t.status, v_new);
    INSERT INTO public.audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
    VALUES ('support_tickets', t.id::text,
      CASE WHEN v_now_done THEN 'support_request_completed' ELSE 'support_request_status_changed' END,
      jsonb_build_object('status', t.status), jsonb_build_object('status', v_new, 'center_id', t.center_id, 'actor_role', v_role), v_uid);
  ELSE
    UPDATE public.support_tickets SET updated_at = now() WHERE id = t.id;
  END IF;

  IF t.user_id IS NOT NULL AND (v_resp IS NOT NULL OR v_new <> t.status) THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (t.user_id,
      CASE WHEN v_now_done THEN 'Support request completed' ELSE 'Support request updated' END,
      left(t.subject, 120), 'support');
  END IF;

  RETURN jsonb_build_object('id', t.id, 'status', v_new);
END $$;
REVOKE ALL ON FUNCTION public.update_support_ticket(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_support_ticket(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_read_support_attachment(_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.support_tickets t
    WHERE t.attachment_path = _name
      AND (t.user_id = auth.uid()
           OR public.is_superadmin()
           OR (t.center_id IS NOT NULL AND public._admin_can_manage_center(t.center_id)))
  )
$$;
REVOKE ALL ON FUNCTION public.can_read_support_attachment(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_support_attachment(text) TO authenticated;

CREATE POLICY "Support attachments readable by authorised users" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'support-attachments' AND public.can_read_support_attachment(name));