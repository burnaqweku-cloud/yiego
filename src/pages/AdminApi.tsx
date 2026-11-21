import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Code2, KeyRound, Power, Tags } from "lucide-react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Panel, Pill, Rows, Row, Segmented, Stat, StatGrid } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { agoLabel } from "@/lib/apiAccess";
import { STATUS_TEXT, apiAdminError, byNetwork, filterClients, marginOf, readPrice, type AdminApiBundle, type AdminApiClient, type ClientFilter } from "@/lib/adminApi";

/* Admin -> API (owner, 21 Nov 2026). /admin/api: applicants and sellers (tap one for its page, ?c=<id>);
   /admin/api/prices: the standard API price list and the API's on/off switch. */

const money = (n: number | null | undefined) => (n == null ? "—" : Number(n).toFixed(2));
type Res<T> = { data: T | null; error: { message: string } | null };
const rpc = <T,>(fn: string, args: Record<string, unknown> = {}) =>
  (adminDatabase() as unknown as { rpc: (f: string, a: Record<string, unknown>) => PromiseLike<Res<T>> }).rpc(fn, args);

export default function AdminApi() {
  const { section } = useParams();
  return section === "prices" ? <ApiPrices /> : <ApiCustomers />;
}

function useClients() {
  const [data, setData] = useState<{ enabled: boolean; clients: AdminApiClient[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    rpc<{ enabled: boolean; clients: AdminApiClient[] }>("admin_api_clients").then(
      (r) => { if (r.error) setFailed(true); else { setFailed(false); setData(r.data ?? { enabled: false, clients: [] }); } },
      () => setFailed(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  return { data, failed, reload: load };
}

function ApiCustomers() {
  const { data, failed, reload } = useClients();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState<ClientFilter>("pending");
  const picked = params.get("c");
  const clients = data?.clients ?? [];
  const counts = useMemo(() => ({
    pending: clients.filter((c) => c.status === "pending").length,
    active: clients.filter((c) => c.status === "active").length,
    suspended: clients.filter((c) => c.status === "suspended").length,
  }), [clients]);
  // Open on "Waiting" only when someone is waiting; otherwise on the active sellers.
  useEffect(() => { if (data && counts.pending === 0 && filter === "pending") setFilter("active"); }, [data, counts.pending]); // eslint-disable-line react-hooks/exhaustive-deps

  const client = picked ? clients.find((c) => c.id === picked) : undefined;
  if (picked && client) return <ClientPage client={client} onBack={() => setParams({})} onChanged={reload} />;

  const today = clients.reduce((s, c) => s + Number(c.sales_today), 0);
  const ordersToday = clients.reduce((s, c) => s + Number(c.orders_today), 0);
  const list = filterClients(clients, filter);
  return (
    <div className="space-y-4">
      <AdminPageHeader eyebrow="API" title="API customers" description="Websites and apps buying our bundles through the API. Approve applications, pause a seller, or give one seller their own prices." />
      {failed && <p className="rounded-xl bg-danger/10 px-3 py-2 text-[12.5px] text-danger">Could not load. Check your two-step sign-in and refresh.</p>}
      {data && !data.enabled && <p className="rounded-xl bg-amber/10 px-3 py-2 text-[12.5px] text-amber">The API is switched off: every request is refused. <Link to="/admin/api/prices" className="font-semibold underline">Switch it on</Link></p>}
      <StatGrid cols={4}>
        <Stat label="Waiting for you" value={data ? counts.pending : "—"} tone={counts.pending ? "warn" : "muted"} onClick={() => setFilter("pending")} />
        <Stat label="Active sellers" value={data ? counts.active : "—"} tone="good" onClick={() => setFilter("active")} />
        <Stat label="API orders today" value={data ? ordersToday : "—"} />
        <Stat label="API sales today" value={data ? formatGHS(today) : "—"} tone="good" />
      </StatGrid>
      <Segmented<ClientFilter> value={filter} onChange={setFilter} options={[
        { value: "pending", label: `Waiting (${counts.pending})` }, { value: "active", label: `Active (${counts.active})` },
        { value: "suspended", label: `Paused (${counts.suspended})` }, { value: "all", label: "All" }]} />
      <Panel title={filter === "pending" ? "Applications" : "Sellers"} icon={Code2}>
        <Rows empty={!data ? "Loading…" : filter === "pending" ? "No one is waiting." : "No one here yet."}>
          {list.map((c) => (
            <Row key={c.id} onClick={() => setParams({ c: c.id })}
              primary={<span className="flex items-center gap-1.5"><b className="font-semibold">{c.name}</b><Pill tone={STATUS_TEXT[c.status].tone}>{STATUS_TEXT[c.status].text}</Pill>{c.agent && <Pill>agent</Pill>}</span>}
              secondary={`${c.email ?? c.phone ?? ""}${c.agent ? ` · ${c.agent.store}` : ""} · ${c.status === "pending" ? "applied" : "since"} ${agoLabel(c.status === "pending" ? c.created_at : c.approved_at ?? c.created_at)}`}
              right={c.status === "pending" ? "Review" : formatGHS(Number(c.sales_today))}
              rightNote={c.status === "pending" ? undefined : `${c.orders_today} today · ${formatGHS(Number(c.balance))} wallet`}
              tone={c.status === "pending" ? "warn" : "default"} />
          ))}
        </Rows>
      </Panel>
    </div>
  );
}

function ClientPage({ client: c, onBack, onChanged }: { client: AdminApiClient; onBack: () => void; onChanged: () => void }) {
  const { canAct } = useAdminAccess();
  const [busy, setBusy] = useState(false);
  const act = async (status: "active" | "suspended" | "declined", ask?: string) => {
    if (ask && !window.confirm(ask)) return;
    setBusy(true);
    const r = await rpc<string>("admin_api_set_status", { p_client: c.id, p_status: status });
    setBusy(false);
    if (r.error) { toast.error(apiAdminError(r.error.message)); return; }
    toast.success(status === "active" ? (c.status === "pending" ? `${c.name} approved. They get a notification and a text.` : `${c.name} resumed.`) : status === "suspended" ? `${c.name} paused. Their keys stop working now.` : "Application turned down.");
    if (status === "declined") onBack();
    onChanged();
  };
  const st = STATUS_TEXT[c.status];
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary-glow"><ArrowLeft size={14} />All API customers</button>
      <AdminPageHeader eyebrow="API customer" title={c.name} description={c.status === "pending" ? `Applied ${formatAdminDate(c.created_at)}. Check who they are before you approve.` : `Approved ${c.approved_at ? formatAdminDate(c.approved_at) : ""}.`} />
      <Panel title="Who they are" action={<Pill tone={st.tone}>{st.text}</Pill>}>
        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[12.5px]">
          <dt className="text-faint-foreground">Account</dt><dd className="min-w-0 break-words text-foreground">{c.account_name ?? "—"}{c.email ? ` · ${c.email}` : ""}</dd>
          <dt className="text-faint-foreground">Phone</dt><dd className="text-foreground">{c.phone ? <a href={`tel:${c.phone}`} className="underline">{c.phone}</a> : "—"}{c.phone && <> · <a href={`https://wa.me/233${c.phone.replace(/^0/, "")}`} target="_blank" rel="noreferrer" className="underline">WhatsApp</a></>}</dd>
          <dt className="text-faint-foreground">Website or app</dt><dd className="min-w-0 break-words text-foreground">{c.website ?? "—"}</dd>
          <dt className="text-faint-foreground">What it's for</dt><dd className="min-w-0 whitespace-pre-wrap break-words text-foreground">{c.note ?? "—"}</dd>
          {c.status !== "pending" && <><dt className="text-faint-foreground">Webhook</dt><dd className="min-w-0 break-all text-foreground">{c.webhook_url ?? "Not set"}</dd>
          <dt className="text-faint-foreground">Live key</dt><dd className="min-w-0 break-words text-foreground">{c.allowed_ips?.length ? `Locked to ${c.allowed_ips.join(", ")}` : "Any IP address"}</dd></>}
          <dt className="text-faint-foreground">Agent</dt><dd className="text-foreground">{c.agent ? `${c.agent.store} (${c.agent.slug})${c.agent.sub ? " · sub-agent" : ""}` : "Not an agent"}</dd>
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          {c.status === "pending" && <>
            <Button size="sm" disabled={!canAct || busy} onClick={() => void act("active")}>Approve</Button>
            <Button size="sm" variant="quiet" disabled={!canAct || busy} onClick={() => void act("declined", `Turn down ${c.name}? The application is removed; they can apply again.`)}>Turn down</Button>
          </>}
          {c.status === "active" && <Button size="sm" variant="ghost" disabled={!canAct || busy} onClick={() => void act("suspended", `Pause ${c.name}? Their keys stop working at once. Orders already paid still deliver.`)}><Power size={14} />Pause</Button>}
          {c.status === "suspended" && <Button size="sm" disabled={!canAct || busy} onClick={() => void act("active")}>Resume</Button>}
        </div>
      </Panel>
      {c.status !== "pending" && <>
        <StatGrid cols={3}>
          <Stat label="Wallet" value={formatGHS(Number(c.balance))} note="API orders are paid from it" />
          <Stat label="Orders today" value={c.orders_today} note={`${formatGHS(Number(c.sales_today))} sales`} tone="good" />
          <Stat label="All API orders" value={c.orders} note={`${c.delivered} delivered · ${c.waiting} on the way`} />
          <Stat label="All API sales" value={formatGHS(Number(c.sales))} />
          <Stat label="Requests today" value={c.requests_today} note="120 a minute at most" />
          <Stat label="Webhooks today" value={c.webhook_url ? `${c.webhook_sent_today ?? 0} sent` : "not set"} note={c.webhook_url ? `${c.webhook_failed_today ?? 0} not answered` : "they ask for updates"} tone={(c.webhook_failed_today ?? 0) > 0 ? "warn" : "default"} />
          <Stat label="Last order" value={c.last_order_at ? agoLabel(c.last_order_at) : "none yet"} />
        </StatGrid>
        <Panel title="Keys" icon={KeyRound} note="only the start and end are kept">
          <Rows empty="No keys made yet. They make them on their API page.">
            {c.keys.map((k) => <Row key={k.mode} primary={<span className="font-mono">{k.hint}</span>} secondary={`${k.mode === "live" ? "Live" : "Test"} · made ${agoLabel(k.created_at)}`} right={k.last_used_at ? agoLabel(k.last_used_at) : "never used"} rightNote="last used" />)}
          </Rows>
        </Panel>
        <PriceEditor client={c} canAct={canAct} onChanged={onChanged} />
      </>}
    </div>
  );
}

function usePrices(client?: string) {
  const [list, setList] = useState<AdminApiBundle[] | null>(null);
  const load = useCallback(() => {
    rpc<AdminApiBundle[]>("admin_api_prices", { p_client: client ?? null }).then((r) => setList(r.data ?? []), () => setList([]));
  }, [client]);
  useEffect(() => { load(); }, [load]);
  return { list, reload: load };
}

/** One seller's own prices: an empty box means they pay the standard API price. */
function PriceEditor({ client, canAct, onChanged }: { client: AdminApiClient; canAct: boolean; onChanged: () => void }) {
  const { list, reload } = usePrices(client.id);
  const save = async (b: AdminApiBundle, price: number | null) => {
    const r = await rpc("admin_api_set_client_price", { p_client: client.id, p_product: b.product_id, p_price: price });
    if (r.error) { toast.error(apiAdminError(r.error.message)); return false; }
    toast.success(price == null ? `${b.size_gb}GB back to the standard price.` : `${client.name} now pays ${formatGHS(price)} for ${b.network} ${b.size_gb}GB.`);
    reload(); onChanged(); return true;
  };
  return (
    <Panel title="Their prices" icon={Tags} note="empty box = standard API price">
      {!list ? <p className="py-4 text-center text-[12px] text-faint-foreground">Loading…</p> : byNetwork(list).map(([n, rows]) => (
        <div key={n} className="mt-2 first:mt-0">
          <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint-foreground">{n}</p>
          <ul className="divide-y divide-white/[0.06]">{rows.map((b) => (
            <PriceRow key={b.product_id} b={b} value={b.special_price} placeholder={b.api_price} canAct={canAct} onSave={(p) => save(b, p)} own={b.special_price != null}
              note={`cost ${money(b.cost)} · standard ${b.api_price != null ? money(b.api_price) : "not offered"}`} />
          ))}</ul>
        </div>
      ))}
    </Panel>
  );
}

function PriceRow({ b, value, placeholder, note, canAct, onSave, own = false }: { b: AdminApiBundle; value: number | null; placeholder: number | null; note: string; canAct: boolean; onSave: (p: number | null) => Promise<boolean>; own?: boolean }) {
  const [text, setText] = useState(value != null ? value.toFixed(2) : "");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setText(value != null ? value.toFixed(2) : ""); }, [value]);
  const parsed = readPrice(text);
  const changed = parsed !== "bad" && (parsed ?? null) !== (value ?? null);
  const margin = marginOf(parsed === "bad" ? null : parsed ?? placeholder, b.cost);
  const submit = async () => {
    if (parsed === "bad") { toast.error("Enter a price like 4.20"); return; }
    setSaving(true); await onSave(parsed); setSaving(false);
  };
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span className="w-12 shrink-0 text-[13px] font-semibold text-foreground">{b.size_gb}GB</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] leading-4 text-faint-foreground">{note}</span>
        <span className={`block text-[11px] ${margin == null ? "text-faint-foreground" : margin < 0.05 ? "text-amber" : "text-success"}`}>{margin == null ? (b.available ? "" : "not available now") : `we keep ${formatGHS(margin)}`}{!b.available && margin != null ? " · not available now" : ""}</span>
      </span>
      <input value={text} onChange={(e) => setText(e.target.value)} inputMode="decimal" disabled={!canAct} placeholder={placeholder != null ? placeholder.toFixed(2) : "—"} aria-label={`${b.network} ${b.size_gb}GB price`}
        className={`h-8 w-[76px] shrink-0 rounded-lg border bg-white/[0.03] px-2 text-right text-[13px] tabular-nums text-foreground placeholder:text-faint-foreground placeholder:font-normal focus:border-primary/50 focus:outline-none ${own ? "border-primary/60 font-semibold" : "border-white/[0.1]"}`} />
      <Button size="sm" variant={changed ? "primary" : "quiet"} className="!h-8 shrink-0 !px-2.5 !text-[12px]" disabled={!canAct || !changed || saving} onClick={() => void submit()}>{saving ? "…" : "Save"}</Button>
    </li>
  );
}

