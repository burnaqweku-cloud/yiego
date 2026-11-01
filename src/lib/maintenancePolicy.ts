export interface MaintenanceSettings {
  enabled: boolean;
  title: string;
  reason: string;
  eta: string;
  blocked_message: string;
  revision: string;
}

export const DEFAULT_MAINTENANCE: MaintenanceSettings = {
  enabled: false,
  title: "We’re currently under maintenance",
  reason: "We’re working on our service. Please try again later.",
  eta: "",
  blocked_message: "Maintenance is in progress. This service is temporarily unavailable. Please try again later.",
  revision: "",
};

export function parseMaintenance(value: unknown): MaintenanceSettings {
  const v = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const text = (key: keyof MaintenanceSettings, max: number) => typeof v[key] === "string" ? String(v[key]).trim().slice(0, max) : String(DEFAULT_MAINTENANCE[key]);
  return { enabled: v.enabled === true, title: text("title", 120) || DEFAULT_MAINTENANCE.title, reason: text("reason", 2000) || DEFAULT_MAINTENANCE.reason, eta: text("eta", 200), blocked_message: text("blocked_message", 300) || DEFAULT_MAINTENANCE.blocked_message, revision: text("revision", 80) };
}

const READ_FUNCTIONS = new Set(["track-order", "reconcile-guest-order", "verify-wallet-deposit", "supplier-delivery-status"]);
const READ_RPCS = new Set(["admin_gate", "is_active_admin", "public_bootstrap", "track_by_phone", "delivery_speed_by_network", "record_device", "log_client_error", "mark_announcement_read", "promotion_track", "store_visit", "store_popup_hit", "store_by_host", "store_canonical_host", "store_redirects_to_main", "store_network_offer", "store_popups_for", "store_announcements_for", "store_chat_read", "store_my_conversations", "store_customer_impact", "agent_store", "agent_plan_quote", "agent_slug_check", "agent_analytics", "agent_customers", "agent_inbox", "agent_inbox_unread", "agent_conversation", "network_tier_status", "network_applications", "network_inbox", "campaign_public", "campaign_current", "order_fee_pending"]);

/** Navigation/auth and previously paid transaction reconciliation are not new purchases. */
export function maintenanceBlocksRequest(url: string, method: string, body?: unknown): boolean {
  const path = new URL(url, "https://local.invalid").pathname;
  const verb = method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(verb)) return false;
  if (path.startsWith("/auth/")) return path.endsWith("/user") && ["PUT", "PATCH", "DELETE"].includes(verb);
  const fn = path.match(/\/functions\/v1\/([^/]+)/)?.[1];
  if (fn) {
    if (READ_FUNCTIONS.has(fn)) return false;
    if (fn === "order-payment-action") {
      let input: Record<string, unknown> = {};
      try { input = typeof body === "string" ? JSON.parse(body) : (body as Record<string, unknown>) ?? {}; } catch { /* invalid write payload stays blocked */ }
      return !["lookup", "list_pending"].includes(String(input.action));
    }
    return true;
  }
  const rpc = path.match(/\/rest\/v1\/rpc\/([^/]+)/)?.[1];
  if (rpc) return !(READ_RPCS.has(rpc) || ["my_agent_access", "my_profile", "my_wallet", "my_orders", "my_notifications"].includes(rpc));
  if (path.includes("/rest/v1/") || path.includes("/storage/v1/")) return true;
  return false;
}

export function maintenanceApplies(enabled: boolean, isAdmin: boolean, needsMfa: boolean): boolean {
  return enabled && !(isAdmin && !needsMfa);
}