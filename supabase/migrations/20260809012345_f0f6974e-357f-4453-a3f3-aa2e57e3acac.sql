CREATE TABLE public.class_about_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  center_id uuid NOT NULL REFERENCES public.tuition_centers(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text,
  image_path text,
  display_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX class_about_sections_class_order_idx
  ON public.class_about_sections (class_id, display_order, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.class_about_sections TO authenticated;
GRANT ALL ON public.class_about_sections TO service_role;

ALTER TABLE public.class_about_sections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "about_sections read student"
  ON public.class_about_sections FOR SELECT TO authenticated
  USING (public.is_enrolled_in_class(class_id));

CREATE POLICY "about_sections read manager"
  ON public.class_about_sections FOR SELECT TO authenticated
  USING (public.can_manage_class(class_id));

CREATE POLICY "about_sections insert manager"
  ON public.class_about_sections FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_class(class_id) AND center_id = (SELECT c.center_id FROM public.classes c WHERE c.id = class_id));

CREATE POLICY "about_sections update manager"
  ON public.class_about_sections FOR UPDATE TO authenticated
  USING (public.can_manage_class(class_id))
  WITH CHECK (public.can_manage_class(class_id) AND center_id = (SELECT c.center_id FROM public.classes c WHERE c.id = class_id));

CREATE POLICY "about_sections delete manager"
  ON public.class_about_sections FOR DELETE TO authenticated
  USING (public.can_manage_class(class_id));

CREATE TRIGGER class_about_sections_touch
  BEFORE UPDATE ON public.class_about_sections
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ── Migrate legacy fixed-field About data into ordered blocks ──────────────
INSERT INTO public.class_about_sections (center_id, class_id, title, content, display_order, created_by, created_at, updated_at)
SELECT a.center_id, a.class_id, s.title, s.body, s.ord, a.updated_by, a.created_at, a.updated_at
FROM public.class_about a
CROSS JOIN LATERAL (
  VALUES
    ('Overview', a.overview, 0),
    ('Learning objectives', a.learning_objectives, 1),
    ('Preparation requirements', a.preparation_requirements, 2),
    ('Class expectations', a.class_expectations, 3),
    ('Contact & questions', a.contact_guidance, 4),
    ('Venue / meeting info', a.venue_or_meeting_info, 5)
) AS s(title, body, ord)
WHERE s.body IS NOT NULL AND btrim(s.body) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.class_about_sections x WHERE x.class_id = a.class_id
  );

-- ── Secure mutations ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.save_class_about_section(
  p_class_id uuid,
  p_title text,
  p_content text DEFAULT NULL,
  p_image_path text DEFAULT NULL,
  p_section_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_center uuid;
  v_title text := btrim(coalesce(p_title, ''));
  v_id uuid;
  v_next integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF v_title = '' THEN RAISE EXCEPTION 'title_required'; END IF;
  IF length(v_title) > 200 THEN RAISE EXCEPTION 'title_too_long'; END IF;
  IF p_content IS NOT NULL AND length(p_content) > 8000 THEN RAISE EXCEPTION 'content_too_long'; END IF;

  SELECT c.center_id INTO v_center FROM public.classes c WHERE c.id = p_class_id;
  IF v_center IS NULL THEN RAISE EXCEPTION 'class_not_found'; END IF;
  IF NOT public.can_manage_class(p_class_id) THEN RAISE EXCEPTION 'not_authorised'; END IF;

  IF p_image_path IS NOT NULL AND p_image_path <> ''
     AND p_image_path NOT LIKE 'class-about/' || v_center::text || '/' || p_class_id::text || '/%' THEN
    RAISE EXCEPTION 'invalid_image_path';
  END IF;

  IF p_section_id IS NULL THEN
    SELECT coalesce(max(display_order), -1) + 1 INTO v_next
      FROM public.class_about_sections WHERE class_id = p_class_id;
    INSERT INTO public.class_about_sections
      (center_id, class_id, title, content, image_path, display_order, created_by)
    VALUES
      (v_center, p_class_id, v_title, nullif(btrim(coalesce(p_content, '')), ''),
       nullif(p_image_path, ''), v_next, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.class_about_sections
       SET title = v_title,
           content = nullif(btrim(coalesce(p_content, '')), ''),
           image_path = nullif(p_image_path, '')
     WHERE id = p_section_id AND class_id = p_class_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'section_not_found'; END IF;
  END IF;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_class_about_section(uuid, text, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_class_about_section(uuid, text, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_class_about_section(p_section_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_class uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  SELECT class_id INTO v_class FROM public.class_about_sections WHERE id = p_section_id;
  IF v_class IS NULL THEN RETURN false; END IF;
  IF NOT public.can_manage_class(v_class) THEN RAISE EXCEPTION 'not_authorised'; END IF;
  DELETE FROM public.class_about_sections WHERE id = p_section_id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_class_about_section(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_class_about_section(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reorder_class_about_sections(
  p_class_id uuid,
  p_section_ids uuid[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected integer;
  v_given integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;
  IF NOT public.can_manage_class(p_class_id) THEN RAISE EXCEPTION 'not_authorised'; END IF;

  SELECT count(*) INTO v_expected FROM public.class_about_sections WHERE class_id = p_class_id;
  SELECT count(DISTINCT x) INTO v_given FROM unnest(coalesce(p_section_ids, '{}'::uuid[])) AS x;
  IF v_expected <> v_given THEN RAISE EXCEPTION 'incomplete_sibling_set'; END IF;

  IF EXISTS (
    SELECT 1 FROM unnest(p_section_ids) AS x
    WHERE NOT EXISTS (
      SELECT 1 FROM public.class_about_sections s WHERE s.id = x AND s.class_id = p_class_id
    )
  ) THEN
    RAISE EXCEPTION 'invalid_sibling_set';
  END IF;

  UPDATE public.class_about_sections s
     SET display_order = ord.idx - 1
    FROM unnest(p_section_ids) WITH ORDINALITY AS ord(sid, idx)
   WHERE s.id = ord.sid AND s.class_id = p_class_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_class_about_sections(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_class_about_sections(uuid, uuid[]) TO authenticated;