/** The standard API price list (what every seller pays unless they have their own) and the API switch. */
function ApiPrices() {
  const { canAct } = useAdminAccess();
  const { data, reload: reloadClients } = useClients();
  const { list, reload } = usePrices();
  const [switching, setSwitching] = useState(false);
  const enabled = data?.enabled ?? false;
  const toggle = async () => {
    if (!window.confirm(enabled ? "Switch the API off? Every request is refused until you switch it on. Keys, prices and paid orders stay." : "Switch the API on?")) return;
    setSwitching(true);
    const r = await rpc("admin_api_set_enabled", { p_enabled: !enabled });
    setSwitching(false);
    if (r.error) { toast.error(apiAdminError(r.error.message)); return; }
    toast.success(enabled ? "API switched off." : "API switched on."); reloadClients();
  };
  const save = async (b: AdminApiBundle, price: number | null) => {
    if (price == null && !window.confirm(`Take ${b.network} ${b.size_gb}GB off the API? Sellers without their own price for it can't buy it.`)) return false;
    const r = await rpc("admin_api_set_price", { p_product: b.product_id, p_price: price });
    if (r.error) { toast.error(apiAdminError(r.error.message)); return false; }
    toast.success(price == null ? `${b.network} ${b.size_gb}GB taken off the API.` : `${b.network} ${b.size_gb}GB is now ${formatGHS(price)} on the API.`);
    reload(); return true;
  };
  const sameAsAgent = (list ?? []).filter((b) => b.api_price != null && b.api_price === b.agent_price).length;
  return (
    <div className="space-y-4">
      <AdminPageHeader eyebrow="API" title="API prices" description="What every API seller pays, unless you give one seller their own price on their page. A bundle with no price is not offered through the API." />
      <Panel title="API switch" icon={Power} action={data ? <Pill tone={enabled ? "good" : "bad"}>{enabled ? "On" : "Off"}</Pill> : undefined}>
        <p className="text-[12.5px] text-muted-foreground">{enabled ? "Sellers' websites and apps can buy now." : "Every request is refused with \"closed for maintenance\". Keys, prices and paid orders stay as they are."}</p>
        <Button size="sm" variant={enabled ? "ghost" : "primary"} className="mt-2" disabled={!canAct || switching || !data} onClick={() => void toggle()}>{enabled ? "Switch off" : "Switch on"}</Button>
      </Panel>
      {sameAsAgent > 0 && <p className="rounded-xl bg-amber/10 px-3 py-2 text-[12.5px] text-amber">{sameAsAgent} {sameAsAgent === 1 ? "bundle still uses" : "bundles still use"} the agent price as {sameAsAgent === 1 ? "its" : "their"} API price. Set your API prices here.</p>}
      {!list ? <Panel title="Prices"><p className="py-4 text-center text-[12px] text-faint-foreground">Loading…</p></Panel> : byNetwork(list).map(([n, rows]) => (
        <Panel key={n} title={n} icon={Tags} note="empty box = not offered">
          <ul className="divide-y divide-white/[0.06]">{rows.map((b) => (
            <PriceRow key={b.product_id} b={b} value={b.api_price} placeholder={null} canAct={canAct} onSave={(p) => save(b, p)}
              note={`cost ${money(b.cost)} · agent ${money(b.agent_price)} · site ${money(b.customer_price)}`} />
          ))}</ul>
        </Panel>
      ))}
    </div>
  );
}
