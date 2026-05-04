// Admin-only bulk order creation + real supplier dispatch.
// - Bypasses duplicate-active-order guard (intentional for admin bulk only).
// - No wallet deduction, no Paystack, no fee, no balance change.
// - Forces a chosen supplier per-call via dispatchToSupplier({ forceSupplierCode })
//   so routing_rules and other live flows are NEVER mutated.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dispatchToSupplier, parseDispatchResult } from "../_shared/supplier-dispatch.ts";
import { logSupplierSpend } from "../_shared/supplier-ledger.ts";
import { validateNetworkMatch } from "../_shared/network-detect.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALLOWED_NETWORKS = new Set(["MTN", "Telecel", "AirtelTigo"]);
const ALLOWED_SUPPLIERS = new Set(["SUPPLIER_A", "DATAMART", "DATACART"]);
const MAX_LINES = 200;

function generateOrderId(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let r = "BLK-";
  for (let i = 0; i < 7; i++) r += chars.charAt(Math.floor(Math.random() * chars.length));
  return r;
}

function normalizePhone(raw: string): string {
  let p = raw.trim().replace(/[\s\-\(\)]/g, "");
  if (p.startsWith("+233")) p = "0" + p.slice(4);
  else if (p.startsWith("233") && p.length === 12) p = "0" + p.slice(3);
  return p;
}

function isValidGhanaPhone(p: string): boolean {
  return /^0\d{9}$/.test(p);
}

interface ParsedLine {
  lineNo: number;
  raw: string;
  phone?: string;
  gb?: number;
  error?: string;
}

