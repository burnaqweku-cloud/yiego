import { supabase } from "@/integrations/supabase/client";

/* Front-end failures reported to the team. One row per failure, visible on
   Admin → Status, so "bundles are not loading" on someone's phone leaves a trace
   with the page, the message and the connection the phone reported. */
export function reportClientError(source: string, message: string, context: Record<string, unknown> = {}) {
  try {
    const nav = navigator as Navigator & { connection?: { effectiveType?: string; downlink?: number; rtt?: number } };
    const ctx = {
      ...context,
      online: navigator.onLine,
      net: nav.connection ? { type: nav.connection.effectiveType, downlink: nav.connection.downlink, rtt: nav.connection.rtt } : undefined,
      ua: navigator.userAgent.slice(0, 160),
      build: typeof __BUILD_VERSION__ === "string" ? __BUILD_VERSION__ : undefined,
    };
    void (supabase as unknown as { schema: (s: string) => { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<unknown> } })
      .schema("phase1").rpc("log_client_error", { p_page: location.pathname, p_source: source, p_message: message, p_context: ctx })
      .then(() => undefined, () => undefined);
  } catch { /* never let reporting break the page */ }
}
