import type { AgentOrder } from "@/components/agent/AgentShell";
import { speedPhrase, type NetworkSpeed } from "@/hooks/useDeliverySpeed";

/* How an order reads to an agent: plain words, and a one-line reason when
   it isn't a straightforward "in progress". */
export function stageOf(o: AgentOrder, speed?: NetworkSpeed): { label: string; tone: "good" | "wait" | "verify" | "bad"; note?: string } {
  if (o.status === "delivered") return { label: "Delivered", tone: "good" };
  if (o.status === "refunded") return { label: "Refunded", tone: "bad", note: "The customer's payment was returned." };
  if (o.status === "cancelled") return { label: "Cancelled", tone: "bad" };
  if (o.admin_resolution_status === "awaiting_verification") return { label: "Being verified by MTN", tone: "verify", note: "First bundle to this number. MTN verifies it, usually within a few days, then the data is delivered automatically. The customer's money is safe." };
  if (o.status.startsWith("failed")) return { label: "Being looked at", tone: "verify", note: "We're sorting this one out. The customer's money is safe." };
  const live = speedPhrase(speed);
  return { label: "In progress", tone: "wait", note: live ? `Sent to the network. ${o.networks?.name ?? "The network"} is currently taking ${live} to deliver.` : "Sent to the network. Delivery time depends on the network right now." };
}
export const toneClass = (t: "good" | "wait" | "verify" | "bad") => t === "good" ? "text-primary-glow" : t === "bad" ? "text-danger" : "text-amber";
