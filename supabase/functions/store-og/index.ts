import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * store-og — Serves an HTML page with proper Open Graph meta tags for agent stores.
 * Social crawlers (WhatsApp, Twitter, Facebook, Telegram) see OG tags.
 * Real users get redirected to the actual store page via JS + meta refresh.
 *
 * Usage: /functions/v1/store-og?slug=john
 */

const CANONICAL = "https://datasika.com";

Deno.serve(async (req) => {
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const url = new URL(req.url);
    const slug = url.searchParams.get("slug");

    if (!slug) {
      // Redirect to homepage
      return new Response(null, {
        status: 302,
        headers: { Location: CANONICAL },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { data: agent } = await sb
      .from("agents")
      .select("store_name, store_slug, store_description, status")
      .eq("store_slug", slug)
      .eq("status", "active")
      .maybeSingle();

    // Fallback values
    const storeName = agent?.store_name || "Data Store";
    const storeDesc = agent?.store_description || "Buy affordable MTN, Telecel & AirtelTigo data bundles";
    const title = `${storeName} — Data Bundles`;
    const description = storeDesc.length > 155 ? storeDesc.slice(0, 152) + "…" : storeDesc;
    const storeUrl = `${CANONICAL}/store/${slug}`;
    const ogImageUrl = `${supabaseUrl}/functions/v1/og-store-image?slug=${encodeURIComponent(slug)}&v=2`;

    // If no agent found, still show a reasonable preview and redirect
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}"/>

  <!-- Open Graph -->
  <meta property="og:title" content="${esc(title)}"/>
  <meta property="og:description" content="${esc(description)}"/>
  <meta property="og:image" content="${esc(ogImageUrl)}"/>
  <meta property="og:image:width" content="1200"/>
  <meta property="og:image:height" content="630"/>
  <meta property="og:url" content="${esc(storeUrl)}"/>
  <meta property="og:type" content="website"/>
  <meta property="og:site_name" content="DataSika"/>
  <meta property="og:locale" content="en_GH"/>

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image"/>
  <meta name="twitter:title" content="${esc(title)}"/>
  <meta name="twitter:description" content="${esc(description)}"/>
  <meta name="twitter:image" content="${esc(ogImageUrl)}"/>

  <!-- Redirect real users to the actual store -->
  <meta http-equiv="refresh" content="0;url=${esc(storeUrl)}"/>
  <link rel="canonical" href="${esc(storeUrl)}"/>

  <script>window.location.replace(${JSON.stringify(storeUrl)});</script>
</head>
<body>
  <p>Redirecting to <a href="${esc(storeUrl)}">${esc(storeName)}</a>…</p>
</body>
</html>`;

    return new Response(html, {
      headers: {
        ...CORS,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=300, s-maxage=3600",
      },
    });
  } catch (err) {
    console.error("store-og error:", err);
    return new Response(null, {
      status: 302,
      headers: { Location: CANONICAL },
    });
  }
});

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
