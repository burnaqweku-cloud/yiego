import { describe, expect, it } from "vitest";
import { calculateRefundQuote, validateRefundAgreement } from "../../supabase/functions/_shared/refundPolicy";

const base = { wallet: false, orderAmount: 100, paidPesewas: 10400, feePesewas: 208,
  verificationHold: true, supplierAttemptOpen: false, supplierPurchased: false,
  policy: "mtn_verification_fee" as const, reducedEnabled: true };

describe("agreed refund policy", () => {
  it("returns GHS 101.92 from GHS 104 minus the actual GHS 2.08 fee", () => {
    expect(calculateRefundQuote(base)).toMatchObject({ paid: 104, processingFee: 2.08, refund: 101.92 });
  });
  it("refunds supplier rejection in full including the checkout fee", () => {
    expect(calculateRefundQuote({ ...base, verificationHold: false, policy: "full" }).refund).toBe(104);
  });
  it("returns GHS 100 to wallet without a new payment fee", () => {
    expect(calculateRefundQuote({ ...base, wallet: true })).toMatchObject({ refund: 100, processingFee: 0, policy: "full" });
  });
  it("uses actual fees rather than assuming 2%", () => {
    expect(calculateRefundQuote({ ...base, feePesewas: 350 }).refund).toBe(100.5);
  });
  it("blocks reduced refunds when the real fee is missing", () => {
    expect(() => calculateRefundQuote({ ...base, feePesewas: undefined })).toThrow("Actual Paystack fee");
  });
  it("never applies the exception to a supplier failure", () => {
    expect(() => calculateRefundQuote({ ...base, verificationHold: false })).toThrow("only to MTN");
  });
  it("blocks refunds with a live supplier purchase", () => {
    expect(() => calculateRefundQuote({ ...base, supplierAttemptOpen: true })).toThrow("Supplier funds");
  });
  it("keeps reduced refunds off until activation is approved", () => {
    expect(() => calculateRefundQuote({ ...base, reducedEnabled: false })).toThrow("not activated");
  });
  it("requires informed agreement for fee retention", () => {
    expect(() => validateRefundAgreement(calculateRefundQuote(base), {})).toThrow("informed acceptance");
    expect(() => validateRefundAgreement(calculateRefundQuote(base), { customerAccepted: true, customerAcceptanceNote: "Customer agreed to GHS 101.92 in support chat" })).not.toThrow();
  });
  it("requires recorded supplier credit confirmation", () => {
    const quote = calculateRefundQuote({ ...base, policy: "full", supplierPurchased: true });
    expect(() => validateRefundAgreement(quote, {})).toThrow("credited our balance");
    expect(() => validateRefundAgreement(quote, { supplierCreditConfirmed: true, supplierCreditNote: "Supplier confirmed balance credited in support chat" })).not.toThrow();
  });
});