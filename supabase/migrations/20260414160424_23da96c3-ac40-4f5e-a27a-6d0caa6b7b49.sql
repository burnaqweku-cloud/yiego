
-- Dispatch batches table
CREATE TABLE public.dispatch_batches (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_number TEXT NOT NULL,
  network TEXT NOT NULL,
  bundle_size_gb NUMERIC NOT NULL,
  bundle_label TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  order_count INT NOT NULL DEFAULT 0,
  notes TEXT,
  created_by TEXT,
  copied_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  sent_by TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dispatch_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage dispatch_batches"
ON public.dispatch_batches FOR ALL
TO authenticated
USING (public.is_admin_or_staff())
WITH CHECK (public.is_admin_or_staff());

-- Dispatch batch items table
CREATE TABLE public.dispatch_batch_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  batch_id UUID NOT NULL REFERENCES public.dispatch_batches(id) ON DELETE CASCADE,
  order_id TEXT NOT NULL,
  order_uuid UUID,
  recipient_number TEXT NOT NULL,
  bundle_size_gb NUMERIC NOT NULL,
  network TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dispatch_batch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage dispatch_batch_items"
ON public.dispatch_batch_items FOR ALL
TO authenticated
USING (public.is_admin_or_staff())
WITH CHECK (public.is_admin_or_staff());

CREATE INDEX idx_dispatch_batch_items_batch_id ON public.dispatch_batch_items(batch_id);
CREATE INDEX idx_dispatch_batch_items_order_id ON public.dispatch_batch_items(order_id);
CREATE INDEX idx_dispatch_batches_status ON public.dispatch_batches(status);
CREATE INDEX idx_dispatch_batches_network ON public.dispatch_batches(network);

CREATE TRIGGER update_dispatch_batches_updated_at
BEFORE UPDATE ON public.dispatch_batches
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
