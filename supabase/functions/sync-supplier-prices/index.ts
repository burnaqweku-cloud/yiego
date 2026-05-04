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
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Admin check
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userData.user.id)
      .in("role", ["admin"]);

    if (!roleData || roleData.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden: admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Supplier price sync initiated by admin: ${userData.user.id}`);

    // Fetch all products
    const { data: products, error: prodError } = await supabase
      .from("products")
      .select("id, network, bundle_size_gb, cost_price_ghs, supplier_last_updated");

    if (prodError || !products) {
      console.error("Failed to fetch products:", prodError);
      return new Response(JSON.stringify({ error: "Failed to fetch products" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try to fetch supplier product list
    const baseUrl = Deno.env.get("SUPPLIER_API_BASE_URL");
    const apiKey = Deno.env.get("SUPPLIER_API_KEY");

    if (!baseUrl || !apiKey) {
      return new Response(JSON.stringify({ 
        error: "Supplier API not configured",
        updated: 0, unchanged: 0, failed: products.length 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let supplierProducts: any[] = [];
    try {
      const cleanBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
      const url = cleanBase + "/products";
      console.log(`Fetching supplier products from: ${url}`);
      
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
      });

      if (response.ok) {
        const data = await response.json();
        supplierProducts = Array.isArray(data) ? data : (data.products || data.data || []);
        console.log(`Received ${supplierProducts.length} products from supplier`);
      } else {
        const errText = await response.text();
        console.error(`Supplier API returned ${response.status}: ${errText}`);
        return new Response(JSON.stringify({ 
          error: `Supplier API returned ${response.status}`,
          updated: 0, unchanged: 0, failed: products.length 
        }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (err) {
      console.error("Supplier API network error:", err);
      return new Response(JSON.stringify({ 
        error: `Network error: ${String(err)}`,
        updated: 0, unchanged: 0, failed: products.length 
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Match and update
    let updated = 0;
    let unchanged = 0;
    let failed = 0;

    for (const product of products) {
      try {
        // Try to find matching supplier product
        const match = supplierProducts.find((sp: any) => {
          const spNetwork = (sp.network || "").toLowerCase();
          const prodNetwork = product.network.toLowerCase();
          const spSize = parseFloat(sp.data_amount || sp.size || sp.bundle_size_gb || "0");
          return spNetwork === prodNetwork && spSize === product.bundle_size_gb;
        });

        if (match) {
          const supplierCost = parseFloat(match.price || match.cost || match.amount || "0");
          if (supplierCost > 0) {
            const currentCost = product.cost_price_ghs ? Number(product.cost_price_ghs) : null;
            
            if (currentCost !== supplierCost) {
              await supabase
                .from("products")
                .update({ 
                  cost_price_ghs: supplierCost,
                  supplier_last_updated: new Date().toISOString()
                })
                .eq("id", product.id);
              updated++;
              console.log(`Updated ${product.network} ${product.bundle_size_gb}GB: ${currentCost} → ${supplierCost}`);
            } else {
              // Update timestamp even if price unchanged
              await supabase
                .from("products")
                .update({ supplier_last_updated: new Date().toISOString() })
                .eq("id", product.id);
              unchanged++;
            }
          } else {
            failed++;
          }
        } else {
          // No match found - keep existing cost
          console.log(`No supplier match for ${product.network} ${product.bundle_size_gb}GB`);
          failed++;
        }
      } catch (err) {
        console.error(`Error updating product ${product.id}:`, err);
        failed++;
      }
    }

    // Log the sync action
    await supabase.from("audit_logs").insert({
      actor_id: userData.user.id,
      action: "supplier_price_sync",
      entity_type: "products",
      changes: { updated, unchanged, failed },
    });

    console.log(`Sync complete: updated=${updated}, unchanged=${unchanged}, failed=${failed}`);

    return new Response(JSON.stringify({ updated, unchanged, failed }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Unexpected error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
