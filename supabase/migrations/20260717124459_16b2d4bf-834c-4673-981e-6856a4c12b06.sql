CREATE TABLE public.class_about (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.tuition_centers(id) ON DELETE CASCADE,
  class_id uuid NOT NULL UNIQUE REFERENCES public.classes(id) ON DELETE CASCADE,
  overview text,
  learning_objectives text,
  preparation_requirements text,
  class_expectations text,
  contact_guidance text,
  venue_or_meeting_info text,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_class_about_center ON public.class_about(center_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_about TO authenticated;
GRANT ALL ON public.class_about TO service_role;

ALTER TABLE public.class_about ENABLE ROW LEVEL SECURITY;

-- Enforce class ↔ center consistency
CREATE OR REPLACE FUNCTION public.class_about_enforce_center()
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
  IF NEW.center_id IS DISTINCT FROM v_class_center THEN
    NEW.center_id := v_class_center;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_class_about_enforce_center
BEFORE INSERT OR UPDATE ON public.class_about
FOR EACH ROW EXECUTE FUNCTION public.class_about_enforce_center();

-- Read: same-center admin, assigned tutor, enrolled student
CREATE POLICY "class_about read admin"
ON public.class_about FOR SELECT TO authenticated
USING (public._admin_can_manage_center(center_id));

CREATE POLICY "class_about read tutor"
ON public.class_about FOR SELECT TO authenticated
USING (public.is_tutor_of_class(class_id));

CREATE POLICY "class_about read student"
ON public.class_about FOR SELECT TO authenticated
USING (public.is_enrolled_in_class(class_id));

-- Write: same-center admin OR assigned tutor
CREATE POLICY "class_about insert admin/tutor"
ON public.class_about FOR INSERT TO authenticated
WITH CHECK (
  public._admin_can_manage_center(center_id)
  OR public.is_tutor_of_class(class_id)
);

CREATE POLICY "class_about update admin/tutor"
ON public.class_about FOR UPDATE TO authenticated
USING (
  public._admin_can_manage_center(center_id)
  OR public.is_tutor_of_class(class_id)
)
WITH CHECK (
  public._admin_can_manage_center(center_id)
  OR public.is_tutor_of_class(class_id)
);

CREATE POLICY "class_about delete admin"
ON public.class_about FOR DELETE TO authenticated
USING (public._admin_can_manage_center(center_id));