import { useEffect, useState } from "react";
import { Check, ExternalLink, PackageCheck } from "lucide-react";
import { Panel, Segmented } from "@/components/admin/ui";
import CopyRef from "@/components/admin/CopyRef";
import { adminDatabase } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";
import { settled } from "@/lib/settled";
import { clockParts, networkMark, tookLabel } from "@/lib/latestDelivery";
import { boughtOn, deliveredAgo, NETWORK_ORDER, readLastDelivered, tookSlow, type LastDelivered } from "@/lib/adminLastDelivered";
import "@/components/shop/latest-delivery.css";

/* The last delivered order, at the top of Admin → Orders (owner, 23 Nov 2026: "I need that last delivered order at
   the top of the screen on this page"). The home page's card, per network, with what an admin needs under it: the
   reference, supplier, where it was bought, the amount and how long ago it landed. Reads every minute. */
const rpc = () => adminDatabase() as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<{ data: unknown }> };

export default function AdminLastDelivered({ onOpen }: { onOpen?: (reference: string) => void }) {
  const [all, setAll] = useState<Record<string, LastDelivered> | null>(null);
  const [net, setNet] = useState("MTN");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let alive = true;
    const load = () => void settled(rpc().rpc("admin_last_delivered", {}), { data: null }).then((r) => { if (alive) setAll(readLastDelivered(r.data)); });
    load();
    const t = window.setInterval(() => { load(); setNow(Date.now()); }, 60_000);
    const c = window.setInterval(() => setNow(Date.now()), 20_000);
    return () => { alive = false; window.clearInterval(t); window.clearInterval(c); };
  }, []);
  const d = all?.[net];
  const nets = NETWORK_ORDER.filter((n) => !all || all[n] || n === net);
  return (
    <Panel title="Last delivered" icon={PackageCheck}>
      <Segmented value={net} onChange={setNet} options={nets.map((n) => ({ value: n, label: n }))} />
      {!all ? <p className="py-6 text-center text-[12.5px] text-muted-foreground">Loading…</p>
        : !d ? <p className="py-6 text-center text-[12.5px] text-muted-foreground">No {net} order delivered in the last 3 days.</p>
        : <LastCard d={d} now={now} onOpen={onOpen} />}
    </Panel>
  );
}

function LastCard({ d, now, onOpen }: { d: LastDelivered; now: number; onOpen?: (reference: string) => void }) {
  const mark = networkMark(d.network);
  const paid = clockParts(d.paidAt), landed = clockParts(d.deliveredAt);
  const slow = tookSlow(d);
  return (
    <div className="mt-2.5">
      <section className="yg-strip yg-a-last" data-late={slow ? "" : undefined} aria-label={`The last ${d.network} order delivered`}>
        <div className="yg-strip__top">
          <span className="yg-latest__net" data-tone={mark.tone} aria-hidden="true">{mark.text}</span>
          <p className="yg-strip__what"><span>Last {d.network} delivery</span><b>{d.gb}GB<em>to {d.phone}</em></b></p>
          <p className="yg-strip__took"><b>{tookLabel(d)}</b><span>{deliveredAgo(d.deliveredAt, now)}</span></p>
        </div>
        <div className="yg-strip__trip" key={`${d.reference}-${d.deliveredAt}`}>
          <time dateTime={new Date(d.paidAt).toISOString()}><span className="sr-only">Paid </span>{paid.time}<small>{paid.period}</small></time>
          <span className="yg-latest__track" aria-hidden="true"><i /><b><Check size={11} strokeWidth={3.6} /></b></span>
          <time dateTime={new Date(d.deliveredAt).toISOString()}><span className="sr-only">Delivered </span>{landed.time}<small>{landed.period}</small></time>
        </div>
      </section>
      <div className="mt-2 px-0.5 text-[11.5px] text-muted-foreground">
        <div className="flex items-center justify-between gap-3">
          <CopyRef value={d.reference} className="font-semibold text-foreground" />
          {onOpen && <button type="button" onClick={() => onOpen(d.reference)} className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary-glow">Open order<ExternalLink size={12} /></button>}
        </div>
        <p className="mt-0.5 truncate">{d.supplier ?? "Supplier"} · {boughtOn(d)} · {formatGHS(d.amount)}</p>
      </div>
    </div>
  );
}
