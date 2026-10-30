-- The supplier-logs lookup by order (action + status, newest first) ran ~47,000 times at ~0.3 s each with no index,
-- the biggest single load on the database during the 30 Oct outage. Applied live on 30 Oct 2026 (built concurrently).
create index concurrently if not exists supplier_api_logs_order_action_idx
  on phase1.supplier_api_logs (order_id, action, call_status, created_at desc);
