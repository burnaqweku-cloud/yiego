import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Generate a premium SVG OG image for an agent store (1200×630) */
function generateStoreSVG(storeName: string): string {
  // Truncate long names
  const name = storeName.length > 28 ? storeName.slice(0, 26) + "…" : storeName;
  const fontSize = name.length > 18 ? 52 : 62;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <!-- Background gradient -->
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0a0a1a"/>
      <stop offset="40%" stop-color="#111132"/>
      <stop offset="100%" stop-color="#1a1040"/>
    </linearGradient>
    <!-- Accent glow -->
    <radialGradient id="glow1" cx="80%" cy="30%" r="50%">
      <stop offset="0%" stop-color="#F4B400" stop-opacity="0.15"/>
      <stop offset="100%" stop-color="#F4B400" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow2" cx="20%" cy="80%" r="40%">
      <stop offset="0%" stop-color="#4f46e5" stop-opacity="0.12"/>
      <stop offset="100%" stop-color="#4f46e5" stop-opacity="0"/>
    </radialGradient>
    <!-- Network accent bar gradient -->
    <linearGradient id="netbar" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#FFCC00"/>
      <stop offset="50%" stop-color="#E40046"/>
      <stop offset="100%" stop-color="#0072CE"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow1)"/>
  <rect width="1200" height="630" fill="url(#glow2)"/>

  <!-- Subtle grid pattern -->
  <g opacity="0.04">
    ${Array.from({ length: 12 }, (_, i) => `<line x1="${i * 100}" y1="0" x2="${i * 100}" y2="630" stroke="white" stroke-width="0.5"/>`).join("")}
    ${Array.from({ length: 7 }, (_, i) => `<line x1="0" y1="${i * 90}" x2="1200" y2="${i * 90}" stroke="white" stroke-width="0.5"/>`).join("")}
  </g>

  <!-- Decorative circles -->
  <circle cx="1050" cy="120" r="80" fill="none" stroke="#F4B400" stroke-width="1.5" opacity="0.12"/>
  <circle cx="1050" cy="120" r="50" fill="none" stroke="#F4B400" stroke-width="1" opacity="0.08"/>
  <circle cx="150" cy="520" r="60" fill="none" stroke="#4f46e5" stroke-width="1.5" opacity="0.1"/>

  <!-- Network accent bar at top -->
  <rect x="0" y="0" width="1200" height="4" fill="url(#netbar)"/>

  <!-- Store icon (simple storefront) -->
  <g transform="translate(100, 210)" opacity="0.9">
    <rect x="0" y="24" width="44" height="32" rx="3" fill="none" stroke="#F4B400" stroke-width="2.5"/>
    <path d="M-4 24 L22 4 L48 24" fill="none" stroke="#F4B400" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="16" y="38" width="12" height="18" rx="1.5" fill="none" stroke="#F4B400" stroke-width="2"/>
  </g>

  <!-- Store name -->
  <text x="170" y="260" font-family="system-ui, -apple-system, 'Segoe UI', Arial, sans-serif" font-size="${fontSize}" font-weight="700" fill="white" letter-spacing="-1">${escapeXml(name)}</text>

  <!-- Subtitle -->
  <text x="170" y="310" font-family="system-ui, -apple-system, 'Segoe UI', Arial, sans-serif" font-size="24" font-weight="400" fill="#a0a0c0" letter-spacing="0.5">Affordable Data Bundles</text>

  <!-- Network tags -->
  <g transform="translate(170, 350)">
    <rect x="0" y="0" width="72" height="32" rx="16" fill="#FFCC00" fill-opacity="0.15" stroke="#FFCC00" stroke-width="1" stroke-opacity="0.3"/>
    <text x="36" y="21" font-family="system-ui, Arial, sans-serif" font-size="13" font-weight="600" fill="#FFCC00" text-anchor="middle">MTN</text>

    <rect x="88" y="0" width="88" height="32" rx="16" fill="#E40046" fill-opacity="0.12" stroke="#E40046" stroke-width="1" stroke-opacity="0.3"/>
    <text x="132" y="21" font-family="system-ui, Arial, sans-serif" font-size="13" font-weight="600" fill="#E85070" text-anchor="middle">Telecel</text>

    <rect x="192" y="0" width="104" height="32" rx="16" fill="#0072CE" fill-opacity="0.12" stroke="#0072CE" stroke-width="1" stroke-opacity="0.3"/>
    <text x="244" y="21" font-family="system-ui, Arial, sans-serif" font-size="13" font-weight="600" fill="#4da6ff" text-anchor="middle">AirtelTigo</text>
  </g>

  <!-- Bottom bar -->
  <rect x="0" y="590" width="1200" height="40" fill="rgba(0,0,0,0.3)"/>
  <text x="600" y="616" font-family="system-ui, Arial, sans-serif" font-size="14" font-weight="500" fill="#666680" text-anchor="middle" letter-spacing="1">Powered by DataSika</text>
</svg>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");

    if (!slug) {
      return new Response("Missing slug", { status: 400, headers: CORS });
    }

    // Look up agent store
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { data: agent } = await sb
      .from("agents")
      .select("store_name, store_slug, status")
      .eq("store_slug", slug)
      .eq("status", "active")
      .maybeSingle();

    const storeName = agent?.store_name || slug;
    const svg = generateStoreSVG(storeName);

    // Return SVG (universally supported, fast, no WASM needed)
    // For maximum compatibility, we serve as SVG
    return new Response(svg, {
      headers: {
        ...CORS,
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=3600, s-maxage=86400",
      },
    });
  } catch (err) {
    console.error("og-store-image error:", err);
    // Return a fallback generic SVG on error
    const fallback = generateStoreSVG("Data Store");
    return new Response(fallback, {
      headers: {
        ...CORS,
        "Content-Type": "image/svg+xml",
        "Cache-Control": "public, max-age=300",
      },
    });
  }
});
