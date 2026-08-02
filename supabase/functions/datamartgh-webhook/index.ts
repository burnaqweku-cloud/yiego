import { verifyDataMartGHSignature } from "../_shared/datamartgh.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";
import { createSupabaseAdmin } from "../_shared/supabaseAdmin.ts";

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
    const { error } = await supabase.from("webhook_events").upsert(
      {
        source: "datamartgh",
        event_type: eventType,
        external_reference: externalReference,
        signature,
        payload,
        processed_at: new Date().toISOString(),
      },
      { onConflict: "source,event_type,external_reference" },
    );

    if (error) {
      return jsonResponse({ error: error.message }, { status: 500 });
    }

    return jsonResponse({ received: true });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
