import { describe, expect, it } from "vitest";
import { PAGE_ROWS, readAll } from "./readAll";

// A stand-in for a supabase-js query: thenable-only, capped at 1,000 rows a read like the real API.
function table(total: number, failAt?: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ i }));
  const calls: [number, number][] = [];
  const page = () => ({
    range: (from: number, to: number) => {
      calls.push([from, to]);
      const res = failAt != null && from >= failAt ? { data: null, error: new Error("boom") } : { data: rows.slice(from, Math.min(to + 1, from + PAGE_ROWS)), error: null };
      return { then: (ok: (v: typeof res) => unknown) => Promise.resolve(ok(res)) } as PromiseLike<typeof res>;
    },
  });
  return { page, calls };
}

describe("readAll", () => {
  it("reads past 1,000 rows", async () => {
    const t = table(2345);
    const r = await readAll(t.page);
    expect(r.error).toBeNull();
    expect(r.data).toHaveLength(2345);
    expect(r.data[2344]).toEqual({ i: 2344 });
    expect(t.calls).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });
  it("stops after one read when there are fewer than 1,000", async () => {
    const t = table(12);
    expect((await readAll(t.page)).data).toHaveLength(12);
    expect(t.calls).toHaveLength(1);
  });
  it("asks once more when the total is an exact multiple of 1,000", async () => {
    const t = table(2000);
    expect((await readAll(t.page)).data).toHaveLength(2000);
    expect(t.calls).toHaveLength(3);
  });
  it("returns what it has and the error when a page fails", async () => {
    const t = table(3000, 1000);
    const r = await readAll(t.page);
    expect(r.data).toHaveLength(1000);
    expect(r.error).toBeInstanceOf(Error);
  });
  it("never reads more than maxPages", async () => {
    const t = table(10000);
    expect((await readAll(t.page, 3)).data).toHaveLength(3000);
  });
});
