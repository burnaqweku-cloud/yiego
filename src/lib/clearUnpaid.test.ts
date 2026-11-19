import { beforeEach, describe, expect, it, vi } from "vitest";

/* An unpaid order never blocks a new order for the same number (owner, 19 Nov 2026), but a paid one still does,
   and so does one the gateway now says is paid. supabase/functions/_shared/clearUnpaid.ts */
const gateway = { paystack: "abandoned", kora: false };
vi.mock("../../supabase/functions/_shared/paystack.ts", () => ({
  verifyPaystackTransaction: async () => ({ ok: true, status: 200, payload: { data: { status: gateway.paystack } } }),
}));
vi.mock("../../supabase/functions/_shared/gateway.ts", () => ({
  verifyWithGateway: async () => ({ ok: gateway.kora, status: gateway.kora ? "success" : "processing", amount: 26.2, currency: "GHS", transactionId: null, payload: null }),
}));
const { clearUnpaidForNumber, PAID_OPEN_MESSAGE } = await import("../../supabase/functions/_shared/clearUnpaid");

type Row = Record<string, unknown>;
function fakeDb(tables: Record<string, Row[]>) {
  const calls: { rpc: Array<[string, Row]>; events: Row[] } = { rpc: [], events: [] };
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let single = false;
    const result = () => { const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r))); return { data: single ? rows[0] ?? null : rows, error: null }; };
    const q = {
      select: () => q,
      eq: (k: string, v: unknown) => { filters.push((r) => r[k] === v); return q; },
      in: (k: string, v: unknown[]) => { filters.push((r) => v.includes(r[k])); return q; },
      order: () => q,
      limit: () => q,
      maybeSingle: () => { single = true; return q; },
      insert: (row: Row) => { calls.events.push(row); return { then: (f: (v: unknown) => unknown) => f({ error: null }) }; },
      then: (f: (v: unknown) => unknown) => f(result()),
    };
    return q;
  };
  const rpc = (name: string, args: Row) => {
    calls.rpc.push([name, args]);
    const o = (tables.orders ?? []).find((r) => r.order_reference === args.p_reference);
    if (o) Object.assign(o, { status: "cancelled", is_open: false, payment_status: "abandoned" });
    return { then: (f: (v: unknown) => unknown) => f({ data: { cancelled: true }, error: null }) };
  };
  return { db: { from, rpc }, calls };
}
const unpaid = (over: Row = {}): Row => ({ id: "o1", order_reference: "YG-AAAAAAAAAA", user_id: null, recipient_phone_normalized: "0241234567", status: "awaiting_payment", payment_status: "pending", is_open: true, paid_at: null, supplier_purchase_id: null, supplier_order_reference: null, wallet_ledger_entry_id: null, paystack_reference: "YGDATA-1", payment_provider: "paystack", ...over });

beforeEach(() => { gateway.paystack = "abandoned"; gateway.kora = false; });

describe("clearUnpaidForNumber", () => {
  it("lets the number through when nothing is open", async () => {
    const { db } = fakeDb({ orders: [] });
    expect(await clearUnpaidForNumber(db, "0241234567", null)).toEqual({ ok: true, closed: [] });
  });

  it("closes an unpaid order the gateway says was not paid, and writes why", async () => {
    const { db, calls } = fakeDb({ orders: [unpaid()], payment_intents: [{ order_id: "o1", provider: "paystack", provider_reference: "YGDATA-1", status: "pending" }] });
    expect(await clearUnpaidForNumber(db, "0241234567", "u1")).toEqual({ ok: true, closed: ["YG-AAAAAAAAAA"] });
    expect(calls.rpc[0]).toEqual(["cancel_unpaid_order", expect.objectContaining({ p_reference: "YG-AAAAAAAAAA", p_anyone: true, p_actor: "u1" })]);
    expect(calls.events[0]).toMatchObject({ order_id: "o1", event_type: "order.replaced_unpaid" });
  });

  it("keeps the number held when Paystack says the old order was paid", async () => {
    gateway.paystack = "success";
    const { db, calls } = fakeDb({ orders: [unpaid()], payment_intents: [{ order_id: "o1", provider: "paystack", provider_reference: "YGDATA-1", status: "pending" }] });
    expect(await clearUnpaidForNumber(db, "0241234567", null)).toEqual({ ok: false, reference: "YG-AAAAAAAAAA", message: PAID_OPEN_MESSAGE });
    expect(calls.rpc).toHaveLength(0);
  });

  it("keeps the number held when Kora says the old order was paid", async () => {
    gateway.kora = true;
    const { db, calls } = fakeDb({ orders: [unpaid({ payment_provider: "kora" })], payment_intents: [{ order_id: "o1", provider: "kora", provider_reference: "YGDATA-1", status: "pending" }] });
    expect((await clearUnpaidForNumber(db, "0241234567", null)).ok).toBe(false);
    expect(calls.rpc).toHaveLength(0);
  });

  it("closes a Kora order that is still only processing (a later payment is reopened or held, never sent twice)", async () => {
    const { db } = fakeDb({ orders: [unpaid({ payment_provider: "kora" })], payment_intents: [{ order_id: "o1", provider: "kora", provider_reference: "YGDATA-1", status: "pending" }] });
    expect(await clearUnpaidForNumber(db, "0241234567", null)).toEqual({ ok: true, closed: ["YG-AAAAAAAAAA"] });
  });

  it("never closes a paid order that is still on its way", async () => {
    const { db, calls } = fakeDb({ orders: [unpaid({ status: "processing", payment_status: "succeeded", paid_at: "2026-11-19T10:00:00Z" })] });
    expect(await clearUnpaidForNumber(db, "0241234567", null)).toMatchObject({ ok: false, message: PAID_OPEN_MESSAGE });
    expect(calls.rpc).toHaveLength(0);
  });

  it("closes a signed-in order that never reached a payment page without asking any gateway", async () => {
    const { db } = fakeDb({ orders: [unpaid({ paystack_reference: null, payment_provider: null, user_id: "u2" })], payment_intents: [] });
    expect(await clearUnpaidForNumber(db, "0241234567", "u1")).toEqual({ ok: true, closed: ["YG-AAAAAAAAAA"] });
  });

  it("for the first-purchase offer, also closes the buyer's own unpaid order for another number", async () => {
    const { db } = fakeDb({ orders: [unpaid({ id: "o2", order_reference: "YG-BBBBBBBBBB", recipient_phone_normalized: "0559999999", user_id: "u1", paystack_reference: null })], payment_intents: [] });
    expect(await clearUnpaidForNumber(db, "0241234567", "u1")).toEqual({ ok: true, closed: [] });
    expect(await clearUnpaidForNumber(db, "0241234567", "u1", true)).toEqual({ ok: true, closed: ["YG-BBBBBBBBBB"] });
  });
});
