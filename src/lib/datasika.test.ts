import { afterEach, describe, expect, it, vi } from "vitest";
vi.hoisted(() => { vi.stubGlobal("Deno", { env: { get: () => undefined } }); });
import { deliveryState, localPhone, mapStatus, purchaseHttpStatus, findProductId } from "../../supabase/functions/_shared/datasika";
import { adapterFor } from "../../supabase/functions/_shared/supplierAdapters";

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function mockApi(responses: Array<{ status?: number; body: unknown }>) {
  vi.stubGlobal("Deno", { env: { get: (key: string) => key === "DATASIKA_API_KEY" ? "test-only-key" : undefined } });
  const fetcher = vi.fn();
  responses.forEach(({ status = 200, body }) => fetcher.mockResolvedValueOnce(new Response(JSON.stringify(body), { status })));
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}
const catalog = { services: { data_bundles: { available: true, items: [{ product_id: "mtn-one", network: "MTN", bundle_gb: 1, price: 4, currency: "GHS" }] } } };
const context = { recipientPhone: "+233557206860", orderReference: "test-order", idempotencyKey: "stable-test-key", supplierNetworkCode: "MTN", supplierCapacity: "1" };

describe("DataSika MTN integration", () => {
  it("converts the test Ghana phone to DataSika local format", () => { expect(localPhone("+233557206860")).toBe("0557206860"); });
  it("refuses non-MTN mappings", () => { expect(adapterFor("datasika")?.preflight({ ...context, supplierNetworkCode: "TELECEL" })).toEqual({ ok: false, reason: "datasika_mtn_only" }); });
  it("buys the catalog product and retains the same retry key", async () => {
    const fetcher = mockApi([{ body: catalog }, { body: { order_id: "API-test", status: "Pending", amount_charged: 4 } }, { body: catalog }, { body: { order_id: "API-test", status: "Pending", amount_charged: 4, idempotent_replay: true } }]);
    const adapter = adapterFor("datasika"); if (!adapter) throw new Error("missing adapter");
    const first = await adapter.purchase(context); const retry = await adapter.purchase(context);
    expect(first.purchaseId).toBe("API-test"); expect(retry.purchaseId).toBe("API-test");
    for (const index of [1, 3]) { const init = fetcher.mock.calls[index][1]; expect(init.headers["Idempotency-Key"]).toBe("stable-test-key"); expect(JSON.parse(init.body)).toEqual({ product_id: "mtn-one", recipient: "0557206860" }); }
    expect(first.responsePayload).toMatchObject({ data: { amount: 4 } });
  });
  it("does not buy when the catalog service is disabled", async () => { const fetcher = mockApi([{ body: { services: { data_bundles: { ...catalog.services.data_bundles, available: false } } } }]); expect((await findProductId("MTN", 1)).productId).toBeNull(); expect(fetcher).toHaveBeenCalledTimes(1); });
  it("keeps an in-progress idempotency response ambiguous", () => { expect(purchaseHttpStatus(409, { error: "request_in_progress" }, false)).toBe(408); });
  it("keeps a missing purchase receipt ambiguous", () => { expect(purchaseHttpStatus(200, {}, false)).toBe(502); });
  it("does not retry a failed paid order until supplier refund", () => { expect(deliveryState("failed")).toBe("processing"); expect(deliveryState("refund_processing")).toBe("processing"); });
  it("releases a confirmed supplier refund for review", () => { expect(deliveryState("refunded")).toBe("failed_needs_review"); });
  it("marks delivered status complete", () => { expect(mapStatus("delivered")).toBe("delivered"); });
  it("retains a receipt when dispatch failed but credit is pending", async () => { mockApi([{ body: catalog }, { status: 502, body: { error: "dispatch_failed", order_id: "API-paid", refunded: false } }]); const result = await adapterFor("datasika")?.purchase(context); expect(result).toMatchObject({ ok: true, purchaseId: "API-paid", supplierStatus: "refund_processing" }); });
});