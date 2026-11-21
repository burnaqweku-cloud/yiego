import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Copy, KeyRound, Wallet, Zap } from "lucide-react";
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
  { method: "GET", path: "/orders", what: "Your latest orders (up to 100)." },
];

const STATUSES: [string, string][] = [
  ["queued", "Paid and waiting its turn to be sent. Usually a few seconds."],
  ["processing", "Sent to the network. Delivering."],
  ["delivered", "The bundle is on the number. Done."],
  ["verifying", "MTN is checking a number that is getting its first bundle. This can take a few weeks; it is delivered by itself once MTN is done."],
  ["on_hold", "We are checking this order. It is either delivered or refunded to your balance."],
  ["refunded", "The money is back in your balance."],
];

const ERRORS: [string, number, string][] = [
  ["missing_key / invalid_key", 401, "No key, or a key we don't know. Check it, or make a new one."],
  ["account_not_active", 403, "Your API access is paused. Contact support."],
  ["invalid_phone", 400, "The number is not a 10-digit Ghana number."],
  ["wrong_network", 400, "The number is on another network (e.g. a Telecel number with an MTN bundle)."],
  ["unknown_bundle", 400, "No bundle with that id. Get the ids from GET /bundles."],
  ["insufficient_balance", 402, "Your balance is too low. Top up and send again."],
  ["bundle_unavailable", 409, "That bundle can't be bought right now. Try again later."],
  ["rate_limited", 429, "More than 120 requests in a minute. Slow down."],
];

export default function Developers() {
  const [lang, setLang] = useState<Lang>("php");
  return (
    <div className="mx-auto w-full max-w-[760px]">
      <Seo title="DataYego API — sell data from your own website or app" description="Connect your website or app to DataYego and sell MTN, Telecel and AirtelTigo bundles automatically, paid from your DataYego wallet." path="/developers" />
      <Band kicker="For developers" title="DataYego API" sub="Sell MTN, Telecel and AirtelTigo bundles from your own website or app. Your site sends the order; we deliver it." className="mb-5" />

      <div className="space-y-4">
        <section className="grid gap-2 sm:grid-cols-3">
          <Step n={1} icon={<KeyRound size={16} />} title="Get your keys">Apply from your account. Once approved you get a live key and a test key.</Step>
          <Step n={2} icon={<Wallet size={16} />} title="Top up">Orders are paid from your DataYego wallet. Any amount.</Step>
          <Step n={3} icon={<Zap size={16} />} title="Send orders">Your site calls the API. You get an order number at once.</Step>
        </section>
        <Link to="/account/api" className="onyx-btn-primary flex w-full items-center justify-center gap-2 !py-3.5 !text-[14.5px]">Apply for API access<ArrowRight size={16} /></Link>

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
          <p className="mt-2 text-[12.5px] text-faint-foreground">Then check <b className="font-mono">GET /orders/ORDER-1001</b> until the status is <b>delivered</b>.</p>
        </Board>

        <Board title="Order status">
          <ul className="space-y-2">{STATUSES.map(([s, d]) => <li key={s} className="flex items-start gap-3"><span className="mt-0.5 w-[86px] shrink-0 font-mono text-[12.5px] font-semibold text-foreground">{s}</span><span className="text-[12.5px] text-muted-foreground">{d}</span></li>)}</ul>
        </Board>

        <Board title="When something is wrong">
          <p>Errors always look the same: <span className="font-mono text-[12.5px]">{`{ "error": { "code", "message" } }`}</span>. The message says in plain words what went wrong.</p>
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
