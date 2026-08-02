export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-yiego-internal-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

export function handleOptions(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  return null;
}
