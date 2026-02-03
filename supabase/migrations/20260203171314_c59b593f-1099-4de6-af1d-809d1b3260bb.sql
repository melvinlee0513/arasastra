-- Create storage bucket for payment receipts
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for payment-receipts bucket
CREATE POLICY "Users can upload their own receipts"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'payment-receipts' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own receipts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'payment-receipts' 
  AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin())
);

CREATE POLICY "Admins can view all receipts"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'payment-receipts' 
  AND public.is_admin()
);

-- Create payment_submissions table
CREATE TABLE public.payment_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  receipt_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_submissions ENABLE ROW LEVEL SECURITY;

-- Users can view their own submissions
CREATE POLICY "Users can view their own submissions"
ON public.payment_submissions FOR SELECT
USING (user_id = auth.uid() OR public.is_admin());

-- Users can insert their own submissions
CREATE POLICY "Users can insert their own submissions"
ON public.payment_submissions FOR INSERT
WITH CHECK (user_id = auth.uid());

-- Only admins can update submissions
CREATE POLICY "Admins can update submissions"
ON public.payment_submissions FOR UPDATE
USING (public.is_admin());

-- Only admins can delete submissions
CREATE POLICY "Admins can delete submissions"
ON public.payment_submissions FOR DELETE
USING (public.is_admin());

-- Add trigger for updated_at
CREATE TRIGGER update_payment_submissions_updated_at
BEFORE UPDATE ON public.payment_submissions
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();