import { describe, expect, it } from "vitest";
import { storeOrderEmail, storeSender, storeUrl, type StoreOrderRow } from "../../supabase/functions/store-order-email/email";

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
});
