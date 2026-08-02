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

    if (!body.phoneNumber || typeof body.phoneNumber !== "string") {
      return jsonResponse({ error: "phoneNumber is required" }, { status: 400 });
    }

    const result = await callDataMartGH("/verify-number", {
      method: "POST",
      body: JSON.stringify({ phoneNumber: body.phoneNumber }),
    });

    return jsonResponse(result.payload, { status: result.status });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
