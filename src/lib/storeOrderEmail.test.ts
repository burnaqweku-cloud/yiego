import { describe, expect, it } from "vitest";
import { bundleLabel, storeOrderEmail, storeSender, storeUrl, type StoreOrderRow } from "../../supabase/functions/store-order-email/email";

const row: StoreOrderRow = { id: 1, kind: "confirmed", email: "buyer@example.com", reference: "AG-7BD43C425A", amount: 9, currency: "GHS", phone: "0541234567",
  bundle: "MTN Data — 2GB", network: "MTN", store: "Gracious Data", slug: "gracious", domain: null, email_domain: null };
/** What a person reads: the page without its tags and without the link addresses. */
const seen = (html: string) => html.replace(/href="[^"]*"/g, "").replace(/<[^>]+>/g, " ");

describe("the order email for an agent's store", () => {
  it("comes from the store and never shows our name", () => {
    const mail = storeOrderEmail(row);
    expect(storeSender(row)).toBe("Gracious Data <stores@datayego.com>");
    expect(mail.subject).toBe("Your Gracious Data order AG-7BD43C425A");
    expect(seen(mail.html)).toContain("Gracious Data");
    expect(seen(mail.html)).not.toMatch(/datayego|yiego/i);
    expect(mail.html).toContain("Gracious Data · payments secured by Paystack");
  });
  it("links back to the store's own address, or its own domain when it has one", () => {
    expect(storeOrderEmail(row).html).toContain('href="https://gracious.datayego.com/track?reference=AG-7BD43C425A"');
    const own = { ...row, domain: "graciousdata.com", email_domain: "graciousdata.com" };
    expect(storeUrl(own)).toBe("https://graciousdata.com");
    expect(storeSender(own)).toBe("Gracious Data <hello@graciousdata.com>");
    expect(storeOrderEmail(own).html).not.toMatch(/datayego/i);
  });
  it("says the right thing for an order that is on its way and one still being verified", () => {
    expect(seen(storeOrderEmail(row).html)).toContain("Your data order is on its way");
    const held = seen(storeOrderEmail({ ...row, kind: "verifying" }).html);
    expect(held).toContain("We're verifying your order");
    expect(held).toContain("We received your payment");
  });
  it("shows a store name as text, whatever the agent typed", () => {
    const odd = { ...row, store: 'Kofi <b>"Best"</b> & Sons' };
    expect(storeOrderEmail(odd).html).not.toContain("<b>\"Best\"</b>");
    expect(storeSender(odd)).toBe("Kofi bBest/b & Sons <stores@datayego.com>");
  });
  it("does not say the network twice", () => {
    expect(bundleLabel({ network: "MTN", bundle: "MTN Data — 2GB" })).toBe("MTN Data — 2GB");
    expect(bundleLabel({ network: "MTN", bundle: "2GB" })).toBe("MTN · 2GB");
    expect(bundleLabel({ network: "", bundle: "Data bundle" })).toBe("Data bundle");
    expect(seen(storeOrderEmail(row).html)).not.toContain("MTN · MTN");
  });
});

describe("the refund email for an agent's store", () => {
  const refund: StoreOrderRow = { ...row, kind: "refunded", details: { amount: 8.83, reason: "Supplier out of stock", method: "paystack" } };
  it("comes from the store, says what went back and why, and never shows our name", () => {
    const mail = storeOrderEmail(refund);
    expect(mail.subject).toBe("Refund for your Gracious Data order AG-7BD43C425A");
    const text = seen(mail.html);
    expect(text).toContain("Your order AG-7BD43C425A has been refunded");
    expect(text).toContain("GHS 8.83");
    expect(text).toContain("Reason: Supplier out of stock");
    expect(text).toContain("1 to 10 business days");
    expect(text).not.toMatch(/datayego|yiego/i);
    expect(mail.html).toContain("Gracious Data · payments secured by Paystack");
  });
  it("says where the money went for a wallet refund, and falls back to the order's amount", () => {
    const text = seen(storeOrderEmail({ ...refund, details: { method: "wallet" } }).html);
    expect(text).toContain("already back in your wallet");
    expect(text).toContain("GHS 9.00");
    expect(text).not.toContain("Reason:");
  });
  it("shows a typed reason as text", () => {
    expect(storeOrderEmail({ ...refund, details: { ...refund.details, reason: "<img src=x>" } }).html).not.toContain("<img");
  });
});
