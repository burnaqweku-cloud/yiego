// Pure helpers for the API's webhooks (owner, 21 Nov 2026): address rules and the signature. Shared by the sender
// (api-webhooks/index.ts) and its tests (src/lib/apiWebhook.test.ts). No imports, so it runs in Deno and in Node.

/** Why a webhook address may not be used, before looking its name up; null when it is fine. */
export function urlProblem(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return "The address is not valid"; }
  if (u.protocol !== "https:") return "Only https addresses are allowed";
  if (u.username || u.password) return "Addresses with a username or password are not allowed";
  if (u.port && u.port !== "443") return "Only the normal https port (443) is allowed";
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (isIpLiteral(host)) return "Use a domain name, not an IP address";
  if (/(^|\.)(localhost|local|internal|lan|home|corp|intranet|localdomain|arpa)$/.test(host) || !host.includes(".")) return "That address can't be reached from the internet";
  if (/(^|\.)datayego\.com$/.test(host) || /(^|\.)yiego\.shop$/.test(host) || host === "nhxgebulvqhtiiotetoo.supabase.co") return "Use your own server's address";
  return null;
}

export function isIpLiteral(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || /^\[.*\]$/.test(host) || /^0x[0-9a-f]+$/i.test(host) || /^\d+$/.test(host);
}

/** Private, loopback, link-local (cloud metadata), shared, test and multicast ranges, IPv4 and IPv6. */
export function isPrivateIp(ip: string): boolean {
  const v4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19));
  }
  const x = ip.toLowerCase();
  if (x === "::" || x === "::1") return true;
  const mapped = x.match(/^::ffff:(\d{1,3}(\.\d{1,3}){3})$/);
  if (mapped) return isPrivateIp(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x) || x.startsWith("64:ff9b:") || x.startsWith("2001:db8:") || x.startsWith("100::");
}

export async function hmacHex(secret: string, text: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The X-DataYego-Signature header for a body sent at unix time t. */
export async function signatureHeader(secret: string, t: number, body: string): Promise<string> {
  return `t=${t},v1=${await hmacHex(secret, `${t}.${body}`)}`;
}

/** The webhook body, exactly as sent. */
export function eventBody(e: { id: number; event: string; created_at: string; test: boolean; payload: unknown }): string {
  return JSON.stringify({ id: `evt_${e.id}`, type: e.event, created_at: e.created_at, test: e.test, data: e.payload });
}
