-- The Delivery Progress panel: a status banner plus timed rows, mirroring what
-- the supplier shows its own agents. Rows the admin types live here; the
-- measured row is filled from the tracker snapshot at read time.
alter table phase1.suppliers
  add column if not exists delivery_panel jsonb not null default '{}'::jsonb;

comment on column phase1.suppliers.delivery_panel is
  'Admin-authored Delivery Progress panel: {banner, rows:[{label,value,detail,tone}]}. Anything set here is shown verbatim.';
notify pgrst, 'reload schema';
