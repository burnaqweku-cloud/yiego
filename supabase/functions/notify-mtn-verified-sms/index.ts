import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";
import { requireCronSecret } from "../_shared/internal.ts";
import { sendSms } from "../_shared/sms.ts";

/* One text per order, sent once: the order's MTN number has passed first-time
   verification. Wording is the short, plain-English version the owner approved —
   it names the bundle the customer bought, the day they bought it, and says
   clearly that from now on every order they purchase arrives without a hold.
   Only the scheduled-job secret can run this. */

const EVENT = "notification.verified_sms_sent";
const LINK = "https://datayego.com";

/** "16th October" in Africa/Accra. */
function niceDate(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 0);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Accra",
    day: "numeric",
    month: "long",
  }).formatToParts(d);
  const day = Number(parts.find((p) => p.type === "day")?.value ?? "1");
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const last2 = day % 100;
  const suffix = last2 >= 11 && last2 <= 13 ? "th" : day % 10 === 1 ? "st" : day % 10 === 2 ? "nd" : day % 10 === 3 ? "rd" : "th";
  return `${day}${suffix} ${month}`;
}

function sizeText(capacityGb: number | null, capacityMb: number | null): string | null {
  if (capacityGb && capacityGb >= 1) return `${Number.isInteger(capacityGb) ? capacityGb : capacityGb.toFixed(1)}GB`;
  if (capacityMb && capacityMb >= 1) return `${capacityMb}MB`;
  return null;
}

function buildMessage(size: string, bought: string, delivered: boolean): string {
  return `Congratulations, your MTN number is verified. Every order you purchase from now on goes through instantly. Your ${size} from ${bought} is ${delivered ? "delivered" : "on its way"}. Buy your cheap bundles at ${LINK}`;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const supabase = createSupabaseAdmin();
    const denied = await requireCronSecret(req, supabase);
    if (denied) return denied;
    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dryRun === true;

    /* Test mode: send the approved wording with sample details to one number. */
    if (typeof body?.test === "string" && body.test.trim()) {
      const message = buildMessage("2GB", "16th October", true);
      if (dryRun) return jsonResponse({ dryRun: true, to: body.test.trim(), message, length: message.length });
      const r = await sendSms({ to: body.test.trim(), message, metadata: { purpose: "verified_test" } });
      return jsonResponse(r.ok ? { ok: true, jobId: r.jobId, remaining: r.remaining, message, length: message.length } : { ok: false, reason: r.reason, status: r.status }, { status: r.ok ? 200 : 502 });
    }

    /* Real mode: everyone whose verification email went out and who has no text yet. */
    const { data: emailed, error: eErr } = await supabase.from("order_events")
      .select("order_id").eq("event_type", "notification.verified_email_sent");
    if (eErr) throw new Error(eErr.message);
    const ids = [...new Set((emailed ?? []).map((r: { order_id: string }) => r.order_id))];
    if (!ids.length) return jsonResponse({ sent: 0, skipped: [], note: "nobody to text yet" });

    const { data: orders, error: oErr } = await supabase.from("orders")
      .select("id, order_reference, recipient_phone, status, payment_status, created_at, product_id")
      .in("id", ids);
    if (oErr) throw new Error(oErr.message);

    const sent: string[] = [];
    const skipped: Array<{ ref: string; reason: string }> = [];
    for (const o of orders ?? []) {
      const { data: already } = await supabase.from("order_events").select("id").eq("order_id", o.id).eq("event_type", EVENT).limit(1).maybeSingle();
      if (already) { skipped.push({ ref: o.order_reference, reason: "already_sent" }); continue; }
      if (o.payment_status !== "succeeded") { skipped.push({ ref: o.order_reference, reason: "unpaid" }); continue; }
      if (!o.recipient_phone) { skipped.push({ ref: o.order_reference, reason: "no_number" }); continue; }

      const { data: dp } = await supabase.from("data_products").select("capacity_gb, capacity_mb").eq("id", o.product_id).maybeSingle();
      const size = sizeText(dp?.capacity_gb ?? null, dp?.capacity_mb ?? null);
      if (!size) { skipped.push({ ref: o.order_reference, reason: "no_bundle_size" }); continue; }

      const message = buildMessage(size, niceDate(o.created_at), o.status === "delivered");
      if (dryRun) { sent.push(o.order_reference); continue; }

      const r = await sendSms({ to: o.recipient_phone, message, metadata: { order_reference: o.order_reference, purpose: "mtn_verified" } });
      if (r.ok) {
        await supabase.from("order_events").insert({ order_id: o.id, event_type: EVENT, message: "Number verified text sent", metadata: { to: o.recipient_phone, job_id: r.jobId ?? null, remaining: r.remaining ?? null } });
        sent.push(o.order_reference);
      } else skipped.push({ ref: o.order_reference, reason: r.skipped ? r.reason : `send_failed_${r.status}` });
      await new Promise((res) => setTimeout(res, 400));
    }
    return jsonResponse({ dryRun, sent: sent.length, sentRefs: sent, skipped });
  } catch (e) {
    return jsonResponse({ error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
  }
});
