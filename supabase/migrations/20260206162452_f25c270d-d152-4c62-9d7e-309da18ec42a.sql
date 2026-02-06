
-- Make payment-receipts bucket public so receipts can be viewed via public URLs
UPDATE storage.buckets SET public = true WHERE id = 'payment-receipts';
