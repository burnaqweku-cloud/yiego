import { describe, expect, it } from "vitest";
import { exactOrderReference, findAdminOrder, type OrderSearchDatabase } from "./admin-order-search";

function database(data: unknown[], error: { message: string } | null = null) {
  const calls: string[] = [];
  const result = { data, error };
  const query = {
    select: () => query,
    or: (filters: string) => { calls.push(filters); return query; },
    order: () => query,
    limit: () => query,
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return { db: { from: () => query } as unknown as OrderSearchDatabase, calls };
}

describe("admin historical lookup", () => {
  it("finds YG-302433AD1F directly regardless of age or paid status", async () => {
    const old = { id: "old", order_reference: "YG-302433AD1F", status: "paid", payment_status: "succeeded", created_at: "2026-10-20T10:45:31Z" };
    const { db, calls } = database([old]);
    expect(await findAdminOrder(db, " yg-302433ad1f ")).toEqual(old);
    expect(calls[0]).toContain('order_reference.ilike."yg-302433ad1f"');
    expect(calls[0]).not.toMatch(/created_at|paid_at|status/);
  });
  it("distinguishes failed reads from a missing order", async () => {
    const { db } = database([], { message: "offline" });
    await expect(findAdminOrder(db, "YG-302433AD1F")).rejects.toThrow("Could not search orders");
  });
  it("returns null only after a successful empty lookup", async () => {
    expect(await findAdminOrder(database([]).db, "YG-UNKNOWN")).toBeNull();
  });
  it("normalizes a complete reference for both order list searches", () => {
    expect(exactOrderReference(" yg-302433ad1f ")).toBe("YG-302433AD1F");
    expect(exactOrderReference("MTN")).toBeNull();
  });
  it("looks up phones in both local and E.164 forms", async () => {
    const { db, calls } = database([]);
    await findAdminOrder(db, "0559167397");
    expect(calls[0]).toContain('recipient_phone.eq."+233559167397"');
  });
});