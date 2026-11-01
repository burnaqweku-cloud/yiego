// Requires a server-verified caller ID and their original token. Never accept IDs from a body.
// Service-role reads do not by themselves establish an admin exemption.
// deno-lint-ignore no-explicit-any
export async function maintenanceError(db: any, userId: string | null | undefined, token?: string | null): Promise<string | null> {
  const { data, error } = await db.from("site_settings").select("value").eq("key", "agent_plan").maybeSingle();
  if (error) return "Could not check service availability. Please try again later.";
  const config = data?.value?.maintenance;
  if (config?.enabled !== true) return null;
  if (userId && token) {
    // The caller ID is obtained via auth.getUser(token) by each handler. Decode only to require AAL2.
    try {
      const encoded = token.split(".")[1];
      const claims = JSON.parse(atob(encoded.replace(/-/g, "+").replace(/_/g, "/")));
      if (claims.sub === userId && claims.aal === "aal2") {
        const { data: admin } = await db.from("admin_users").select("user_id").eq("user_id", userId).eq("is_active", true).maybeSingle();
        if (admin) return null;
      }
    } catch { /* invalid claims cannot bypass maintenance */ }
  }
  return typeof config.blocked_message === "string" && config.blocked_message.trim() ? config.blocked_message.trim().slice(0, 300) : "Maintenance is in progress. This service is temporarily unavailable. Please try again later.";
}