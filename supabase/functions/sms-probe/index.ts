import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const key = Deno.env.get('VYNFY_API_KEY')
  if (!key) return new Response(JSON.stringify({ error: 'no_vynfy_key' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

  const base = 'https://sms.vynfy.com/api/v1/send'
  const results: Record<string, unknown> = {}

  // Sender validation probe: empty recipients => no SMS is sent, but we see which error comes first (sender vs recipients)
  for (const sender of ['DataYego', 'YieGo', 'DATAYEGO', 'datayego']) {
    try {
      const res = await fetch(base, {
        method: 'POST',
        headers: { 'X-API-Key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sender, recipients: [], message: 'probe' }),
      })
      const text = await res.text()
      results[sender] = { status: res.status, body: text.slice(0, 400) }
    } catch (e) {
      results[sender] = { error: String(e) }
    }
  }

  return new Response(JSON.stringify(results, null, 2), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
})
