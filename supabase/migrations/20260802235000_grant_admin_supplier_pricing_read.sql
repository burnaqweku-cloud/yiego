grant select on table phase1.supplier_product_mappings to authenticated;

comment on table phase1.supplier_product_mappings is
  'Supplier product mappings. Browser reads remain restricted by RLS to active Phase 1 administrators.';
