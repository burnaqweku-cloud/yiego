/**
 * Shared security access check for edge functions.
 * Calls the check_security_access RPC and logs to security_events.
 */

// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface SecurityCheckParams {
  supabase: any; // service role client
  userId?: string | null;
  ip?: string | null;
  deviceHash?: string | null;
  phone?: string | null;
  email?: string | null;
}

export interface SecurityCheckResult {
  allowed: boolean;
  block_type: string | null;
  message: string | null;
}

/**
 * Run check_security_access RPC.
 * Returns { allowed, block_type, message }.
 * On RPC error, defaults to allowed=true (fail-open to not break payments).
 */
export async function checkSecurityAccess(params: SecurityCheckParams): Promise<SecurityCheckResult> {
  const { supabase, userId, ip, deviceHash, phone, email } = params;

  try {
    const { data, error } = await supabase.rpc("check_security_access", {
      p_user_id: userId || null,
      p_ip: ip || null,
      p_device_hash: deviceHash || null,
      p_phone: phone || null,
      p_email: email || null,
    });

    if (error) {
      console.error("[security-check] RPC error:", error.message);
      return { allowed: true, block_type: null, message: null }; // fail-open
    }

    const result = data as { allowed: boolean; block_type: string | null; message: string | null };
    return result;
  } catch (err) {
    console.error("[security-check] Unexpected error:", err);
    return { allowed: true, block_type: null, message: null }; // fail-open
  }
}

/**
 * Log a security event (fire-and-forget, non-blocking).
 */
export async function logSecurityEvent(
  supabase: any,
  eventType: string,
  opts: {
    userId?: string | null;
    ip?: string | null;
    deviceHash?: string | null;
    userAgent?: string | null;
    meta?: Record<string, unknown>;
  } = {}
): Promise<void> {
  try {
    await supabase.from("security_events").insert({
      event_type: eventType,
      user_id: opts.userId || null,
      ip: opts.ip || null,
      device_hash: opts.deviceHash || null,
      user_agent: opts.userAgent || null,
      meta: opts.meta || {},
    });
  } catch (err) {
    console.error("[security-event] Log failed:", err);
  }
}

/**
 * Extract client IP from request headers.
 */
export function extractClientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * Build a blocked response with CORS headers.
 */
export function blockedResponse(
  message: string,
  corsHeaders: Record<string, string>,
  status = 403
): Response {
  return new Response(
    JSON.stringify({ error: message, blocked: true }),
    { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
