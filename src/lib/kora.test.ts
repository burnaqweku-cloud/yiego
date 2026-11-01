import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { matchesPayment, isTestPayment } from "../../supabase/functions/_shared/paymentVerification";
import { parseKoraBalances, koraRefundState } from "../../supabase/functions/_shared/koraReporting";
import { initializeKoraCharge, verifyKoraCharge, verifyKoraWebhook, koraLiveReady, initiateKoraRefund } from "../../supabase/functions/_shared/kora";

const env = new Map<string, string>([["KORA_SECRET_KEY", "sk_test_fixture_not_a_credential"]]);
vi.stubGlobal("Deno", { env: { get: (key: string) => env.get(key) } });
vi.stubGlobal("crypto", webcrypto);
afterEach(() => { vi.unstubAllGlobals(); env.delete("KORA_LIVE_ENABLED"); env.delete("KORA_GHS_REFUNDS_VERIFIED"); env.set("KORA_SECRET_KEY", "sk_test_fixture_not_a_credential"); vi.stubGlobal("Deno", { env: { get: (key: string) => env.get(key) } }); vi.stubGlobal("crypto", webcrypto); });

describe("Kora rollout and financial safety", () => {
  it("never enables live payments just because a live key replaces the test key", () => {
    env.set("KORA_SECRET_KEY", "sk_live_fixture_not_a_credential");
    expect(koraLiveReady()).toBe(false);
    env.set("KORA_LIVE_ENABLED", "true"); expect(koraLiveReady()).toBe(true);
    env.set("KORA_SECRET_KEY", "sk_test_fixture_not_a_credential"); expect(koraLiveReady()).toBe(false);
  });
  it("matches the full 4% wallet checkout, not just the credited base", () => {
    const intent = { amount: 15, currency: "GHS", metadata: { chargedAmount: 15.6 } };
    expect(matchesPayment({ amount: 15.6, currency: "GHS" }, intent)).toBe(true);
    expect(matchesPayment({ amount: 15, currency: "GHS" }, intent)).toBe(false);
  });
  it("enforces the GHS 0.02 mismatch threshold in both directions", () => {
    const intent = { amount: 9.36, currency: "GHS" };
    expect(matchesPayment({ amount: 9.34, currency: "GHS" }, intent)).toBe(true);
    expect(matchesPayment({ amount: 9.38, currency: "GHS" }, intent)).toBe(true);
    expect(matchesPayment({ amount: 9.33, currency: "GHS" }, intent)).toBe(false);
    expect(matchesPayment({ amount: 9.39, currency: "GHS" }, intent)).toBe(false);
  });
  it("rejects wrong currency or missing/invalid amounts", () => {
    expect(matchesPayment({ amount: 9.36, currency: "NGN" }, { amount: 9.36, currency: "GHS" })).toBe(false);
    expect(matchesPayment({ amount: NaN, currency: "GHS" }, { amount: 9.36, currency: "GHS" })).toBe(false);
    expect(matchesPayment({ amount: 9.36, currency: null }, { amount: 9.36, currency: "GHS" })).toBe(false);
  });
  it("recognizes only the explicit test marker", () => {
    expect(isTestPayment({ test: true })).toBe(true);
    expect(isTestPayment({ test: "true" })).toBe(false);
    expect(isTestPayment(null)).toBe(false);
  });
  it("keeps available and pending balances separate", () => {
    expect(parseKoraBalances({ GHS: { available_balance: "100.25", pending_balance: "20.50" } })).toEqual([{ currency: "GHS", available: 100.25, pending: 20.5 }]);
  });
  it("does not replace missing balance values with zero", () => {
    expect(parseKoraBalances({ GHS: { available_balance: "10" } })).toBeNull();
    expect(parseKoraBalances({ GHS: { available_balance: null, pending_balance: "10" } })).toBeNull();
    expect(parseKoraBalances({ GHS: { available_balance: "", pending_balance: 0 } })).toBeNull();
  });
  it("does not treat an accepted refund as complete", () => {
    expect(koraRefundState("processing")).toBe("processing");
    expect(koraRefundState("success")).toBe("success");
    expect(koraRefundState("accepted")).toBe("unknown");
  });
  it("blocks GHS refunds until support is explicitly verified", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await expect(initiateKoraRefund({ paymentReference: "TEST", reference: "REFUND", amount: 4.17 })).rejects.toThrow("not yet verified");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("passes checkout amounts as decimal GHS, without multiplying by 100", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: true, data: { reference: "TEST", checkout_url: "https://checkout.korapay.com/test" } })));
    vi.stubGlobal("fetch", fetcher);
    const result = await initializeKoraCharge({ email: "test@example.invalid", amount: 4.26, reference: "TEST" });
    expect(result.ok).toBe(true);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).amount).toBe(4.26);
  });
  it("rejects lookup success belonging to another reference", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: true, data: { reference: "OTHER", status: "success", currency: "GHS", amount: 4.26 } }))));
    expect((await verifyKoraCharge("TEST")).ok).toBe(false);
  });
  it("validates signatures over data and rejects forged or altered messages", async () => {
    const data = { reference: "TEST", status: "success", amount: 4.26, currency: "GHS" };
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", encoder.encode("sk_test_fixture_not_a_credential"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(JSON.stringify(data))));
    const signature = Array.from(bytes, (x) => x.toString(16).padStart(2, "0")).join("");
    expect(await verifyKoraWebhook(JSON.stringify({ event: "charge.success", data }), signature)).toBe(true);
    expect(await verifyKoraWebhook(JSON.stringify({ data: { ...data, amount: 100 } }), signature)).toBe(false);
    expect(await verifyKoraWebhook(JSON.stringify({ data }), "forged")).toBe(false);
  });
});