import { callDataMartGH, requireInternalSecret } from "../_shared/datamartgh.ts";
import { handleOptions, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, { status: 405 });
  }

  try {
    if (!requireInternalSecret(req)) {
      return jsonResponse({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const reference = url.searchParams.get("reference");

    if (!reference) {
      return jsonResponse({ error: "reference is required" }, { status: 400 });
    }

    const result = await callDataMartGH(`/order-status/${encodeURIComponent(reference)}`);

    return jsonResponse(result.payload, { status: result.status });
  } catch (error) {
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
});
