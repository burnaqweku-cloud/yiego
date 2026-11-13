import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Copy, Megaphone, Pencil, Plus, RefreshCw, Tag, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { Field, inputCls, InlineAction, Panel, Pill, Row, Rows, Segmented, Stat, StatGrid } from "@/components/admin/ui";
import PromoTracking from "@/components/admin/PromoTracking";
import { formatGHS } from "@/lib/format";
import { loadPromoTracking, type PromoTrackingReport } from "@/lib/promotionAnalytics";
import { ADVERT_PLACES, advertError, advertFigures, advertLink, endAdvert, placeLabel, saveAdvert, splitUnnamed, type AdvertPlace, type PromoAdvert, type UnnamedLink } from "@/lib/promoAdverts";

/* Every advert on its own: its own link, its own visitors, buyers, sales and profit, and what was paid for it.
   Dates are Ghana days. A person counts for the first advert that brought them. */

type Period = "all" | "today" | "yesterday" | "week";
type Editor = { mode: "new" } | { mode: "edit"; advert: PromoAdvert } | { mode: "name"; link: UnnamedLink };

const ghanaDate = (daysAgo = 0) => new Date(Date.now() - daysAgo * 86400000).toLocaleDateString("en-CA", { timeZone: "Africa/Accra" });
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short" }) : "");
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("en-GB", { timeZone: "Africa/Accra", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
/** "1 buyer", "2 buyers". */
const count = (n: number | string, one: string) => `${Number(n) || 0} ${one}${Number(n) === 1 ? "" : "s"}`;
const copy = (value: string, done: string) => { void navigator.clipboard.writeText(value).then(() => toast.success(done), () => toast.error("Couldn't copy. Press and hold the link to copy it.")); };

export default function PromoAdverts() {
  const [period, setPeriod] = useState<Period>("all");
  const [report, setReport] = useState<PromoTrackingReport | null>(null);
  const [busy, setBusy] = useState(false); const [failed, setFailed] = useState(false);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [open, setOpen] = useState<PromoAdvert | null>(null);

  const range = useMemo<[string | null, string | null]>(() => period === "all" ? [null, null] : period === "today" ? [ghanaDate(), ghanaDate()] : period === "yesterday" ? [ghanaDate(1), ghanaDate(1)] : [ghanaDate(6), ghanaDate()], [period]);
  const load = useCallback(async () => {
    setBusy(true); setFailed(false);
    const result = await loadPromoTracking(range[0], range[1]);
    setReport(result.data); setFailed(Boolean(result.error) || !result.data); setBusy(false);
  }, [range]);
  useEffect(() => { void load(); }, [load]);

  if (open) return <PromoTracking advert={{ id: open.id, name: open.name }} onBack={() => { setOpen(null); void load(); }} />;

  const adverts = report?.adverts ?? [];
  const { tagged, plain } = splitUnnamed(report?.unnamed);
  const allTime = period === "all";

  return <section className="space-y-4">
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1"><Segmented<Period> value={period} onChange={setPeriod} options={[{ value: "all", label: "All time" }, { value: "today", label: "Today" }, { value: "yesterday", label: "Yesterday" }, { value: "week", label: "Last 7 days" }]} /></div>
      <Button size="icon" variant="quiet" aria-label="Refresh adverts" title="Refresh" disabled={busy} onClick={() => void load()}><RefreshCw size={15} className={busy ? "animate-spin" : ""} /></Button>
    </div>
    <Button size="sm" onClick={() => setEditor({ mode: "new" })}><Plus size={14} />Add an advert</Button>

    {failed ? <p role="alert" className="text-sm text-danger">Couldn’t load the adverts. Refresh to try again.</p>
      : !report ? <p className="text-sm text-muted-foreground">Loading adverts…</p>
      : !report.adverts ? <p className="text-sm text-muted-foreground">The adverts list is not switched on in the database yet.</p> : <>
        {!allTime && <p className="text-[11.5px] text-muted-foreground">Showing what happened in this period. What you paid is compared in <span className="text-foreground">All time</span>.</p>}
        {adverts.length === 0 ? <p className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4 text-[12.5px] text-muted-foreground">No adverts yet. Add one to get its own link.</p>
          : <ul className="space-y-3">{adverts.map((a) => <AdvertCard key={a.id} advert={a} allTime={allTime} busy={busy} onOpen={() => setOpen(a)} onEdit={() => setEditor({ mode: "edit", advert: a })} />)}</ul>}

        {tagged.length > 0 && <Panel title="Links without a name" icon={Tag} note="Tagged links people are already tapping">
          <Rows empty="">{tagged.map((l) => { const f = advertFigures(l); return <Row key={`${l.source}|${l.campaign}`}
            primary={<>{l.campaign} <span className="text-faint-foreground">· {l.source}</span></>}
            secondary={`${count(l.visitors, "visitor")} · ${count(l.buyers, "buyer")} · ${formatGHS(f.sales)} sales · last ${day(l.last_visit)}`}
            right={<InlineAction onClick={() => setEditor({ mode: "name", link: l })}>Name it</InlineAction>} />; })}</Rows>
          <p className="pt-2 text-[11px] leading-4 text-faint-foreground">Name one and it becomes an advert above, with everything it has brought so far.</p>
        </Panel>}

        <Panel title="No advert" icon={Megaphone} note="People who came on the plain promo link">
          <Rows empty="">{[<Row key="plain" primary="Plain link, no advert tag" secondary={`${count(plain.visitors, "visitor")} · ${count(plain.buyers, "buyer")} · ${count(plain.orders, "paid order")}`} right={formatGHS(plain.sales)} rightNote="sales" />]}</Rows>
        </Panel>

        <div className="space-y-1.5 text-[11.5px] leading-5 text-muted-foreground">
          <p>Each advert has its own link. Anyone who taps it is counted under that advert, and so is everything they buy later: data, result checkers and AFA.</p>
          <p>A person counts for the first advert that brought them. Profit is sales minus what the bundle or checker cost us, before payment fees.</p>
        </div>
      </>}

    <AdvertEditor editor={editor} onClose={() => setEditor(null)} onSaved={() => void load()} />
  </section>;
}

function AdvertCard({ advert: a, allTime, busy, onOpen, onEdit }: { advert: PromoAdvert; allTime: boolean; busy: boolean; onOpen: () => void; onEdit: () => void }) {
  const f = advertFigures(a);
  const seen = a.first_visit ? `first visitor ${day(a.first_visit)} · last ${when(a.last_visit)}` : "nobody has tapped the link yet";
  return <li className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-3">
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-[14.5px] font-semibold text-foreground">{a.name}</h2>
        <p className="mt-0.5 text-[11px] leading-4 text-faint-foreground">{placeLabel(a.place)} · {seen}</p>
      </div>
      {a.ended_at && <Pill>Ended</Pill>}
    </div>
    <div className="mt-2.5"><StatGrid cols={3}>
      <Stat label="Visitors" value={a.visitors} loading={busy} />
      <Stat label="Buyers" value={a.buyers} note={`${f.buyerRate.toFixed(1)}% of visitors`} tone={Number(a.buyers) > 0 ? "good" : "default"} loading={busy} />
      <Stat label="Paid orders" value={f.orders} note={Number(a.service_orders) > 0 ? `${a.service_orders} checker or AFA` : undefined} loading={busy} />
      <Stat label="Sales" value={formatGHS(f.sales)} loading={busy} />
      <Stat label="Profit" value={formatGHS(f.profit)} note="before payment fees" loading={busy} />
      <Stat label="You paid" value={f.cost > 0 ? formatGHS(f.cost) : "Not entered"} note={allTime && f.costPerBuyer !== null ? `${formatGHS(f.costPerBuyer)} for each buyer` : undefined} tone={f.cost > 0 ? "default" : "muted"} />
    </StatGrid></div>
    {allTime && (f.result === null
      ? <p className="mt-2.5 text-[12px] text-muted-foreground">Enter what you paid for this advert to see whether it made money.</p>
      : <p className={`mt-2.5 text-[12.5px] font-medium ${f.result >= 0 ? "text-success" : "text-danger"}`}>{f.result >= 0 ? `Made ${formatGHS(f.result)} after paying for the advert.` : `Lost ${formatGHS(Math.abs(f.result))} so far: profit ${formatGHS(f.profit)}, advert ${formatGHS(f.cost)}.`}</p>)}
    <div className="mt-2.5 flex flex-wrap gap-2">
      <Button size="sm" variant="soft" onClick={() => copy(advertLink(a), "Link copied.")}><Copy size={14} />Copy link</Button>
      <Button size="sm" variant="soft" onClick={onOpen}>See everything<ArrowRight size={14} /></Button>
      <Button size="sm" variant="quiet" onClick={onEdit}><Pencil size={14} />Edit</Button>
    </div>
  </li>;
}

/** Add an advert, change one, or name a link that is already out. A saved advert shows its two links to copy. */
function AdvertEditor({ editor, onClose, onSaved }: { editor: Editor | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(""); const [place, setPlace] = useState<AdvertPlace>("telegram"); const [cost, setCost] = useState("");
  const [saved, setSaved] = useState<PromoAdvert | null>(null); const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!editor) return;
    const a = editor.mode === "edit" ? editor.advert : null;
    setName(a?.name ?? ""); setPlace(a?.place ?? "telegram"); setCost(a && Number(a.cost) > 0 ? String(a.cost) : ""); setSaved(a); setBusy(false);
  }, [editor]);

  const save = async () => {
    if (!editor || busy) return;
    const paid = cost.trim() === "" ? 0 : Number(cost);
    if (!name.trim()) return void toast.error("Give the advert a name.");
    if (!Number.isFinite(paid) || paid < 0) return void toast.error("Enter what you paid as a number.");
    setBusy(true);
    const r = await saveAdvert({ id: editor.mode === "edit" ? editor.advert.id : undefined, name: name.trim(), place, cost: paid, ...(editor.mode === "name" ? { source: editor.link.source, campaign: editor.link.campaign } : {}) });
    setBusy(false);
    if (r.error || !r.data) return void toast.error(advertError(r.error?.message));
    toast.success(editor.mode === "edit" ? "Advert saved." : "Advert added.");
    onSaved();
    if (editor.mode === "edit") onClose(); else setSaved(r.data);
  };
  const toggleEnded = async () => {
    if (!saved || busy) return;
    setBusy(true);
    const r = await endAdvert(saved.id, !saved.ended_at);
    setBusy(false);
    if (r.error) return void toast.error(advertError(r.error.message));
    toast.success(saved.ended_at ? "Advert is running again." : "Advert marked as ended.");
    onSaved(); onClose();
  };
  const justAdded = editor !== null && editor.mode !== "edit" && saved !== null;
  const title = !editor ? "" : justAdded ? "Advert added" : editor.mode === "edit" ? "Edit advert" : editor.mode === "name" ? "Name this link" : "Add an advert";

  return <Modal open={editor !== null} onClose={onClose} label={title || "Advert"}>
    <div className="w-[min(94vw,460px)] p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-[15px] font-semibold text-foreground">{title}</h2>
        <Button size="icon" variant="quiet" aria-label="Close" onClick={onClose}><X size={16} /></Button>
      </div>
      {!justAdded && <div className="mt-3 space-y-3">
        {editor?.mode === "name" && <p className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5 text-[12px] text-muted-foreground">Link tag: <span className="break-all text-foreground">{editor.link.campaign}</span> · {editor.link.source}. Its visitors and sales so far come with it.</p>}
        <Field label="Name" hint="Something you will recognise, like the channel's name."><input className={inputCls} value={name} maxLength={80} placeholder="Telegram: channel name" onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Where it runs"><select className={inputCls} value={place} onChange={(e) => setPlace(e.target.value as AdvertPlace)}>{ADVERT_PLACES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></Field>
        <Field label="What you paid for it (GH₵)" hint="The total so far. Leave empty if you don't know yet; you can change it any time."><input className={inputCls} type="number" inputMode="decimal" min="0" step="0.01" value={cost} placeholder="0.00" onChange={(e) => setCost(e.target.value)} /></Field>
        <Button className="w-full" disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : editor?.mode === "edit" ? "Save changes" : "Save advert"}</Button>
      </div>}
      {saved && <div className="mt-4 space-y-2.5">
        <p className="text-[12.5px] font-semibold text-foreground">{justAdded ? `Links for ${saved.name}` : "This advert's links"}</p>
        <p className="text-[11.5px] leading-5 text-muted-foreground">Give one of these to whoever runs the advert. Everyone who taps it is counted under this advert only.</p>
        <LinkLine label="To the data bundles" link={advertLink(saved, "shop")} />
        <LinkLine label="To result checkers and AFA" link={advertLink(saved, "services")} />
        {justAdded ? <Button className="w-full" variant="soft" onClick={onClose}>Done</Button>
          : <Button className="w-full" variant="quiet" disabled={busy} onClick={() => void toggleEnded()}>{saved.ended_at ? "Mark as running again" : "Mark this advert as ended"}</Button>}
      </div>}
    </div>
  </Modal>;
}

function LinkLine({ label, link }: { label: string; link: string }) {
  return <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-2.5">
    <p className="text-[11px] text-faint-foreground">{label}</p>
    <div className="mt-1 flex items-start gap-2"><code className="min-w-0 flex-1 break-all text-[11.5px] leading-5 text-foreground">{link}</code>
      <Button size="icon" variant="soft" aria-label={`Copy the link ${label.toLowerCase()}`} title="Copy" onClick={() => copy(link, "Link copied.")}><Copy size={15} /></Button></div>
  </div>;
}
