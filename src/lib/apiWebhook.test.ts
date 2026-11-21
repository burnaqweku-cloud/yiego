import { describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { eventBody, isIpLiteral, isPrivateIp, signatureHeader, urlProblem } from "../../supabase/functions/api-webhooks/webhook";

describe("API webhook addresses", () => {
  it("takes a normal https address", () => {
    expect(urlProblem("https://kofidatahub.com/webhooks/datayego")).toBeNull();
    expect(urlProblem("https://api.kofi.com:443/hook?x=1")).toBeNull();
    expect(urlProblem("https://abc.supabase.co/functions/v1/hook")).toBeNull();
  });
  it("refuses anything that could reach inside our network or ourselves", () => {
    expect(urlProblem("http://kofi.com/hook")).toMatch(/https/);
    expect(urlProblem("https://127.0.0.1/hook")).toMatch(/IP address/);
    expect(urlProblem("https://169.254.169.254/latest/meta-data")).toMatch(/IP address/);
    expect(urlProblem("https://[::1]/hook")).toMatch(/IP address/);
    expect(urlProblem("https://2130706433/hook")).toMatch(/IP address/);
    expect(urlProblem("https://0x7f000001/hook")).toMatch(/IP address/);
    expect(urlProblem("https://localhost/hook")).toMatch(/internet/);
    expect(urlProblem("https://printer.local/hook")).toMatch(/internet/);
    expect(urlProblem("https://metadata.google.internal/x")).toMatch(/internet/);
    expect(urlProblem("https://kofi.com:8080/hook")).toMatch(/443/);
    expect(urlProblem("https://user:pass@kofi.com/hook")).toMatch(/username/);
    expect(urlProblem("https://datayego.com/x")).toMatch(/own server/);
    expect(urlProblem("https://shop.datayego.com/x")).toMatch(/own server/);
    expect(urlProblem("https://nhxgebulvqhtiiotetoo.supabase.co/functions/v1/refund-order")).toMatch(/own server/);
    expect(urlProblem("not a url")).toMatch(/not valid/);
  });
  it("knows private and public addresses", () => {
    for (const ip of ["10.0.0.1", "127.0.0.1", "172.16.5.4", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1"]) expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "172.32.0.1", "104.16.1.1", "2606:4700::6810:84e5"]) expect(isPrivateIp(ip)).toBe(false);
    expect(isIpLiteral("1.2.3.4")).toBe(true);
    expect(isIpLiteral("kofi.com")).toBe(false);
  });
});

describe("API webhook signature", () => {
  it("signs '<t>.<body>' with HMAC-SHA256, the way the guide tells sellers to check it", async () => {
    const body = eventBody({ id: 42, event: "order.delivered", created_at: "2026-11-21T10:00:00Z", test: false, payload: { order: { reference: "YG-1" } } });
    expect(JSON.parse(body)).toEqual({ id: "evt_42", type: "order.delivered", created_at: "2026-11-21T10:00:00Z", test: false, data: { order: { reference: "YG-1" } } });
    const header = await signatureHeader("whsec_abc", 1763719200, body);
    const expected = createHmac("sha256", "whsec_abc").update(`1763719200.${body}`).digest("hex");
    expect(header).toBe(`t=1763719200,v1=${expected}`);
  });
});
