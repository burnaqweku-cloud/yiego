import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Load all active products
    const { data: products, error: prodErr } = await supabase
      .from("products")
      .select("id, network, bundle_size_gb, price_ghs, cost_price_ghs, markup_percent, active")
      .eq("active", true);

    if (prodErr || !products) {
      console.error("[get-public-prices] Failed to load products:", prodErr);
      return new Response(
        JSON.stringify({ error: "Failed to load products" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load pricing config from site_settings
    const { data: settingsRows } = await supabase.from("site_settings").select("key, value");
    const s: Record<string, string> = {};
    (settingsRows || []).forEach((row: any) => {
      s[row.key] = row.value;
    });

    // Load pricing overrides (normal customer type only)
    const { data: overrides } = await supabase
      .from("pricing_overrides")
      .select("*")
      .eq("customer_type", "normal");

    // Rounding helper
    const roundingMode = s.rounding_mode || "2_decimals";
    const roundingStep = parseFloat(s.rounding_step || "0.01");

    function applyRounding(price: number): number {
      if (price < 0) return 0;
      if (roundingMode === "nearest_010") {
        return Math.round(price * 10) / 10;
      }
      if (roundingStep > 0.01) {
        return Math.ceil(price / roundingStep) * roundingStep;
      }
      return Math.round(price * 100) / 100;
    }

    // Compute selling price for each product
    const prices: Record<string, number> = {};

    for (const product of products) {
      const override = (overrides || []).find(
        (o: any) => o.product_id === product.id
      );

      const costPrice =
        product.cost_price_ghs != null && Number(product.cost_price_ghs) > 0
          ? Number(product.cost_price_ghs)
          : 0;

      let sellingPrice: number;

      // Priority 1: Manual override
      if (
        override?.pricing_mode === "manual" &&
        override.manual_price != null &&
        Number(override.manual_price) > 0
      ) {
        sellingPrice = Number(override.manual_price);
      }
      // Priority 2: Override with custom markup percent
      else if (override?.markup_percent_override != null && costPrice > 0) {
        sellingPrice = applyRounding(
          costPrice * (1 + Number(override.markup_percent_override) / 100)
        );
      }
      // Priority 3: Auto pricing from cost
      else if (costPrice > 0) {
        if (product.markup_percent != null) {
          sellingPrice = applyRounding(
            costPrice * (1 + Number(product.markup_percent) / 100)
          );
        } else {
          const normalMarkupType = s.normal_markup_type || "percent";
          if (normalMarkupType === "fixed") {
            sellingPrice = applyRounding(
              costPrice + parseFloat(s.normal_markup_fixed || "0")
            );
          } else {
            const network = String(product.network).toLowerCase();
            const networkKey = `${network}_markup_percent`;
            const markupPercent = s[networkKey]
              ? parseFloat(s[networkKey])
              : parseFloat(s.default_markup_percent || "15");
            sellingPrice = applyRounding(
              costPrice * (1 + markupPercent / 100)
            );
          }
        }
      }
      // Priority 4: Fallback to price_ghs
      else {
        sellingPrice = Number(product.price_ghs);
      }

      prices[product.id] = sellingPrice;
    }

    return new Response(
      JSON.stringify({ prices, timestamp: new Date().toISOString() }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Cache-Control": "public, max-age=30",
        },
      }
    );
  } catch (err) {
    console.error("[get-public-prices] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
