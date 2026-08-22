/* ══════════════════════════════════════════════════════════════
   Database errors, said in words a customer can act on.

   The order functions raise short codes, and Postgres raises its
   own constraint messages. Passing either straight to the screen
   shows things like "duplicate key value violates unique
   constraint orders_one_open_per_recipient_idx", which tells a
   customer nothing about what to do next.
   ══════════════════════════════════════════════════════════════ */

const RULES: Array<{ match: RegExp; message: string }> = [
  {
    // One open order per recipient: the guard against paying twice for the
    // same number while the first order is still running.
    match: /orders_one_open_per_recipient_idx/i,
    message: "There's already an order in progress for this number. Wait for it to finish, then you can order again.",
  },
  { match: /invalid_recipient_phone/i, message: "Enter a valid 10-digit Ghana number, starting with 0." },
  { match: /insufficient_(wallet_)?balance/i, message: "Your wallet doesn't have enough for this bundle. Top up and try again." },
  { match: /wallet_locked/i, message: "Your wallet is locked. Contact support and we'll sort it out." },
  { match: /wallet_not_found/i, message: "We couldn't find your wallet. Contact support and we'll sort it out." },
  { match: /network_paused/i, message: "This network is paused right now. Try another network, or check back shortly." },
  { match: /network_not_available/i, message: "This network isn't available right now. Try another one." },
  { match: /product_not_found|product_not_active/i, message: "That bundle isn't on sale right now. Pick another size." },
  { match: /supplier_mapping_not_found/i, message: "That bundle can't be delivered right now. Try another size, or contact support." },
  { match: /order_not_found/i, message: "We couldn't find that order. Check the reference and try again." },
  { match: /order_already_paid/i, message: "This order has already been paid for." },
  { match: /order_expired/i, message: "This order expired before payment. Start a new one." },
];

/** A sentence for the customer. Unknown errors fall back to the given default
 *  rather than leaking internals. */
export function friendlyError(raw: unknown, fallback = "Something went wrong. Please try again."): string {
  const text = raw instanceof Error ? raw.message : String(raw ?? "");
  if (!text) return fallback;
  for (const rule of RULES) if (rule.match.test(text)) return rule.message;
  // A bare snake_case code is internal; never show it.
  if (/^[a-z0-9_]+$/.test(text.trim())) return fallback;
  return text;
}
