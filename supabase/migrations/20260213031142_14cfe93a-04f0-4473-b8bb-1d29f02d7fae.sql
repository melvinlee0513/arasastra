
-- Fix 1: Restrict profiles SELECT to own profile + admins
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING ((user_id = auth.uid()) OR is_admin());

-- Fix 2: Make payment-receipts bucket private and add proper storage policies
UPDATE storage.buckets SET public = false WHERE id = 'payment-receipts';

-- Drop any existing overly permissive policies on payment-receipts
DROP POLICY IF EXISTS "Anyone can view payment receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view receipts" ON storage.objects;

-- Owner + admin can view their receipts
CREATE POLICY "Users can view own payment receipts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'payment-receipts' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.is_admin()
  )
);
