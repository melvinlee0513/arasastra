
-- 1. Add tenant subdomain fields
ALTER TABLE public.tuition_centers
  ADD COLUMN IF NOT EXISTS subdomain_slug text,
  ADD COLUMN IF NOT EXISTS domain_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS domain_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_by uuid;

-- Unique, case-insensitive slug
CREATE UNIQUE INDEX IF NOT EXISTS tuition_centers_subdomain_slug_key
  ON public.tuition_centers (lower(subdomain_slug))
  WHERE subdomain_slug IS NOT NULL;

-- Status must be one of the accepted values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tuition_centers_domain_status_check'
  ) THEN
    ALTER TABLE public.tuition_centers
      ADD CONSTRAINT tuition_centers_domain_status_check
      CHECK (domain_status IN ('pending','active','disabled'));
  END IF;
END$$;

-- Slug format validation (lowercase, alnum + hyphen, 3-50 chars, no leading/trailing hyphen)
CREATE OR REPLACE FUNCTION public.validate_tenant_subdomain()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  reserved text[] := ARRAY[
    'www','app','admin','api','auth','dashboard','superadmin',
    'arasaplus','support','mail','static','assets','cdn','status'
  ];
BEGIN
  IF NEW.subdomain_slug IS NOT NULL THEN
    NEW.subdomain_slug := lower(trim(NEW.subdomain_slug));
    IF NEW.subdomain_slug !~ '^[a-z0-9]([a-z0-9-]{1,48}[a-z0-9])$' THEN
      RAISE EXCEPTION 'Invalid subdomain slug: must be 3-50 chars, lowercase letters, numbers, hyphens only, and cannot start/end with a hyphen';
    END IF;
    IF NEW.subdomain_slug = ANY(reserved) THEN
      RAISE EXCEPTION 'Reserved subdomain slug: %', NEW.subdomain_slug;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_tenant_subdomain ON public.tuition_centers;
CREATE TRIGGER trg_validate_tenant_subdomain
  BEFORE INSERT OR UPDATE ON public.tuition_centers
  FOR EACH ROW EXECUTE FUNCTION public.validate_tenant_subdomain();

-- 2. Superadmin-only writes on tuition_centers
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tuition_centers TO authenticated;
GRANT ALL ON public.tuition_centers TO service_role;

DROP POLICY IF EXISTS "Superadmins can insert centers" ON public.tuition_centers;
CREATE POLICY "Superadmins can insert centers"
  ON public.tuition_centers FOR INSERT
  TO authenticated
  WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS "Superadmins can update centers" ON public.tuition_centers;
CREATE POLICY "Superadmins can update centers"
  ON public.tuition_centers FOR UPDATE
  TO authenticated
  USING (public.is_superadmin())
  WITH CHECK (public.is_superadmin());

DROP POLICY IF EXISTS "Superadmins can delete centers" ON public.tuition_centers;
CREATE POLICY "Superadmins can delete centers"
  ON public.tuition_centers FOR DELETE
  TO authenticated
  USING (public.is_superadmin());

-- 3. Public resolver so unauthenticated visitors on a tenant subdomain
-- can load the tenant branding without exposing the whole table.
CREATE OR REPLACE FUNCTION public.resolve_tenant_by_subdomain(_slug text)
RETURNS TABLE(id uuid, name text, logo_url text, domain_status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT c.id, c.name, c.logo_url, c.domain_status
  FROM public.tuition_centers c
  WHERE c.subdomain_slug = lower(trim(_slug))
    AND c.domain_status = 'active'
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.resolve_tenant_by_subdomain(text) TO anon, authenticated;
