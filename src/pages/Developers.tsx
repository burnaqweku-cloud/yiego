import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Copy, Download, KeyRound, Wallet, Zap } from "lucide-react";
import Band from "@/components/layout/Band";
import Seo from "@/components/seo/Seo";
import { API_BASE_URL } from "@/lib/apiAccess";

/* datayego.com/developers: the API guide (owner, 21 Nov 2026). Plain words first, then copy-paste examples in the
   languages Ghana sellers use most (PHP sites, JavaScript), then every status and error a seller can meet. */

type Lang = "curl" | "php" | "js";
const ORDER_EXAMPLES: Record<Lang, string> = {
  curl: `curl -X POST ${API_BASE_URL}/orders \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"bundle": "mtn-2", "phone": "0241234567", "reference": "ORDER-1001"}'`,
  php: `<?php
$ch = curl_init("${API_BASE_URL}/orders");
curl_setopt_array($ch, [
  CURLOPT_POST => true,
  CURLOPT_RETURNTRANSFER => true,
  CURLOPT_HTTPHEADER => [
    "Authorization: Bearer " . getenv("DATAYEGO_KEY"),
    "Content-Type: application/json",
  ],
  CURLOPT_POSTFIELDS => json_encode([
    "bundle" => "mtn-2",
    "phone" => "0241234567",
    "reference" => "ORDER-1001",
  ]),
]);
$order = json_decode(curl_exec($ch), true);
echo $order["order"]["reference"]; // YG-61F041CF38`,
  js: `const res = await fetch("${API_BASE_URL}/orders", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${process.env.DATAYEGO_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ bundle: "mtn-2", phone: "0241234567", reference: "ORDER-1001" }),
});
const { order } = await res.json();
console.log(order.reference, order.status); // YG-61F041CF38 queued`,
};

const ORDER_REPLY = `{
  "order": {
    "reference": "YG-61F041CF38",
    "your_reference": "ORDER-1001",
    "status": "queued",
    "message": "Waiting its turn to be sent.",
    "bundle": { "id": "mtn-2", "network": "MTN", "size_gb": 2 },
    "phone": "0241234567",
    "price": 8.50,
    "currency": "GHS",
    "created_at": "2026-11-21T10:18:22Z",
    "delivered_at": null
  },
  "balance": 41.50
}`;

const ENDPOINTS: { method: "GET" | "POST"; path: string; what: string }[] = [
  { method: "GET", path: "/balance", what: "Your wallet balance." },
  { method: "GET", path: "/bundles", what: "Every bundle you can buy, your price, and whether it is available now." },
  { method: "POST", path: "/orders", what: "Buy a bundle for a number. Paid from your wallet." },
  { method: "GET", path: "/orders/{reference}", what: "One order, by our reference or yours." },
  { method: "GET", path: "/orders", what: "Your orders, newest first. ?limit=1-100, ?status=delivered, ?before=<created_at> for the next page." },
  { method: "GET", path: "/status", what: "No key needed: is the API open right now." },
];

type HookLang = "php" | "js";
const VERIFY: Record<HookLang, string> = {
  php: `<?php
$secret  = getenv("DATAYEGO_WEBHOOK_SECRET");          // whsec_...
$payload = file_get_contents("php://input");           // the raw body
$header  = $_SERVER["HTTP_X_DATAYEGO_SIGNATURE"] ?? "";  // t=...,v1=...
parse_str(str_replace(",", "&", $header), $sig);

$expected = hash_hmac("sha256", ($sig["t"] ?? "") . "." . $payload, $secret);
if (!hash_equals($expected, $sig["v1"] ?? "") || abs(time() - (int)($sig["t"] ?? 0)) > 300) {
  http_response_code(400);
  exit;
}

$event = json_decode($payload, true);
if ($event["type"] === "order.delivered") {
  $yourRef = $event["data"]["order"]["your_reference"];
  // mark order $yourRef as delivered on your site
}
http_response_code(200);`,
  js: `import crypto from "node:crypto";
import express from "express";

const app = express();
app.post("/datayego-webhook", express.raw({ type: "application/json" }), (req, res) => {
  const header = req.get("X-DataYego-Signature") || "";       // t=...,v1=...
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const expected = crypto.createHmac("sha256", process.env.DATAYEGO_WEBHOOK_SECRET)
    .update(\`\${t}.\${req.body}\`).digest("hex");
  const ok = v1 && v1.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
  if (!ok || Math.abs(Date.now() / 1000 - Number(t)) > 300) return res.sendStatus(400);

  const event = JSON.parse(req.body);
  if (event.type === "order.delivered") {
    // mark event.data.order.your_reference as delivered on your site
  }
  res.sendStatus(200);
});`,
};

