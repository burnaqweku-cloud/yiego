import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import { sendSms, smsCallbackUrl, toGhanaMsisdn } from "../_shared/sms.ts";
import { buildOrderSms, eligibleSms, SAMPLE_ORDER, type OrderSmsKind, type OrderSmsRecord } from "../_shared/orderSmsTemplates.ts";
import { loadSmsSettings, loadSmsTemplates, recordSmsCredits } from "../_shared/smsConfig.ts";
import { z } from "npm:zod@3.25.76";

/* test: one of the approved test numbers (Admin → SMS → Settings). */
const Input = z.object({ dryRun: z.boolean().optional(), test: z.string().regex(/^\+233\d{9}$/).optional(), activate: z.boolean().optional() }).strict();
const sample: OrderSmsRecord = SAMPLE_ORDER;

Deno.serve(async req => {
  const options = handleOptions(req); if (options) return options;
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  try {
    const db = createSupabaseAdmin();
    const denied = await requireCronSecret(req, db); if (denied) return denied;
    const parsed = Input.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return jsonResponse({ error: "Invalid request" }, { status: 400 });
    const input = parsed.data;
    const [settings, templates] = await Promise.all([loadSmsSettings(db), loadSmsTemplates(db)]);
    if (input.test) {
      if (!settings.testNumbers.includes(input.test)) return jsonResponse({ error: "Not an approved test number" }, { status: 400 });
      const message = buildOrderSms(sample, "verified", templates);
      if (input.dryRun) return jsonResponse({ sample: true, message, length: message.length, segments: Math.ceil(message.length / 153) });
      const result = await sendSms({ to: input.test, message, sender: settings.senderId, metadata: { purpose: "verified_test_sample" } });
      if (!result.ok) return jsonResponse({ ok: false, reason: result.reason, status: result.status }, { status: 502 });
      await recordSmsCredits(db, result.remaining);
      const { error } = await db.from("order_sms_control").update({ test_passed_at: new Date().toISOString() }).eq("id", true);
      if (error) throw new Error("Cannot record test result");
      // Provider acceptance is not proof of handset delivery. Activate only after owner confirms receipt.
      return jsonResponse({ ok: true, sample: true, providerAccepted: true, customerSendingEnabled: false });
    }
    if (input.activate && !input.dryRun) {
      const { data, error } = await db.rpc("activate_order_sms");
      if (error || !data) return jsonResponse({ error: "Successful test required" }, { status: 409 });
    }
    const { data: control, error: controlError } = await db.from("order_sms_control").select("enabled").eq("id", true).single();
    if (controlError) throw new Error("SMS control unavailable");
    if (input.dryRun) return jsonResponse({ enabled: control.enabled, sample: true, templates: {
      purchase: buildOrderSms(sample, "purchase", templates), delivered: buildOrderSms(sample, "delivered", templates),
      verifiedDelivered: buildOrderSms(sample, "verified", templates), verifiedOnWay: buildOrderSms({ ...sample, status: "processing" }, "verified", templates),
    } });
    if (!control.enabled) return jsonResponse({ enabled: false, sent: 0 });
    const seeded = await db.rpc("seed_verified_order_sms");
    if (seeded.error) throw new Error("Cannot queue verification messages");
    const { data: jobs, error: claimError } = await db.rpc("claim_order_sms", { batch_size: 20 });
    if (claimError) throw new Error("Cannot claim SMS queue");
    const callbackUrl = await smsCallbackUrl(db);
    let sent = 0, skipped = 0, failed = 0;
    for (const job of jobs ?? []) {
      let message: string | null = null;
      const finish = async (status: string, reason: string | null, jobId?: string) => {
        const { error } = await db.from("order_sms_outbox").update({ status, reason, provider_job_id: jobId ?? null, message, sent_at: status === "sent" ? new Date().toISOString() : null }).eq("id", job.id).eq("claim_token", job.claim_token).eq("status", "sending");
        if (error) throw new Error("Cannot save SMS result");
      };
      const { data: o, error } = await db.from("orders").select("order_reference,created_at,status,payment_status,recipient_phone,product_id,network_id,agent_id,supplier_order_reference,supplier_purchase_id,admin_resolution_status").eq("id", job.order_id).maybeSingle();
      if (error) { await finish("failed", "order_read_failed"); failed++; continue; }
      if (!o) { await finish("skipped", "order_missing"); skipped++; continue; }
      const [{ data: product, error: productError }, { data: network, error: networkError }, { data: agent, error: agentError }] = await Promise.all([
        db.from("data_products").select("capacity_gb,capacity_mb").eq("id", o.product_id).maybeSingle(),
        db.from("networks").select("name").eq("id", o.network_id).maybeSingle(),
        o.agent_id ? db.from("agents").select("slug,store_name,custom_domain,custom_domain_status").eq("id", o.agent_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      const record: OrderSmsRecord = { ...o, capacity_gb: product?.capacity_gb ?? null, capacity_mb: product?.capacity_mb ?? null, network_name: network?.name ?? "", agent_slug: agent?.slug ?? null, store_name: agent?.store_name ?? null, store_domain: agent?.custom_domain_status === "active" ? agent?.custom_domain ?? null : null };
      if (productError || networkError || agentError || (o.agent_id && !agent?.slug)) { await finish("failed", "details_read_failed"); failed++; continue; }
      const kindOn = job.kind === "purchase" ? settings.purchaseEnabled : job.kind === "delivered" ? settings.deliveredEnabled : settings.verifiedEnabled;
      if (!kindOn || (o.agent_id && !settings.storeOrdersEnabled)) { await finish("skipped", "switched_off"); skipped++; continue; }
      if (!eligibleSms(record, job.kind as OrderSmsKind, settings.onWayMaxHours) || !toGhanaMsisdn(record.recipient_phone)) { await finish("skipped", "ineligible_order"); skipped++; continue; }
      if (job.kind === "delivered") {
        const { data: verified, error: dedupeError } = await db.from("order_sms_outbox").select("id").eq("order_id", job.order_id).eq("kind", "verified").eq("status", "sent").eq("reason", "verified_delivered").maybeSingle();
        if (dedupeError) { await finish("failed", "dedupe_read_failed"); failed++; continue; }
        if (verified) { await finish("skipped", "delivery_already_in_verification_sms"); skipped++; continue; }
      }
      try { message = buildOrderSms(record, job.kind as OrderSmsKind, templates); } catch { await finish("skipped", "invalid_order_details"); skipped++; continue; }
      const result = await sendSms({ to: record.recipient_phone, message, sender: settings.senderId, metadata: { notification_id: job.id, purpose: job.kind }, callbackUrl });
      if (result.ok) {
        await recordSmsCredits(db, result.remaining);
        await finish("sent", job.kind === "verified" ? (record.status === "delivered" ? "verified_delivered" : "verified_on_way") : null, result.jobId);
        await db.from("order_events").insert({ order_id: job.order_id, event_type: job.kind === "verified" ? "notification.verified_sms_sent" : `notification.${job.kind}_sms_sent`, message: "SMS accepted by provider", metadata: { notification_id: job.id, job_id: result.jobId ?? null } });
        sent++;
      } else { await finish(result.reason === "delivery_unknown" ? "uncertain" : "failed", result.reason); failed++; }
    }
    return jsonResponse({ enabled: true, sent, skipped, failed });
  } catch { return jsonResponse({ error: "SMS processing unavailable" }, { status: 500 }); }
});