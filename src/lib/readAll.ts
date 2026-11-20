/* Every read through the API returns at most 1,000 rows, whatever .limit() asks for. A page that counts or adds up
   rows it read would silently stop at 1,000 (20 Nov 2026: the Orders card said "1000" for a week of 1,331 orders).
   readAll reads a query in pages of 1,000 until a page comes back short. `page` must build the SAME query each time,
   ordered by something unique at the end (add .order("id")), so no row is skipped or read twice between pages.
   Totals over a whole table are still better added up in the database; this is for screens that need the rows. */

export const PAGE_ROWS = 1000;

type Page<T> = { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error?: unknown }> };

export async function readAll<T>(page: () => Page<T>, maxPages = 50): Promise<{ data: T[]; error: unknown }> {
  const out: T[] = [];
  for (let i = 0; i < maxPages; i++) {
    const r = await page().range(i * PAGE_ROWS, i * PAGE_ROWS + PAGE_ROWS - 1);
    if (r.error) return { data: out, error: r.error };
    const batch = r.data ?? [];
    out.push(...batch);
    if (batch.length < PAGE_ROWS) break;
  }
  return { data: out, error: null };
}
