import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DATACART_BASE_URL, syncDataCartMappings } from "../_shared/datacart-catalog.ts";
import { getDataMartBalance, getSupplierABalance, getDataCartBalance, getAfroHubGHBalance } from "../_shared/supplier-dispatch.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function getAdminUser(req: Request): Promise<{ userId: string; supabase: any } | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const supabaseAuth = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const token = authHeader.replace("Bearer ", "");
  const { data: claims, error } = await supabaseAuth.auth.getClaims(token);
  if (error || !claims?.claims?.sub) return null;

  const userId = claims.claims.sub as string;
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: roleData } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin"]);

  if (!roleData || roleData.length === 0) return null;

  return { userId, supabase };
}

function getBalanceChecker(code: string) {
  if (code === "DATAMART") return getDataMartBalance;
  if (code === "DATACART") return getDataCartBalance;
  if (code === "AFROHUBGH") return getAfroHubGHBalance;
  return getSupplierABalance;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const admin = await getAdminUser(req);
    if (!admin) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { supabase } = admin;
    const body = await req.json();
    const { action, supplier_code } = body;

    // ─── ACTION: check_balance ────────────────────────────────
    if (action === "check_balance") {
      const checker = getBalanceChecker(supplier_code);
      const result = await checker();

      if (result.ok && result.balance != null) {
        const { data: supplier } = await supabase
          .from("suppliers").select("id").eq("code", supplier_code).maybeSingle();

        if (supplier) {
          await supabase.from("suppliers").update({
            last_balance: result.balance,
            last_balance_updated_at: new Date().toISOString(),
          }).eq("id", supplier.id);

          await supabase.from("supplier_balance_snapshots").insert({
            supplier_id: supplier.id,
            balance: result.balance,
            source: "API",
          });
        }
      }

      return new Response(JSON.stringify(result), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: test_connection ──────────────────────────────
    if (action === "test_connection") {
      const checker = getBalanceChecker(supplier_code);
      const result = await checker();

      return new Response(JSON.stringify({
        connected: result.ok,
        balance: result.balance,
        error: result.error,
        supplier_code,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── ACTION: get_packages (DataMart only) ────────────────
    if (action === "get_packages") {
      const apiKey = Deno.env.get("DATAMART_API_KEY");
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "DataMart API key not configured" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const network = body.network || "";
      const url = `https://api.datamartgh.shop/api/developer/data-packages${network ? `?network=${network}` : ""}`;

      try {
        const response = await fetch(url, {
          headers: { "X-API-Key": apiKey },
        });
        const data = await response.json();
        return new Response(JSON.stringify({ ok: response.ok, packages: data }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: String(err) }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── ACTION: datacart_plans ──────────────────────────────
    if (action === "datacart_plans") {
      const apiKey = Deno.env.get("DATACART_API_KEY");
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "DataCart API key not configured" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const response = await fetch(`${DATACART_BASE_URL}/v1/plans`, {
          headers: { "Authorization": `Bearer ${apiKey}` },
        });
        const data = await response.json();
        return new Response(JSON.stringify({ ok: response.ok, plans: data }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: String(err) }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── ACTION: datacart_networks ───────────────────────────
    if (action === "datacart_networks") {
      const apiKey = Deno.env.get("DATACART_API_KEY");
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "DataCart API key not configured" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      try {
        const response = await fetch(`${DATACART_BASE_URL}/v1/networks`, {
          headers: { "Authorization": `Bearer ${apiKey}` },
        });
        const data = await response.json();
        return new Response(JSON.stringify({ ok: response.ok, networks: data }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: String(err) }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── ACTION: sync_datacart_mappings ─────────────────────────
    if (action === "sync_datacart_mappings") {
      try {
        const result = await syncDataCartMappings(supabase);
        return new Response(JSON.stringify(result), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: String(err) }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── ACTION: resync_orders (DataMart transactions lookup) ─
    if (action === "resync_orders") {
      const apiKey = Deno.env.get("DATAMART_API_KEY");
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "DataMart API key not configured" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const page = body.page || 1;
      const limit = body.limit || 20;
      const url = `https://api.datamartgh.shop/api/developer/transactions?page=${page}&limit=${limit}`;

      try {
        const response = await fetch(url, {
          headers: { "X-API-Key": apiKey },
        });
        const data = await response.json();

        if (!response.ok) {
          return new Response(JSON.stringify({ ok: false, error: data.message || `HTTP ${response.status}` }), {
            status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const transactions = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
        let matched = 0;
        let updated = 0;

        for (const tx of transactions) {
          const ref = tx.transactionReference || tx.reference || tx.id;
          if (!ref) continue;

          const { data: order } = await supabase
            .from("orders")
            .select("order_id, status, supplier_reference")
            .or(`supplier_reference.eq.${ref},supplier_order_id.eq.${ref}`)
            .maybeSingle();

          if (!order) continue;
          matched++;

          const dmStatus = String(tx.status || "").toLowerCase();
          let newStatus: string | null = null;

          if (dmStatus === "completed" || dmStatus === "success" || dmStatus === "delivered") {
            if (order.status !== "Delivered") newStatus = "Delivered";
          } else if (dmStatus === "failed" || dmStatus === "rejected") {
            if (order.status !== "Failed") newStatus = "Failed";
          }

          if (newStatus) {
            await supabase.from("orders").update({
              status: newStatus,
              supplier_status: dmStatus,
              supplier_message: tx.message || `Synced from DataMart: ${dmStatus}`,
              supplier_timestamp: new Date().toISOString(),
            }).eq("order_id", order.order_id);
            updated++;
            console.log(`[resync] Order ${order.order_id} → ${newStatus}`);
          }
        }

        return new Response(JSON.stringify({
          ok: true,
          total_transactions: transactions.length,
          matched,
          updated,
        }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, error: String(err) }), {
          status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ─── ACTION: dry_run_route ───────────────────────────────
    // Resolves which supplier WOULD be used for a given product, without
    // placing a real order. Returns supplier code, active state, secret
    // readiness, and (for DataCart) provider mapping.
    if (action === "dry_run_route") {
      const productId = body.product_id as string | undefined;
      if (!productId) {
        return new Response(JSON.stringify({ ok: false, error: "product_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: product } = await supabase
        .from("products")
        .select("id, network, bundle_size_gb, active")
        .eq("id", productId)
        .maybeSingle();
      if (!product) {
        return new Response(JSON.stringify({ ok: false, error: "Product not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Routing lookup
      const { data: rule } = await supabase
        .from("routing_rules")
        .select("id, supplier_id, status, suppliers!inner(code, name, is_active)")
        .eq("product_id", productId)
        .eq("status", "ACTIVE")
        .maybeSingle();

      let supplierCode = "SUPPLIER_A";
      let supplierName = "Supplier A";
      let supplierActive = true;
      let routedBy: "rule" | "fallback" = "fallback";
      if (rule?.suppliers) {
        supplierCode = rule.suppliers.code;
        supplierName = rule.suppliers.name;
        supplierActive = !!rule.suppliers.is_active;
        routedBy = "rule";
      }

      // Credential / setup readiness
      const secretsByCode: Record<string, string[]> = {
        SUPPLIER_A: ["SUPPLIER_A_API_BASE_URL|SUPPLIER_API_BASE_URL", "SUPPLIER_A_API_KEY|SUPPLIER_API_KEY"],
        DATACART: ["DATACART_API_KEY"],
        DATAMART: ["DATAMART_API_KEY"],
        AFROHUBGH: ["AFROHUBGH_API_BASE_URL", "AFROHUBGH_API_KEY"],
      };
      const required = secretsByCode[supplierCode] || [];
      const missingSecrets = required.filter((spec) => {
        const opts = spec.split("|");
        return !opts.some((k) => !!Deno.env.get(k));
      });

      // DataCart provider mapping check
      let mappingStatus: { ok: boolean; detail?: string } = { ok: true };
      if (supplierCode === "DATACART") {
        try {
          const { resolveDataCartProviderMapping } = await import("../_shared/datacart-catalog.ts");
          const resolved = await resolveDataCartProviderMapping(supabase, {
            network: product.network,
            sizeGb: Number(product.bundle_size_gb),
            productId,
          });
          mappingStatus = resolved.ok
            ? { ok: true }
            : { ok: false, detail: resolved.error || "Missing DataCart mapping" };
        } catch (err) {
          mappingStatus = { ok: false, detail: String(err) };
        }
      }

      const wouldDispatch = supplierActive && missingSecrets.length === 0 && mappingStatus.ok;
      const blockers: string[] = [];
      if (!supplierActive) blockers.push(`${supplierName} is inactive`);
      if (missingSecrets.length) blockers.push(`Missing secrets: ${missingSecrets.join(", ")}`);
      if (!mappingStatus.ok) blockers.push(mappingStatus.detail || "Missing product mapping");

      return new Response(JSON.stringify({
        ok: true,
        product: {
          id: product.id,
          network: product.network,
          bundle_size_gb: product.bundle_size_gb,
        },
        routed_by: routedBy,
        supplier_code: supplierCode,
        supplier_name: supplierName,
        supplier_active: supplierActive,
        missing_secrets: missingSecrets,
        mapping_ok: mappingStatus.ok,
        mapping_detail: mappingStatus.detail || null,
        would_dispatch: wouldDispatch,
        blockers,
      }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[supplier-admin] Error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