const HOOK_EXAMPLE = `POST https://yoursite.com/datayego-webhook
Content-Type: application/json
X-DataYego-Event: order.delivered
X-DataYego-Delivery: evt_1042
X-DataYego-Signature: t=1763720380,v1=5f2c8e...

{
  "id": "evt_1042",
  "type": "order.delivered",
  "created_at": "2026-11-21T10:19:40Z",
  "test": false,
  "data": {
    "order": {
      "reference": "YG-61F041CF38",
      "your_reference": "ORDER-1001",
      "status": "delivered",
      "bundle": { "id": "mtn-2", "network": "MTN", "size_gb": 2 },
      "phone": "0241234567",
      "price": 8.50,
      "delivered_at": "2026-11-21T10:19:38Z"
    }
  }
}`;

const EVENTS: [string, string][] = [
  ["order.processing", "Sent to the network."],
  ["order.delivered", "The bundle is on the number."],
  ["order.verifying", "MTN is verifying a first-time number."],
  ["order.on_hold", "We are checking the order."],
  ["order.queued", "Back in line to be sent (after a check)."],
  ["order.refunded", "The money is back in your balance."],
  ["order.cancelled", "Cancelled."],
  ["ping", "The test event from your API page."],
];

const STATUSES: [string, string][] = [
  ["queued", "Paid and waiting its turn to be sent. Usually a few seconds."],
  ["processing", "Sent to the network. Delivering."],
  ["delivered", "The bundle is on the number. Done."],
  ["verifying", "MTN is checking a number that is getting its first bundle. This can take a few weeks; it is delivered by itself once MTN is done."],
  ["on_hold", "We are checking this order. It is either delivered or refunded to your balance."],
  ["refunded", "The money is back in your balance."],
  ["cancelled", "Cancelled before it was sent."],
];

const ERRORS: [string, number, string][] = [
  ["missing_key / invalid_key", 401, "No key, or a key we don't know. Check it, or make a new one."],
  ["account_not_active", 403, "Your API access is paused. Contact support."],
  ["ip_not_allowed", 403, "Your live key is locked to other IP addresses. The reply shows the address we saw."],
  ["invalid_phone", 400, "The number is not a 10-digit Ghana number."],
  ["wrong_network", 400, "The number is on another network (e.g. a Telecel number with an MTN bundle)."],
  ["unknown_bundle / bundle_not_offered", 400, "No bundle with that id, or it is not on your price list. Get the ids from GET /bundles."],
  ["insufficient_balance", 402, "Your balance is too low. Top up and send again."],
  ["bundle_unavailable", 409, "That bundle can't be bought right now. Try again later."],
  ["reference_conflict", 409, "You used this reference before for a different number or bundle. Use a new reference."],
  ["rate_limited", 429, "More than 120 requests in a minute. Wait for the Retry-After seconds."],
  ["too_many_failures", 429, "Too many wrong keys from your server. Wait 10 minutes."],
  ["maintenance / api_closed", 503, "We are under maintenance. Nothing was charged. Try again shortly."],
  ["server_error", 500, "Something went wrong on our side. Send the same reference again: it never charges twice."],
];

