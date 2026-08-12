import { verifyDataMartGHSignature } from "../_shared/datamartgh.ts";
import { applySupplierStatusToOrder } from "../_shared/fulfillment.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

/** Finds the order a supplier callback refers to. DataMartGH echoes our
 * reference in some payloads and sends its own in others, so try both. */
async function findOrderForWebhook(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  candidates: Array<string | null | undefined>,
) {
  const columns = "id, order_reference, status, payment_status, supplier_status";
  for (const candidate of candidates) {
    if (!candidate) continue;
    const bySupplierRef = await supabase
      .from("orders")
      .select(columns)
      .eq("supplier_order_reference", candidate)
      .maybeSingle();
    if (bySupplierRef.data) return bySupplierRef.data;

    const byOurRef = await supabase
      .from("orders")
      .select(columns)
      .eq("order_reference", candidate)
      .maybeSingle();
    if (byOurRef.data) return byOurRef.data;
  }
  return null;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("X-DataMart-Signature");
  const eventHeader = req.headers.get("X-DataMart-Event");

  try {
    const isValid = await verifyDataMartGHSignature(rawBody, signature);

    if (!isValid) {
      return jsonResponse({ error: "Invalid signature" }, { status: 401 });
    }

    const payload = JSON.parse(rawBody);
    const eventType = payload.event ?? eventHeader ?? "unknown";
    const externalReference = payload.data?.orderReference ?? payload.data?.transactionId ?? null;

    const supabase = createSupabaseAdmin();

    // The supplier's status lives in the payload data; the envelope-level
    // payload.status is a request outcome, not an order state, so ignore it.
    const supplierStatus = payload.data?.orderStatus ?? payload.data?.status ?? undefined;

    let processingError: string | null = null;
    let applied: Awaited<ReturnType<typeof applySupplierStatusToOrder>> | null = null;

    if (typeof supplierStatus === "string" && supplierStatus) {
      const order = await findOrderForWebhook(supabase, [
        externalReference,
        payload.data?.ref,
        payload.data?.reference,
      ]);

      if (order) {
        applied = await applySupplierStatusToOrder(supabase, order, supplierStatus, "webhook");
      } else {
        processingError = "no_matching_order";
      }
    } else {
      processingError = "no_supplier_status_in_payload";
    }

    const { error } = await supabase.from("webhook_events").upsert(
      {
        source: "datamartgh",
        event_type: eventType,
        external_reference: externalReference,
        signature,
        payload,
        processed_at: new Date().toISOString(),
        processing_error: processingError,
      },
      { onConflict: "source,event_type,external_reference" },
    );

    if (error) {
      return jsonResponse({ error: error.message }, { status: 500 });
    }

    return jsonResponse({ received: true, applied: applied?.changed ?? false });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
