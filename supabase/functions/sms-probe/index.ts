import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const key = Deno.env.get('VYNFY_API_KEY')
  if (!key) return new Response(JSON.stringify({ error: 'no_vynfy_key' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const base = 'https://sms.vynfy.com'
  const results: Record<string, unknown> = {}

  // Read-only probes with the key
  for (const p of ['/api/v1/balance', '/api/v1/sender-ids', '/api/v1/senders', '/api/v1/sender', '/api/v1/me']) {
    try {
      const res = await fetch(`${base}${p}`, { headers: { 'X-API-Key': key, 'Accept': 'application/json' } })
      const text = await res.text()
      results[`GET ${p}`] = { status: res.status, body: text.slice(0, 500) }
    } catch (e) {
      results[`GET ${p}`] = { error: String(e) }
    }
  }

  return new Response(JSON.stringify(results, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
