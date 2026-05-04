// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ ok: false, error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userData?.user) return json({ ok: false, error: "Unauthorized" }, 401);
    const adminId = userData.user.id;
    const adminEmail = userData.user.email || "";

    const { data: roleData } = await supabase
      .from("user_roles").select("role").eq("user_id", adminId).eq("role", "admin");
    if (!roleData || roleData.length === 0) return json({ ok: false, error: "Admin role required" }, 403);

    const body = await req.json().catch(() => ({}));
    const { hours = 24, test_only = false } = body;

    const paystackKey = Deno.env.get("PAYSTACK_SECRET_KEY");
    if (!paystackKey) return json({ ok: false, error: "PAYSTACK_SECRET_KEY not set" }, 500);

    const rangeLabel = `last_${hours}h`;
    const { data: runRow } = await supabase.from("paystack_sync_runs").insert({
      status: "running",
      range: rangeLabel,
      triggered_by: adminId,
    }).select("id").single();
    const runId = runRow?.id || null;

    const fromDate = new Date(Date.now() - hours * 60 * 60 * 1000);
    const from = fromDate.toISOString();

    // TEST ONLY MODE
    if (test_only) {
      const url = `https://api.paystack.co/transaction?perPage=10&page=1&from=${encodeURIComponent(from)}`;
      console.log("[test_pull] Calling:", url);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${paystackKey}` } });
      const status = res.status;
      const resBody = await res.json().catch(() => null);
      const records = resBody?.data?.length || 0;
      const sampleRefs = (resBody?.data || []).slice(0, 3).map((t: any) => t.reference);

      if (runId) {
        await supabase.from("paystack_sync_runs").update({
          ended_at: new Date().toISOString(),
          status: status === 200 ? "test_success" : "test_error",
          fetched_count: records,
          debug: { http_status: status, records_returned: records, sample_refs: sampleRefs, message: resBody?.message },
        }).eq("id", runId);
      }

      return json({ ok: status === 200, test: true, http_status: status, records_returned: records, sample_refs: sampleRefs, run_id: runId });
    }

    // FULL SYNC — batch upserts for speed
    let page = 1;
    let totalFetched = 0;
    let totalUpserted = 0;
    let totalExisted = 0;
    let hasMore = true;
    const errors: { ref: string; msg: string }[] = [];
    const debugInfo: Record<string, unknown> = { pages_fetched: 0, first_ref: null, last_ref: null, sample_refs: [] };

    while (hasMore && page <= 100) {
      const url = `https://api.paystack.co/transaction?perPage=100&page=${page}&from=${encodeURIComponent(from)}`;
      console.log(`[sync] Fetching page ${page}`);
      const res = await fetch(url, { headers: { Authorization: `Bearer ${paystackKey}` } });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[sync] Paystack API error page ${page}: ${res.status}`, errText);
        errors.push({ ref: `page_${page}`, msg: `HTTP ${res.status}: ${errText.slice(0, 200)}` });
        break;
      }

      const data = await res.json();
      const transactions = data.data || [];
      totalFetched += transactions.length;

      if (transactions.length === 0) { hasMore = false; break; }

      debugInfo.pages_fetched = page;
      if (!debugInfo.first_ref && transactions.length > 0) debugInfo.first_ref = transactions[0].reference;
      debugInfo.last_ref = transactions[transactions.length - 1].reference;
      if ((debugInfo.sample_refs as string[]).length < 3) {
        (debugInfo.sample_refs as string[]).push(...transactions.slice(0, 3).map((t: any) => t.reference));
        debugInfo.sample_refs = (debugInfo.sample_refs as string[]).slice(0, 3);
      }

      // Batch upsert — process in chunks of 50
      const records = transactions.map((tx: any) => extractTransactionRecord(tx));
      for (let i = 0; i < records.length; i += 50) {
        const batch = records.slice(i, i + 50);
        const { error, count } = await supabase
          .from("paystack_transactions")
          .upsert(batch, { onConflict: "reference", ignoreDuplicates: false })
          .select("reference", { count: "exact", head: true });

        if (error) {
          console.error(`[sync] Batch upsert error page ${page} chunk ${i}:`, error.message);
          // Fall back to individual inserts for this batch
          for (const rec of batch) {
            const { error: singleErr } = await supabase
              .from("paystack_transactions")
              .upsert(rec, { onConflict: "reference" });
            if (singleErr) {
              if (singleErr.code === "23505") { totalExisted++; }
              else { errors.push({ ref: rec.reference, msg: singleErr.message }); }
            } else { totalUpserted++; }
          }
        } else {
          totalUpserted += batch.length;
        }
      }

      const meta = data.meta;
      if (meta && meta.page < meta.pageCount) { page++; } else { hasMore = false; }
    }

    // Update sync run
    if (runId) {
      await supabase.from("paystack_sync_runs").update({
        ended_at: new Date().toISOString(),
        status: errors.length > 0 ? "partial_error" : "success",
        fetched_count: totalFetched,
        upserted_count: totalUpserted,
        already_existed_count: totalExisted,
        errors: errors.length > 0 ? errors : [],
        debug: debugInfo,
      }).eq("id", runId);
    }

    // Auto-link payment intents to transactions & update intent statuses
    let intentsLinked = 0;
    try {
      intentsLinked = await linkPaymentIntents(supabase);
    } catch (intentErr) {
      console.error("[sync] Intent linking error (non-fatal):", intentErr);
    }

    // Reconciliation check (limit to avoid timeout)
    let reconResults = { casesCreated: 0, casesUpdated: 0, checked: 0 };
    try {
      reconResults = await runReconciliationCheck(supabase);
    } catch (reconErr) {
      console.error("[sync] Reconciliation error (non-fatal):", reconErr);
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      actor_id: adminId,
      actor_email: adminEmail,
      action: "paystack_sync",
      entity_type: "paystack_transactions",
      metadata: { hours, totalFetched, totalUpserted, totalExisted, errors: errors.length, reconResults, intentsLinked, run_id: runId },
    });

    console.log(`[sync] Done: fetched=${totalFetched} upserted=${totalUpserted} existed=${totalExisted} errors=${errors.length} intentsLinked=${intentsLinked}`);

    return json({
      ok: true,
      fetched: totalFetched,
      upserted: totalUpserted,
      existed: totalExisted,
      errors: errors.length,
      intents_linked: intentsLinked,
      reconciliation: reconResults,
      run_id: runId,
    });
  } catch (err) {
    console.error("[sync] Error:", err);
    return json({ ok: false, error: String(err) }, 500);
  }
});

function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  let phone = raw.replace(/\s+/g, "").trim();
  if (phone.startsWith("+233")) phone = "0" + phone.slice(4);
  if (phone.startsWith("233") && phone.length >= 12) phone = "0" + phone.slice(3);
  return phone || null;
}

/**
 * Extract ONLY the trusted payer phone from Paystack payload.
 * Do NOT use recipient numbers, linked order phones, or user profile phones.
 * Only Paystack-origin fields that represent the actual payer.
 */
function extractPayerPhone(tx: Record<string, unknown>): string | null {
  const customer = tx.customer as Record<string, unknown> | null;
  const authorization = tx.authorization as Record<string, unknown> | null;

  // Trusted Paystack payer phone sources ONLY
  const candidates: (string | null | undefined)[] = [
    customer?.phone as string,
    authorization?.mobile_number as string,
  ];

  for (const c of candidates) {
    const normalized = normalizePhone(c);
    if (normalized && normalized.length === 10 && normalized.startsWith('0')) return normalized;
  }

  return null;
}

// backfillPhonesFromLinkedRecords removed — customer_phone is now strictly Paystack-origin only

function extractTransactionRecord(tx: Record<string, unknown>) {
  const customer = tx.customer as Record<string, unknown> | null;
  const authorization = tx.authorization as Record<string, unknown> | null;
  const metadata = tx.metadata as Record<string, unknown> | null;

  let purpose: string | null = null;
  if (metadata) {
    purpose = (metadata.purpose as string) || (metadata.payment_for as string) || (metadata.type as string) || null;
  }

  const customerPhone = extractPayerPhone(tx);

  return {
    reference: tx.reference as string,
    paystack_id: tx.id ? Number(tx.id) : null,
    status: tx.status as string,
    channel: (tx.channel as string) || null,
    currency: (tx.currency as string) || "GHS",
    amount: Number(tx.amount) || 0,
    fees: tx.fees != null ? Number(tx.fees) : null,
    paid_at: (tx.paid_at as string) || (tx.paidAt as string) || null,
    customer_email: (customer?.email as string) || null,
    customer_phone: customerPhone,
    customer_name: customer?.first_name ? `${customer.first_name} ${customer.last_name || ""}`.trim() : null,
    authorization_brand: (authorization?.brand as string) || null,
    authorization_last4: (authorization?.last4 as string) || null,
    ip_address: (tx.ip_address as string) || null,
    metadata: metadata || {},
    raw: tx,
    purpose,
    linked_user_id: (metadata?.user_id as string) || null,
    linked_order_id: (metadata?.order_id as string) || (metadata?.linked_order_id as string) || null,
    linked_deposit_id: (metadata?.deposit_id as string) || (metadata?.linked_wallet_txn_id as string) || null,
    linked_agent_subscription_id: (metadata?.subscription_id as string) || null,
  };
}

/**
 * Link payment intents to transactions and update their status.
 * For successful payments where order_created=false, flag for recovery.
 */
async function linkPaymentIntents(supabase: any): Promise<number> {
  // Find pending intents that have matching successful transactions
  const { data: pendingIntents } = await supabase
    .from("payment_intents")
    .select("id, paystack_reference, order_created, order_id")
    .eq("payment_status", "pending")
    .limit(100);

  if (!pendingIntents || pendingIntents.length === 0) return 0;

  let linked = 0;
  for (const intent of pendingIntents) {
    const { data: tx } = await supabase
      .from("paystack_transactions")
      .select("status, reference")
      .eq("reference", intent.paystack_reference)
      .maybeSingle();

    if (!tx) continue;

    // Update intent payment_status based on transaction status
    const newStatus = tx.status === "success" ? "success" : tx.status === "failed" ? "failed" : "pending";
    if (newStatus === "pending") continue;

    // Check if order was created for this reference
    let orderCreated = intent.order_created;
    let orderId = intent.order_id;

    if (newStatus === "success" && !orderCreated) {
      // Check orders table
      const { data: order } = await supabase
        .from("orders")
        .select("order_id")
        .eq("paystack_reference", intent.paystack_reference)
        .maybeSingle();

      if (order) {
        orderCreated = true;
        orderId = order.order_id;
      } else {
        // Check agent_orders table
        const { data: agentOrder } = await supabase
          .from("agent_orders")
          .select("order_id")
          .eq("paystack_reference", intent.paystack_reference)
          .maybeSingle();

        if (agentOrder) {
          orderCreated = true;
          orderId = agentOrder.order_id;
        }
      }
    }

    await supabase
      .from("payment_intents")
      .update({ payment_status: newStatus, order_created: orderCreated, order_id: orderId })
      .eq("id", intent.id);

    linked++;
  }

  return linked;
}

async function runReconciliationCheck(supabase: any) {
  let casesCreated = 0;
  let casesUpdated = 0;

  const { data: unreviewedTxns } = await supabase
    .from("paystack_transactions")
    .select("*")
    .eq("status", "success")
    .eq("reconciliation_status", "unreviewed")
    .limit(50); // Limit to prevent timeout

  if (!unreviewedTxns || unreviewedTxns.length === 0) {
    return { casesCreated: 0, casesUpdated: 0, checked: 0 };
  }

  for (const tx of unreviewedTxns) {
    const result = await checkTransaction(supabase, tx);
    if (result === "flagged") casesCreated++;
    if (result === "resolved") casesUpdated++;
  }

  return { casesCreated, casesUpdated, checked: unreviewedTxns.length };
}

async function checkTransaction(supabase: any, tx: Record<string, unknown>): Promise<string> {
  const reference = tx.reference as string;
  const purpose = tx.purpose as string;
  const amountPesewas = Number(tx.amount) || 0;

  const { data: payment } = await supabase
    .from("paystack_payments")
    .select("*")
    .eq("reference", reference)
    .maybeSingle();

  if (!payment) {
    await supabase.from("paystack_transactions").update({
      reconciliation_status: "flagged",
      reconciliation_reason: "PAYMENT_RECORD_MISSING",
      last_checked_at: new Date().toISOString(),
    }).eq("reference", reference);
    return "flagged";
  }

  if (purpose === "order" || payment.purpose === "order") {
    const orderId = payment.linked_order_id as string;
    if (!orderId) {
      await flagTransaction(supabase, reference, "ORDER_MISSING", "No order linked to payment");
      return "flagged";
    }
    const { data: order } = await supabase.from("orders").select("status, supplier_status").eq("order_id", orderId).maybeSingle();
    if (!order) {
      await flagTransaction(supabase, reference, "ORDER_MISSING", `Order ${orderId} not found`);
      return "flagged";
    }
    if (order.supplier_status === "failed" || (!order.supplier_status && order.status === "Paid")) {
      await flagTransaction(supabase, reference, "ORDER_NOT_SENT", `Order ${orderId} not sent to supplier`);
      return "flagged";
    }
  }

  if (purpose === "deposit" || payment.purpose === "deposit") {
    const walletTxnId = payment.linked_wallet_txn_id as string;
    if (walletTxnId) {
      const { data: walletTxn } = await supabase.from("wallet_transactions").select("status").eq("id", walletTxnId).maybeSingle();
      if (!walletTxn || walletTxn.status !== "confirmed") {
        await flagTransaction(supabase, reference, "DEPOSIT_MISSING", "Wallet not credited");
        return "flagged";
      }
    }
  }

  if (purpose === "agent_subscription" || payment.purpose === "agent_subscription") {
    const meta = tx.metadata as Record<string, unknown> | null;
    const agentId = meta?.agent_id as string;
    if (agentId) {
      const { data: agent } = await supabase.from("agents").select("status, activation_paid").eq("id", agentId).maybeSingle();
      if (!agent || !agent.activation_paid) {
        await flagTransaction(supabase, reference, "SUBSCRIPTION_MISSING", "Agent subscription not activated");
        return "flagged";
      }
    }
  }

  if (payment && amountPesewas > 0) {
    const expectedPesewas = Math.round((Number(payment.amount_ghs) + Number(payment.processing_fee || 0)) * 100);
    if (Math.abs(amountPesewas - expectedPesewas) > 100) {
      await flagTransaction(supabase, reference, "AMOUNT_MISMATCH", `Expected ${expectedPesewas} pesewas, got ${amountPesewas}`);
      return "flagged";
    }
  }

  await supabase.from("paystack_transactions").update({
    reconciliation_status: "resolved",
    last_checked_at: new Date().toISOString(),
  }).eq("reference", reference);

  return "resolved";
}

async function flagTransaction(supabase: any, reference: string, reason: string, detail: string) {
  await supabase.from("paystack_transactions").update({
    reconciliation_status: "flagged",
    reconciliation_reason: reason,
    last_checked_at: new Date().toISOString(),
  }).eq("reference", reference);

  await supabase.from("payment_reconciliation_cases").insert({
    paystack_reference: reference,
    reason,
    severity: reason === "AMOUNT_MISMATCH" ? "medium" : "high",
    status: "open",
    amount: 0,
    metadata: { detail, source: "sync_check" },
  }).then(({ error }) => {
    if (error && error.code !== "23505") {
      console.error(`[recon] Failed to create case for ${reference}:`, error.message);
    }
  });
}
