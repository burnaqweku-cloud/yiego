// One-time maintenance endpoint, already run and deliberately neutered. It
// stays deployed (and committed here) so the live project and this repo match;
// delete the deployed function and this file together if it is ever removed.
Deno.serve(() => new Response(JSON.stringify({ error: "This one-time maintenance endpoint is disabled." }), { status: 410, headers: { "Content-Type": "application/json" } }));