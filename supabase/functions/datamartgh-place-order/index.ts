import { callDataMartGH, requireInternalSecret } from "../_shared/datamartgh.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    if (!requireInternalSecret(req)) {
      return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { phoneNumber, network, capacity, ref } = body;

    if (!phoneNumber || !network || !capacity) {
      return jsonResponse({ error: "phoneNumber, network, and capacity are required" }, { status: 400 });
    }

    const idempotencyKey = req.headers.get("X-Idempotency-Key") ?? crypto.randomUUID();
    const result = await callDataMartGH("/purchase", {
      method: "POST",
      headers: {
        "X-Idempotency-Key": idempotencyKey,
      },
      body: JSON.stringify({
        phoneNumber,
        network,
        capacity,
        gateway: "wallet",
        ...(ref ? { ref } : {}),
      }),
    });

    return jsonResponse(
      {
        idempotencyKey,
        supplier: result.payload,
      },
      { status: result.status },
    );
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