function parseLines(text: string): ParsedLine[] {
  const out: ParsedLine[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const lineNo = i + 1;
    const parts = trimmed.split(/[\s,]+/).filter(Boolean);
    if (parts.length < 2) {
      out.push({ lineNo, raw: trimmed, error: "Missing bundle value" });
      continue;
    }
    const phone = normalizePhone(parts[0]);
    const gb = Number(parts[1]);
    if (!isValidGhanaPhone(phone)) {
      out.push({ lineNo, raw: trimmed, error: "Invalid phone number" });
      continue;
    }
    if (!Number.isFinite(gb) || gb <= 0) {
      out.push({ lineNo, raw: trimmed, error: "Invalid bundle value" });
      continue;
    }
    out.push({ lineNo, raw: trimmed, phone, gb });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, s = 200) =>
    new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Admin auth — admin role only (not staff).
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const adminId = userData.user.id;
    const adminEmail = userData.user.email || "";

    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", adminId).eq("role", "admin");
    if (!roleData || roleData.length === 0) return json({ error: "Admin role required" }, 403);

    const body = await req.json().catch(() => ({}));
    const {
      network,
      supplier_code,
      user_id,
      lines_text,
      mode = "dispatch", // 'preview' | 'dispatch'
    } = body || {};

    // Top-level validation
    if (!network || !ALLOWED_NETWORKS.has(network)) return json({ error: "Invalid network" }, 400);
    if (!supplier_code || !ALLOWED_SUPPLIERS.has(supplier_code)) return json({ error: "Invalid supplier" }, 400);
    if (!user_id || typeof user_id !== "string") return json({ error: "user_id required" }, 400);
    if (typeof lines_text !== "string" || !lines_text.trim()) return json({ error: "lines_text required" }, 400);

    const parsed = parseLines(lines_text);
    if (parsed.length === 0) return json({ error: "No order lines provided" }, 400);
    if (parsed.length > MAX_LINES) return json({ error: `Too many lines (max ${MAX_LINES})` }, 400);

    // Per-line network mismatch
    for (const ln of parsed) {
      if (ln.error) continue;
      const mismatch = validateNetworkMatch(ln.phone!, network);
      if (mismatch) ln.error = mismatch;
    }

    const errors = parsed.filter((l) => l.error);
    const valid = parsed.filter((l) => !l.error);

    if (errors.length > 0) {
      return json({
        error: "Validation failed",
        validation_errors: errors.map((e) => ({ line: e.lineNo, raw: e.raw, message: e.error })),
        total_lines: parsed.length,
        valid_lines: valid.length,
      }, 400);
    }

    // Verify user (ownership only — no balance touched)
    const { data: profile } = await supabase
      .from("profiles").select("id, full_name").eq("id", user_id).maybeSingle();
    if (!profile) return json({ error: "Selected user not found" }, 404);

    // Resolve supplier UUID for forced override
    const { data: supplierRow } = await supabase
      .from("suppliers").select("id, code, is_active").eq("code", supplier_code).maybeSingle();
    if (!supplierRow) return json({ error: "Supplier not configured" }, 400);
    if (!supplierRow.is_active) return json({ error: "Supplier inactive" }, 400);

    // Resolve products (server-side source of truth)
    const sizes = [...new Set(valid.map((l) => l.gb!))];
    const { data: products } = await supabase
      .from("products")
      .select("id, network, bundle_size_gb, price_ghs, cost_price_ghs, active")
      .eq("network", network)
      .in("bundle_size_gb", sizes);
    const productByGb = new Map<number, any>();
    for (const p of (products || [])) {
      if (!p.active) continue;
      productByGb.set(Number(p.bundle_size_gb), p);
    }
    const missingSizes = sizes.filter((s) => !productByGb.has(s));
    if (missingSizes.length > 0) {
      return json({
        error: `No active product for ${network} sizes: ${missingSizes.join(", ")} GB`,
      }, 400);
    }

    // Preview mode (parse + price check, no inserts, no dispatch)
    if (mode === "preview") {
      return json({
        success: true,
        preview: true,
        total_lines: parsed.length,
        valid_lines: valid.length,
        items: valid.map((l) => ({
          line: l.lineNo, phone: l.phone, gb: l.gb,
          price_ghs: Number(productByGb.get(l.gb!)!.price_ghs),
        })),
      });
    }

    // ─── Dispatch mode ─────────────────────────────────────
    const results: Array<{
      line: number;
      phone: string;
      gb: number;
      order_id?: string;
      created: boolean;
      dispatched: boolean;
      supplier_status?: string | null;
      supplier_message?: string | null;
      supplier_order_id?: string | null;
      error?: string;
    }> = [];

    const createdOrderIds: string[] = [];

    for (const ln of valid) {
      const product = productByGb.get(ln.gb!)!;
      const orderId = generateOrderId();
      const amountGhs = Number(product.price_ghs);
      const costPrice = Number(product.cost_price_ghs ?? product.price_ghs);

      // INSERT — bypasses duplicate guard intentionally for this admin flow.
      // No wallet/payment side-effects; status='Paid' so dispatch + admin
      // views treat it like any admin-created order.
      const { error: insertErr } = await supabase.from("orders").insert({
        order_id: orderId,
        user_id,
        recipient_number: ln.phone!,
        network,
        product_id: product.id,
        bundle_size_gb: product.bundle_size_gb,
        amount_ghs: amountGhs,
        cost_price_ghs: costPrice,
        status: "Paid",
        payment_method: "admin_bulk",
        payment_status: "paid",
        order_source: "admin_bulk",
        admin_notes: `Bulk dispatch by ${adminEmail} → ${supplier_code}`,
        supplier_id: supplierRow.id,
      });

      if (insertErr) {
        results.push({
          line: ln.lineNo, phone: ln.phone!, gb: ln.gb!,
          created: false, dispatched: false,
          error: `DB insert failed: ${insertErr.message}`,
        });
        continue;
      }
      createdOrderIds.push(orderId);

      // Force the admin's chosen supplier (does NOT touch routing_rules).
      const result = await dispatchToSupplier(supabase, {
        network,
        phone_number: ln.phone!,
        data_amount: String(product.bundle_size_gb),
      }, product.id, {
        orderId,
        createdBy: `admin_bulk:${adminId}`,
        forceSupplierCode: supplier_code,
      });

      const rawResponse = JSON.stringify(result.body);

      // supplier_api_logs for parity with admin-create-order
      await supabase.from("supplier_api_logs").insert({
        order_id: orderId,
        request_payload: {
          network, phone_number: ln.phone, data_amount: String(product.bundle_size_gb),
          forced_supplier: supplier_code,
        },
        response_body: result.body,
        response_status: String(result.status),
        success: result.ok,
        error_message: result.ok ? null : String((result.body as any).message || (result.body as any).error || "Unknown"),
        supplier_balance: (result.body as any).remaining_balance != null ? Number((result.body as any).remaining_balance) : null,
      });

      if (result.ok) {
        const p = parseDispatchResult(result);
        await supabase.from("orders").update({
          status: "Processing",
          supplier_order_id: p.supplierOrderId,
          supplier_reference: p.supplierReference,
          supplier_status: p.supplierStatus,
          supplier_message: p.supplierMessage,
          supplier_amount: p.supplierAmount,
          supplier_remaining_balance: p.supplierBalance,
          supplier_timestamp: new Date().toISOString(),
          supplier_raw_response: rawResponse,
          supplier_id: result.supplierId ?? supplierRow.id,
        }).eq("order_id", orderId);

        await logSupplierSpend(supabase, orderId, costPrice, {
          network, bundle_size_gb: product.bundle_size_gb,
          recipient: ln.phone, supplier_order_id: p.supplierOrderId,
        });

        results.push({
          line: ln.lineNo, phone: ln.phone!, gb: ln.gb!, order_id: orderId,
          created: true, dispatched: true,
          supplier_status: p.supplierStatus, supplier_message: p.supplierMessage,
          supplier_order_id: p.supplierOrderId,
        });
      } else {
        const reason = (result.body as any).message || (result.body as any).error || `Supplier HTTP ${result.status}`;
        await supabase.from("orders").update({
          status: "Failed",
          failure_reason: String(reason).slice(0, 500),
          supplier_raw_response: rawResponse,
          supplier_status: "failed",
          supplier_message: String(reason).slice(0, 500),
          supplier_timestamp: new Date().toISOString(),
        }).eq("order_id", orderId);

        results.push({
          line: ln.lineNo, phone: ln.phone!, gb: ln.gb!, order_id: orderId,
          created: true, dispatched: false,
          supplier_message: String(reason).slice(0, 200),
          error: String(reason).slice(0, 200),
        });
      }
    }

    // Single bulk audit entry
    await supabase.from("audit_logs").insert({
      actor_id: adminId,
      actor_email: adminEmail,
      action: "admin_bulk_create_order",
      entity_type: "orders",
      entity_id: null,
      metadata: {
        network, supplier_code, user_id,
        raw_pasted_count: parsed.length,
        valid_count: valid.length,
        created_order_ids: createdOrderIds,
        dispatched_count: results.filter((r) => r.dispatched).length,
        failed_count: results.filter((r) => !r.dispatched).length,
      },
    });

    return json({
      success: true,
      total_lines: parsed.length,
      valid_lines: valid.length,
      created_count: results.filter((r) => r.created).length,
      dispatched_count: results.filter((r) => r.dispatched).length,
      failed_count: results.filter((r) => !r.dispatched).length,
      results,
    });
  } catch (err) {
    console.error("[admin-bulk-create-order] Error:", err);
    return json({ error: String(err) }, 500);
  }
});