/* The whole guide as one Markdown file (owner, 24 Nov 2026: sellers hand it to an AI that writes their code). */
export function apiDocsMarkdown(): string {
  const L: string[] = [];
  L.push("# DataYego API", "", "Sell MTN, Telecel and AirtelTigo data bundles from your own website or app. Orders are paid from your DataYego wallet.", "");
  L.push("## Base URL", "", "```", API_BASE_URL, "```", "");
  L.push("## Authentication", "", "Send your key with every request:", "", "```", "Authorization: Bearer YOUR_API_KEY", "```", "", "Keys starting `dy_test_` never charge or send anything (test orders become delivered after about 30 seconds). Keys starting `dy_live_` are real. Keep the live key on your server, never in a web page (browser requests are refused). Get keys at https://datayego.com/account/api after your access is approved.", "");
  L.push("## Endpoints", "");
  ENDPOINTS.forEach((e) => L.push(`- \`${e.method} ${e.path}\` — ${e.what}`));
  L.push("", "## Buy a bundle: POST /orders", "", "Body: `bundle` (id from GET /bundles), `phone` (10-digit Ghana number), `reference` (your own order number). The same reference again never charges twice; the same reference with a different number or bundle returns 409 reference_conflict. Without a reference in the body, an `Idempotency-Key` header is used.", "");
  (["curl", "php", "js"] as Lang[]).forEach((l) => L.push(`### ${l === "js" ? "JavaScript" : l === "php" ? "PHP" : "cURL"}`, "", "```" + (l === "curl" ? "bash" : l === "js" ? "javascript" : "php"), ORDER_EXAMPLES[l], "```", ""));
  L.push("### Reply", "", "```json", ORDER_REPLY, "```", "");
  L.push("## Order statuses", "");
  STATUSES.forEach(([k, d]) => L.push(`- \`${k}\` — ${d}`));
  L.push("", "## Webhooks", "", "Set an https webhook address on your API page. Every order status change is POSTed to it:", "", "```", HOOK_EXAMPLE, "```", "", "Events:", "");
  EVENTS.forEach(([k, d]) => L.push(`- \`${k}\` — ${d}`));
  L.push("", "Verify the signature: HMAC-SHA256 of `t + \".\" + raw body` with your `whsec_` signing secret must equal `v1`; refuse if `t` is more than 5 minutes old. Answer any 2xx within 10 seconds. Failed deliveries are retried after 1 m, 5 m, 15 m, 1 h, 3 h, 6 h and 12 h.", "");
  L.push("### PHP", "", "```php", VERIFY.php, "```", "", "### JavaScript (Node/Express)", "", "```javascript", VERIFY.js, "```", "");
  L.push("## Errors", "", "Errors always look like `{ \"error\": { \"code\", \"message\", \"request_id\" } }`.", "", "| Code | HTTP | Meaning |", "|---|---|---|");
  ERRORS.forEach(([c, n, d]) => L.push(`| ${c} | ${n} | ${d} |`));
  L.push("", "## Bundle ids", "", "Ids are the network and the size in GB: `mtn-1`, `mtn-10`, `at-2`, `tel-15`. Call GET /bundles for your prices and what is available now.", "", "## Limits", "", "120 requests a minute per key (429 rate_limited, see Retry-After). Every reply carries an `X-Request-Id`; quote it when contacting support.", "");
  return L.join("\n");
}

