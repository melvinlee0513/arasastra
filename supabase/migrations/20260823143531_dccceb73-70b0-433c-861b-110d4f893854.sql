CREATE TABLE public.support_tickets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  center_id uuid REFERENCES public.tuition_centers(id) ON DELETE SET NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  role_snapshot text,
  requester_email text,
  category text NOT NULL,
  subject text NOT NULL,
  description text NOT NULL,
  source_page_url text,
  attachment_path text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_tickets_status_check CHECK (status IN ('open','in_progress','waiting_for_user','resolved','closed')),
  CONSTRAINT support_tickets_category_check CHECK (char_length(category) BETWEEN 1 AND 60),
  CONSTRAINT support_tickets_subject_check CHECK (char_length(subject) BETWEEN 3 AND 120),
  CONSTRAINT support_tickets_description_check CHECK (char_length(description) BETWEEN 10 AND 3000)
);

GRANT SELECT ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Submitters can read their own support tickets"
ON public.support_tickets FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Superadmins can read all support tickets"
ON public.support_tickets FOR SELECT TO authenticated
USING (public.is_superadmin());

CREATE POLICY "Superadmins can update support tickets"
ON public.support_tickets FOR UPDATE TO authenticated
USING (public.is_superadmin())
WITH CHECK (public.is_superadmin());

CREATE INDEX support_tickets_center_created_idx ON public.support_tickets (center_id, created_at DESC);
CREATE INDEX support_tickets_user_idx ON public.support_tickets (user_id, created_at DESC);

CREATE TRIGGER support_tickets_touch_updated_at
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();