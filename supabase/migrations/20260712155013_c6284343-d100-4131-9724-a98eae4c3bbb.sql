DROP POLICY IF EXISTS "Anyone can view published classes" ON public.classes;

CREATE POLICY "Authenticated users can view published classes"
ON public.classes
FOR SELECT
TO authenticated
USING (status = 'published');

REVOKE SELECT ON public.classes FROM anon;