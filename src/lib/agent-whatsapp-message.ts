/**
 * Normalize a Ghana phone number for WhatsApp links.
 * Returns "233XXXXXXXXX" or null if invalid.
 */
export function normalizeGhanaWhatsApp(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[\s+\-()]/g, '');
  if (/^0\d{9}$/.test(digits)) return '233' + digits.slice(1);
  if (/^233\d{9}$/.test(digits)) return digits;
  if (digits.length >= 10) return digits; // fallback
  return null;
}

/**
 * Build the approval message for an agent.
 */
export function buildAgentApprovalMessage(agentName: string, storeName?: string | null): string {
  const name = agentName || 'there';
  const store = storeName || 'your store';
  return `Congrats ${name}! Your YieGo Agent Store (${store}) has been approved and is ready to go live.

To start selling, you only need to activate your store subscription.

Once activated, you get:

✅ Discounted agent prices (buy cheaper than normal users)
✅ Your own store link to share anywhere
✅ Set your own selling price and earn profit per order
✅ Profit credited automatically after every successful order
✅ Customers can buy 24/7 even when you're offline
✅ Withdraw your earnings anytime

This is the easiest way to start earning daily without stress because YieGo handles delivery for you.

📌 Activate now and start selling today.
The earlier you activate, the faster you start making profit.

👉 Go to your dashboard and click Activate Store now.

If you need help, text us back here.. right on this number.`;
}

/**
 * Open WhatsApp with a prefilled message.
 */
export function openAgentWhatsApp(whatsappNumber: string | null | undefined, agentName: string, storeName?: string | null): void {
  const normalized = normalizeGhanaWhatsApp(whatsappNumber);
  if (!normalized) return;
  const message = buildAgentApprovalMessage(agentName, storeName);
  window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(message)}`, '_blank');
}

/**
 * Copy the approval message to clipboard.
 */
export async function copyAgentApprovalMessage(agentName: string, storeName?: string | null): Promise<boolean> {
  const message = buildAgentApprovalMessage(agentName, storeName);
  try {
    await navigator.clipboard.writeText(message);
    return true;
  } catch {
    return false;
  }
}
