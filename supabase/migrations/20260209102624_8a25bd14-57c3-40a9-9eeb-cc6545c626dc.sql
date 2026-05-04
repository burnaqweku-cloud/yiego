-- Add expiry_type column to products table
ALTER TABLE public.products 
ADD COLUMN expiry_type text NOT NULL DEFAULT 'non_expiry';

-- Set all existing products to non_expiry
UPDATE public.products SET expiry_type = 'non_expiry' WHERE expiry_type IS NULL OR expiry_type = '';
