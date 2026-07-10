import { SERVICES, type Service } from "@/data/services";
import type { MockTransaction } from "@/data/mock";

/**
 * Derive "recently used services" from real transaction history, so
 * buy-again strips reflect what the user actually does.
 */
function serviceIdFor(t: MockTransaction): string | null {
  const title = t.title.toLowerCase();
  switch (t.type) {
    case "data":
      return "data";
    case "airtime":
      return "airtime";
    case "electricity":
      return "electricity";
    case "tv":
      return "tv";
    case "giftcard":
      return "gift-cards";
    case "bill":
      return title.includes("water") ? "water" : "internet";
    case "education":
      if (title.includes("placement") || title.includes("cssps")) return "school-placement";
      if (title.includes("form") || title.includes("voucher")) return "e-vouchers";
      return "results-checker";
    case "crypto":
      if (title.includes("crypto to momo")) return "crypto-to-momo";
      if (title.includes("buy usdt")) return "buy-usdt";
      return "momo-to-crypto";
    case "digital":
      if (title.includes("vpn")) return "vpn";
      if (title.includes("esim")) return "esim";
      if (title.includes("sms")) return "bulk-sms";
      if (title.includes("number")) return "virtual-numbers";
      return "streaming";
    default:
      return null; // deposits, withdrawals, incoming payments
  }
}

/** Unique services in recency order, resolved against the catalog. */
export function recentServices(transactions: MockTransaction[], max = 4): Service[] {
  const seen = new Set<string>();
  const out: Service[] = [];
  for (const t of transactions) {
    const id = serviceIdFor(t);
    if (!id || seen.has(id)) continue;
    const svc = SERVICES.find((s) => s.id === id);
    if (!svc) continue;
    seen.add(id);
    out.push(svc);
    if (out.length >= max) break;
  }
  return out;
}
