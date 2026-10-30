import { supabase } from "@/integrations/supabase/client";
import { prime } from "@/lib/requestCache";

/* Page start: one request for everything public the first screen needs — prices, networks, the agent plan settings,
 * the contact block and the delivery-speed pills — instead of five or six separate ones. It fills the request cache,
 * so the existing loaders (loadPhase1Products, loadPhase1Networks, useContactSettings, useDeliverySpeed) answer from
 * memory. If it fails or the function is missing, nothing breaks: each loader just asks for itself as before.
 * Values come back under the caller's own row rules (SECURITY INVOKER), exactly what the separate requests returned. */

interface Bootstrap {
  products: unknown[]; networks: unknown[];
  settings: Record<string, unknown>; contact: unknown | null; speed: Record<string, unknown> | null;
}

let started: Promise<void> | null = null;

/** Runs once per page load; every caller awaits the same request. Never throws. */
export function bootstrapOnce(): Promise<void> {
  if (started) return started;
  started = (async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as unknown as { schema: (s: string) => any }).schema("phase1").rpc("public_bootstrap", {});
      if (error || !data) return;
      const b = data as Bootstrap;
      if (Array.isArray(b.products) && b.products.length) prime("catalog:products", { data: b.products, error: null }, { persist: true });
      if (Array.isArray(b.networks) && b.networks.length) prime("catalog:networks", { data: b.networks, error: null }, { persist: true });
      if (b.contact) prime("public:contact", b.contact, { persist: true });
      if (b.speed) prime("public:delivery-speed", { data: b.speed, ok: true });   // memory only: the speed is read fresh on every page open
      if (b.settings && "agent_plan" in b.settings) prime("public:settings", b.settings, { persist: true });
    } catch { /* fall back to the individual requests */ }
  })();
  return started;
}