export function downloadApiDocs() {
  const blob = new Blob([apiDocsMarkdown()], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "datayego-api-docs.md";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function DownloadDocsButton() {
  return (
    <button type="button" onClick={downloadApiDocs} className="onyx-panel flex w-full items-center gap-3 rounded-[20px] p-4 text-left">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/15 text-primary-glow"><Download size={18} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-semibold text-foreground">Download the full guide</span><span className="block text-[12.5px] text-muted-foreground">One file with everything. Give it to your developer or your AI to write the code.</span></span>
    </button>
  );
}

export default function Developers({ embedded = false }: { embedded?: boolean }) {
  const [lang, setLang] = useState<Lang>("php");
  const [hookLang, setHookLang] = useState<HookLang>("php");
  return (
    <div className="mx-auto w-full max-w-[760px]">
      {!embedded && <Seo title="DataYego API — sell data from your own website or app" description="Connect your website or app to DataYego and sell MTN, Telecel and AirtelTigo bundles automatically, paid from your DataYego wallet." path="/developers" />}
      {!embedded && <Band kicker="For developers" title="DataYego API" sub="Sell MTN, Telecel and AirtelTigo bundles from your own website or app. Your site sends the order; we deliver it." className="mb-5" />}

      <div className="space-y-4">
        <section className="grid gap-2 sm:grid-cols-3">
          <Step n={1} icon={<KeyRound size={16} />} title="Get your keys">Apply from your account. Once approved you get a live key and a test key.</Step>
          <Step n={2} icon={<Wallet size={16} />} title="Top up">Orders are paid from your DataYego wallet. Any amount.</Step>
          <Step n={3} icon={<Zap size={16} />} title="Send orders">Your site calls the API. You get an order number at once.</Step>
        </section>
        <DownloadDocsButton />
        {!embedded && <Link to="/account/api" className="onyx-btn-primary flex w-full items-center justify-center gap-2 !py-3.5 !text-[14.5px]">Get your API keys<ArrowRight size={16} /></Link>}

        <Board title="Your key">
          <p>Send your key with every request, in this header:</p>
          <Code>{`Authorization: Bearer YOUR_API_KEY`}</Code>
          <p className="mt-2">All addresses start with:</p>
          <CopyCode value={API_BASE_URL} />
          <p className="mt-2 text-[12.5px] text-faint-foreground">Keys starting <b className="font-mono">dy_test_</b> never charge or send anything: use them while you build. Keep your live key on your server, never in a web page.</p>
        </Board>

        <Board title="What you can do">
          <ul className="divide-y divide-white/[0.06]">
            {ENDPOINTS.map((e) => (
              <li key={e.method + e.path} className="flex items-start gap-3 py-2.5">
                <span className={`mt-0.5 w-12 shrink-0 rounded-md py-0.5 text-center text-[10.5px] font-bold ${e.method === "POST" ? "bg-amber/15 text-amber" : "bg-primary/15 text-primary-glow"}`}>{e.method}</span>
                <span className="min-w-0"><span className="block font-mono text-[13px] font-semibold text-foreground">{e.path}</span><span className="block text-[12.5px] text-muted-foreground">{e.what}</span></span>
              </li>
            ))}
          </ul>
        </Board>

        <Board title="Buy a bundle" id="orders">
          <p>Send the bundle id, the number, and your own order number as <b className="font-mono">reference</b>. Sending the same reference again never charges twice: you get the first order back.</p>
          <div className="mt-3 flex gap-1.5">{(["php", "js", "curl"] as Lang[]).map((l) => <button key={l} type="button" onClick={() => setLang(l)} className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ${lang === l ? "bg-primary/15 text-primary-glow" : "border border-white/[0.1] text-muted-foreground"}`}>{l === "js" ? "JavaScript" : l === "php" ? "PHP" : "cURL"}</button>)}</div>
          <Code>{ORDER_EXAMPLES[lang]}</Code>
          <p className="mt-3">You get back:</p>
          <Code>{ORDER_REPLY}</Code>
          <p className="mt-2 text-[12.5px] text-faint-foreground">Set a webhook and we tell your server when it is delivered. Or check <b className="font-mono">GET /orders/ORDER-1001</b> now and then.</p>
          <p className="mt-2 text-[12.5px] text-faint-foreground">No reference in the body? An <b className="font-mono">Idempotency-Key</b> header is used as the reference.</p>
        </Board>

        <Board title="Webhooks" id="webhooks">
          <p>Put your webhook address (https) on your API page. Each time an order changes, we send it a POST like this:</p>
          <Code>{HOOK_EXAMPLE}</Code>
          <ul className="mt-3 space-y-1.5">{EVENTS.map(([e, d]) => <li key={e} className="flex items-start gap-3"><span className="mt-0.5 w-[130px] shrink-0 font-mono text-[12px] font-semibold text-foreground">{e}</span><span className="text-[12.5px] text-muted-foreground">{d}</span></li>)}</ul>
          <p className="mt-3 font-semibold text-foreground">Check that it really came from us</p>
          <p>Every message is signed with your signing secret (on your API page). Work out the HMAC-SHA256 of <b className="font-mono">t + "." + the raw body</b> and compare it with <b className="font-mono">v1</b>. Refuse it if they differ or if <b className="font-mono">t</b> is more than 5 minutes old.</p>
          <div className="mt-3 flex gap-1.5">{(["php", "js"] as HookLang[]).map((l) => <button key={l} type="button" onClick={() => setHookLang(l)} className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold ${hookLang === l ? "bg-primary/15 text-primary-glow" : "border border-white/[0.1] text-muted-foreground"}`}>{l === "js" ? "JavaScript" : "PHP"}</button>)}</div>
          <Code>{VERIFY[hookLang]}</Code>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-[12.5px]">
            <li>Answer with any 2xx within 10 seconds. Do the slow work after answering.</li>
            <li>No 2xx? We try again after 1 min, 5 min, 15 min, 1 hour, 3 hours, 6 hours and 12 hours, then stop. You can send a failed one again from your API page.</li>
            <li>A message can arrive twice or out of order. Use <b className="font-mono">id</b> to skip ones you have seen, and the order's <b className="font-mono">status</b> as the truth.</li>
            <li>We don't follow redirects. Use your final https address.</li>
            <li>Test keys send test events too (<b className="font-mono">"test": true</b>), 30 seconds after a test order.</li>
          </ul>
        </Board>

        <Board title="Keep your account safe" id="safety">
          <ul className="list-disc space-y-1.5 pl-5 text-[12.5px]">
            <li>Call the API from your server only. Browsers are blocked on purpose, so a key in a web page simply won't work.</li>
            <li>Lock your live key to your server's IP addresses on your API page. A stolen key then works for nobody else.</li>
            <li>Lost a key or think someone saw it? Replace it on your API page. The old one stops at once.</li>
            <li>Every reply carries an <b className="font-mono">X-Request-Id</b>. Send it to us when you need help with a request.</li>
          </ul>
        </Board>

        <Board title="Limits">
          <ul className="list-disc space-y-1.5 pl-5 text-[12.5px]">
            <li>120 requests a minute per key. Each reply shows <b className="font-mono">X-RateLimit-Remaining</b>.</li>
            <li>1,000 test orders a day.</li>
            <li>No minimum top-up and no daily spending limit on live orders.</li>
          </ul>
        </Board>

        <Board title="Order status">
          <ul className="space-y-2">{STATUSES.map(([s, d]) => <li key={s} className="flex items-start gap-3"><span className="mt-0.5 w-[86px] shrink-0 font-mono text-[12.5px] font-semibold text-foreground">{s}</span><span className="text-[12.5px] text-muted-foreground">{d}</span></li>)}</ul>
        </Board>

        <Board title="When something is wrong">
          <p>Errors always look the same: <span className="font-mono text-[12.5px]">{`{ "error": { "code", "message", "request_id" } }`}</span>. The message says in plain words what went wrong.</p>
          <ul className="mt-2 divide-y divide-white/[0.06]">{ERRORS.map(([c, n, d]) => <li key={c} className="py-2"><span className="flex items-baseline justify-between gap-2"><span className="font-mono text-[12.5px] font-semibold text-foreground">{c}</span><span className="text-[11.5px] text-faint-foreground">{n}</span></span><span className="block text-[12.5px] text-muted-foreground">{d}</span></li>)}</ul>
        </Board>

        <Board title="Bundle ids" id="bundles">
          <p>Ids are the network and the size: <b className="font-mono">mtn-1</b>, <b className="font-mono">mtn-10</b>, <b className="font-mono">at-2</b>, <b className="font-mono">tel-15</b>. Your prices and what is available now come from <b className="font-mono">GET /bundles</b>.</p>
        </Board>
      </div>
    </div>
  );
}

function Step({ n, icon, title, children }: { n: number; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="onyx-panel rounded-[20px] p-4">
      <p className="flex items-center gap-2 text-[13px] font-semibold text-primary-glow"><span className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-[12px]">{n}</span>{icon}</p>
      <p className="mt-2 text-[14.5px] font-semibold text-foreground">{title}</p>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">{children}</p>
    </div>
  );
}

function Board({ title, id, children }: { title: string; id?: string; children: ReactNode }) {
  return (
    <section id={id} className="onyx-panel scroll-mt-24 rounded-[22px] p-5 text-[13.5px] leading-relaxed text-muted-foreground">
      <h2 className="mb-2 font-display text-[18px] font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Code({ children }: { children: string }) {
  return <pre className="mt-2 overflow-x-auto rounded-2xl bg-[#062a1d] px-4 py-3.5 font-mono text-[12px] leading-relaxed text-[#d7f5e4]"><code>{children}</code></pre>;
}

function CopyCode({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={() => { void navigator.clipboard?.writeText(value); setDone(true); window.setTimeout(() => setDone(false), 1500); }} className="mt-2 flex w-full items-center gap-2 rounded-2xl bg-[#062a1d] px-4 py-3 text-left font-mono text-[12.5px] text-[#d7f5e4]">
      <span className="min-w-0 flex-1 truncate">{value}</span>{done ? <Check size={15} /> : <Copy size={15} className="opacity-70" />}
    </button>
  );
}
