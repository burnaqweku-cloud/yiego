/**
 * Reusable count / aggregate helpers.
 *
 * IMPORTANT: never use `array.length` from a paginated/limited query as
 * a "total". Use these helpers (or the Supabase `{ count: 'exact', head: true }`
 * pattern) so displayed totals reflect the real database total — never the
 * fetched page size.
 *
 * - `getExactCount(table, build?)` — true row count via head query.
 * - `fetchPaginatedWithCount(table, ...)` — list rows + true total in one call.
 * - `sumColumn(table, column, build?)` — efficient client-side sum that
 *    pages through rows in chunks (when no DB aggregate RPC is available).
 *
 * These accept an optional `build` callback to apply filters
 * (`.eq()`, `.gte()`, `.in()`, etc.) — keeps the API generic.
 */
import { supabase } from '@/integrations/supabase/client';

type AnyQuery = any;
type Builder = (q: AnyQuery) => AnyQuery;

/** True row count for a table (optionally filtered). Returns 0 on error. */
export async function getExactCount(table: string, build?: Builder): Promise<number> {
  let q: AnyQuery = (supabase as any).from(table).select('*', { count: 'exact', head: true });
  if (build) q = build(q);
  const { count, error } = await q;
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(`[getExactCount] ${table}:`, error.message);
    return 0;
  }
  return count || 0;
}

/** Run multiple count queries in parallel; returns object keyed by name. */
export async function getCounts<K extends string>(
  table: string,
  variants: Record<K, Builder | undefined>
): Promise<Record<K, number>> {
  const keys = Object.keys(variants) as K[];
  const results = await Promise.all(
    keys.map((k) => getExactCount(table, variants[k]))
  );
  const out = {} as Record<K, number>;
  keys.forEach((k, i) => { out[k] = results[i]; });
  return out;
}

/** Paginated list + exact total count in one call. */
export async function fetchPaginatedWithCount<T = any>(
  table: string,
  opts: {
    select?: string;
    page?: number;       // 1-indexed
    pageSize?: number;   // rows per page
    orderBy?: { column: string; ascending?: boolean };
    build?: Builder;     // apply filters
  } = {}
): Promise<{ data: T[]; totalCount: number; page: number; pageSize: number; totalPages: number }> {
  const page = Math.max(1, opts.page || 1);
  const pageSize = Math.max(1, opts.pageSize || 50);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let dataQ: AnyQuery = (supabase as any).from(table).select(opts.select || '*');
  if (opts.build) dataQ = opts.build(dataQ);
  if (opts.orderBy) dataQ = dataQ.order(opts.orderBy.column, { ascending: !!opts.orderBy.ascending });
  dataQ = dataQ.range(from, to);

  const [{ data, error: listErr }, totalCount] = await Promise.all([
    dataQ,
    getExactCount(table, opts.build),
  ]);

  if (listErr) {
    // eslint-disable-next-line no-console
    console.warn(`[fetchPaginatedWithCount] ${table}:`, listErr.message);
  }

  return {
    data: (data || []) as T[],
    totalCount,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

/**
 * Sum a numeric column without pulling the whole table to the client.
 * Pages through rows in chunks (default 1000) but only fetches the column.
 * For very large tables prefer a Postgres RPC; this is a safe fallback.
 */
export async function sumColumn(
  table: string,
  column: string,
  build?: Builder,
  chunkSize = 1000
): Promise<number> {
  let total = 0;
  let from = 0;
  // Hard safety cap (1M rows) to prevent runaway loops.
  const MAX = 1_000_000;
  while (from < MAX) {
    let q: AnyQuery = (supabase as any).from(table).select(column);
    if (build) q = build(q);
    q = q.range(from, from + chunkSize - 1);
    const { data, error } = await q;
    if (error) {
      // eslint-disable-next-line no-console
      console.warn(`[sumColumn] ${table}.${column}:`, error.message);
      break;
    }
    const rows = (data || []) as any[];
    for (const r of rows) total += Number(r?.[column] || 0);
    if (rows.length < chunkSize) break;
    from += chunkSize;
  }
  return total;
}

/** Format a large number with thousands separators. */
export function formatCount(n: number | null | undefined): string {
  const v = Number(n || 0);
  return v.toLocaleString('en-US');
}
