export type RefundPolicy = "full" | "mtn_verification_fee";
export type RefundQuote = {
  method: "wallet" | "paystack";
  policy: RefundPolicy;
  paid: number;
  processingFee: number;
  refund: number;
  verificationHold: boolean;
  supplierConfirmationRequired: boolean;
};

/** Amounts from verified server records only; integer pesewas avoid float drift. */
export function calculateRefundQuote(input: {
  wallet: boolean; orderAmount: number; paidPesewas?: number;
  feePesewas?: number; verificationHold: boolean; supplierAttemptOpen: boolean;
  supplierPurchased: boolean; policy: RefundPolicy; reducedEnabled: boolean;
}): RefundQuote {
  if (input.supplierAttemptOpen) throw new Error("Supplier funds must be resolved before refunding.");
  const orderPesewas = Math.round(input.orderAmount * 100);
  if (!Number.isSafeInteger(orderPesewas) || orderPesewas <= 0) throw new Error("Invalid order amount.");
  if (input.wallet) return {
    method: "wallet", policy: "full", paid: orderPesewas / 100, processingFee: 0,
    refund: orderPesewas / 100, verificationHold: input.verificationHold,
    supplierConfirmationRequired: input.supplierPurchased,
  };
  const paid = input.paidPesewas;
  if (paid === undefined || !Number.isSafeInteger(paid) || paid < orderPesewas) throw new Error("Verified payment amount is unavailable.");
  if (input.policy === "mtn_verification_fee") {
    if (!input.reducedEnabled) throw new Error("Fee-excluding refunds are not activated. Use a full refund.");
    if (!input.verificationHold) throw new Error("Fee deduction applies only to MTN verification holds.");
    const fee = input.feePesewas;
    if (fee === undefined || !Number.isSafeInteger(fee) || fee < 0 || fee >= paid) throw new Error("Actual Paystack fee is unavailable. Do not estimate it.");
    return { method: "paystack", policy: input.policy, paid: paid / 100, processingFee: fee / 100,
      refund: (paid - fee) / 100, verificationHold: true, supplierConfirmationRequired: input.supplierPurchased };
  }
  return { method: "paystack", policy: "full", paid: paid / 100, processingFee: 0,
    refund: paid / 100, verificationHold: input.verificationHold, supplierConfirmationRequired: input.supplierPurchased };
}

export function validateRefundAgreement(quote: RefundQuote, agreement: {
  supplierCreditConfirmed?: boolean; supplierCreditNote?: string;
  customerAccepted?: boolean; customerAcceptanceNote?: string;
}) {
  if (quote.supplierConfirmationRequired && (!agreement.supplierCreditConfirmed || (agreement.supplierCreditNote?.trim().length ?? 0) < 5)) {
    throw new Error("Confirm the supplier credited our balance and record their confirmation.");
  }
  if (quote.policy === "mtn_verification_fee" && (!agreement.customerAccepted || (agreement.customerAcceptanceNote?.trim().length ?? 0) < 5)) {
    throw new Error("Record the customer's informed acceptance of this exact refund amount.");
  }
}