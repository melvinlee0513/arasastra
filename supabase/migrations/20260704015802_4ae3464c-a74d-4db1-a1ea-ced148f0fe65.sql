CREATE POLICY "Anon can read pending invitations by token"
ON public.invitations
FOR SELECT
TO anon, authenticated
USING (status = 'pending');

GRANT SELECT ON public.invitations TO anon;