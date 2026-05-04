# Bulk Dispatch Queue — Rollback Scripts

These SQL files are **documentation** for admin/operator use. They are NOT run
automatically. They exist so that, if a Phase 1 migration ever needs to be
manually rolled back, the exact reverse statements are available.

## Phase 1A — Foundation (additive schema)

File: `phase1a_bulk_dispatch_foundation_rollback.sql`

### Safety preconditions (verify ALL before running)

1. The feature flag is **off**:
   ```sql
   SELECT value FROM site_settings WHERE key = 'bulk_dispatch_queue_enabled';
   -- expect: {"enabled": false, ...}
   ```
2. No items in the queue reference `agent_orders`:
   ```sql
   SELECT count(*) FROM dispatch_batch_items WHERE order_table = 'agent_orders';
   -- expect: 0
   ```
3. No live orders are in any queue state:
   ```sql
   SELECT count(*) FROM orders WHERE queue_state IS NOT NULL;
   SELECT count(*) FROM agent_orders WHERE queue_state IS NOT NULL;
   -- expect: 0 for both
   ```

If any of the above is non-zero, **do not run the rollback** — there is live
queue data that depends on the new columns.

---

## Phase 1A rollback SQL

```sql
-- Drop partial indexes
DROP INDEX IF EXISTS public.idx_orders_queue_state_network;
DROP INDEX IF EXISTS public.idx_agent_orders_queue_state_network;
DROP INDEX IF EXISTS public.idx_dispatch_batch_items_order_table;

-- Drop CHECK constraints
ALTER TABLE public.dispatch_batch_items
  DROP CONSTRAINT IF EXISTS dispatch_batch_items_order_table_check;
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_queue_state_check;
ALTER TABLE public.agent_orders
  DROP CONSTRAINT IF EXISTS agent_orders_queue_state_check;

-- Drop columns
ALTER TABLE public.dispatch_batch_items DROP COLUMN IF EXISTS order_table;
ALTER TABLE public.orders DROP COLUMN IF EXISTS queue_state;
ALTER TABLE public.agent_orders DROP COLUMN IF EXISTS queue_state;
ALTER TABLE public.agent_orders DROP COLUMN IF EXISTS failure_reason;

-- Remove feature flag row
DELETE FROM public.site_settings WHERE key = 'bulk_dispatch_queue_enabled';
```

---

## Phase 1B — RPC functions

The Phase 1B migration creates 5 RPC functions. To roll back, drop them:

```sql
DROP FUNCTION IF EXISTS public.generate_bulk_dispatch_batches(text);
DROP FUNCTION IF EXISTS public.mark_batch_sent(uuid, text);
DROP FUNCTION IF EXISTS public.mark_batch_delivered(uuid, text);
DROP FUNCTION IF EXISTS public.mark_order_in_batch_failed(uuid, text);
DROP FUNCTION IF EXISTS public.resolve_failed_batch_order(uuid, text, text);
```

Safe to run anytime — no live code path depends on them while the feature flag
is off.
