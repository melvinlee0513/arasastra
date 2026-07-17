
CREATE TABLE public.class_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.tuition_centers(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  is_pinned boolean NOT NULL DEFAULT false,
  publish_at timestamptz,
  published_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz,
  CONSTRAINT class_announcements_status_check CHECK (status IN ('draft','scheduled','published','archived')),
  CONSTRAINT class_announcements_title_len CHECK (char_length(title) BETWEEN 1 AND 200),
  CONSTRAINT class_announcements_body_len CHECK (char_length(body) <= 10000)
);

CREATE INDEX class_announcements_center_idx  ON public.class_announcements(center_id);
CREATE INDEX class_announcements_class_idx   ON public.class_announcements(class_id);
CREATE INDEX class_announcements_status_idx  ON public.class_announcements(status);
CREATE INDEX class_announcements_publish_idx ON public.class_announcements(publish_at);
CREATE INDEX class_announcements_pinned_idx  ON public.class_announcements(class_id, is_pinned, published_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_announcements TO authenticated;
GRANT ALL ON public.class_announcements TO service_role;

ALTER TABLE public.class_announcements ENABLE ROW LEVEL SECURITY;

-- Read: admins in same centre
CREATE POLICY "Admins read same-centre announcements"
  ON public.class_announcements FOR SELECT TO authenticated
  USING (public.is_admin() AND public.same_center_as_current_user(center_id));

-- Read: assigned tutors of the class
CREATE POLICY "Assigned tutors read announcements"
  ON public.class_announcements FOR SELECT TO authenticated
  USING (public.is_tutor_of_class(class_id));

-- Read: enrolled students see only visible published announcements
CREATE POLICY "Enrolled students read visible announcements"
  ON public.class_announcements FOR SELECT TO authenticated
  USING (
    public.same_center_as_current_user(center_id)
    AND public.is_enrolled_in_class(class_id)
    AND status = 'published'
    AND (publish_at IS NULL OR publish_at <= now())
    AND (expires_at IS NULL OR expires_at > now())
  );

-- Manage (insert/update/delete): assigned tutors and same-centre admins
CREATE POLICY "Tutors manage class announcements (insert)"
  ON public.class_announcements FOR INSERT TO authenticated
  WITH CHECK (
    author_user_id = auth.uid()
    AND (
      public.is_tutor_of_class(class_id)
      OR (public.is_admin() AND public.same_center_as_current_user(center_id))
    )
  );

CREATE POLICY "Tutors manage class announcements (update)"
  ON public.class_announcements FOR UPDATE TO authenticated
  USING (
    public.is_tutor_of_class(class_id)
    OR (public.is_admin() AND public.same_center_as_current_user(center_id))
  )
  WITH CHECK (
    public.is_tutor_of_class(class_id)
    OR (public.is_admin() AND public.same_center_as_current_user(center_id))
  );

CREATE POLICY "Tutors manage class announcements (delete)"
  ON public.class_announcements FOR DELETE TO authenticated
  USING (
    public.is_tutor_of_class(class_id)
    OR (public.is_admin() AND public.same_center_as_current_user(center_id))
  );

-- Trigger: sync center_id from class, stamp timestamps
CREATE OR REPLACE FUNCTION public.class_announcements_enforce()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_class_center uuid;
BEGIN
  SELECT center_id INTO v_class_center FROM public.classes WHERE id = NEW.class_id;
  IF v_class_center IS NULL THEN
    RAISE EXCEPTION 'class not found';
  END IF;
  NEW.center_id := v_class_center;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'published' AND NEW.published_at IS NULL THEN
      NEW.published_at := now();
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
    IF NEW.status = 'published' AND OLD.status IS DISTINCT FROM 'published' AND NEW.published_at IS NULL THEN
      NEW.published_at := now();
    END IF;
    -- edited stamp when meaningful content changes after first publish
    IF OLD.published_at IS NOT NULL
       AND (NEW.title IS DISTINCT FROM OLD.title OR NEW.body IS DISTINCT FROM OLD.body) THEN
      NEW.edited_at := now();
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER class_announcements_before_write
BEFORE INSERT OR UPDATE ON public.class_announcements
FOR EACH ROW EXECUTE FUNCTION public.class_announcements_enforce();

-- Read receipts
CREATE TABLE public.announcement_reads (
  announcement_id uuid NOT NULL REFERENCES public.class_announcements(id) ON DELETE CASCADE,
  student_user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (announcement_id, student_user_id)
);

CREATE INDEX announcement_reads_student_idx ON public.announcement_reads(student_user_id);

GRANT SELECT, INSERT, DELETE ON public.announcement_reads TO authenticated;
GRANT ALL ON public.announcement_reads TO service_role;

ALTER TABLE public.announcement_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students manage own read receipts (select)"
  ON public.announcement_reads FOR SELECT TO authenticated
  USING (student_user_id = auth.uid());

CREATE POLICY "Students insert own read receipts"
  ON public.announcement_reads FOR INSERT TO authenticated
  WITH CHECK (
    student_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.class_announcements a
      WHERE a.id = announcement_id
        AND a.status = 'published'
        AND (a.publish_at IS NULL OR a.publish_at <= now())
        AND (a.expires_at IS NULL OR a.expires_at > now())
        AND public.is_enrolled_in_class(a.class_id)
    )
  );

CREATE POLICY "Students delete own read receipts"
  ON public.announcement_reads FOR DELETE TO authenticated
  USING (student_user_id = auth.uid());
