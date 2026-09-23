import { handleOptions, jsonResponse } from "../_shared/cors.ts";

/* Retired. This let anyone force a supplier status check on any order by its
   reference. Order status is now synced only by the scheduled jobs. */
Deno.serve((req) => {
  const options = handleOptions(req);
  if (options) return options;
  return jsonResponse({ error: "This endpoint has been retired." }, { status: 410 });
});
