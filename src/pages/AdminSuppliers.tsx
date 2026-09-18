import { useCallback, useEffect, useMemo, useState } from "react";
import { Pause, Play, RefreshCw, Store, Wifi } from "lucide-react";
import { toast } from "sonner";
import AdminListPagination from "@/components/admin/AdminListPagination";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import DeliverySpeedCard from "@/components/admin/DeliverySpeedCard";
import { Field, Money, Panel, Pill, Row, Rows, Stat, StatGrid, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { adminDatabase, formatAdminDate, type SupplierLogRow } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";
import { useAuth } from "@/store/auth-context";

/* Suppliers — who delivers what, and what is switched off.
   Every control here writes through an admin_* SQL function that records
   who did it. The shop reads the same flags, so a pause is immediate. */

interface Supplier { id: string; code: string; name: string; status: "active" | "paused" | "disabled"; balance: number | null; last_balance_checked_at: string | null; low_balance_threshold: number | null; metadata: Record<string, unknown> | null }
interface Network { id: string; code: string; name: string; is_paused: boolean; pause_reason: string | null; preferred_supplier_id: string | null }
interface Product { id: string; name: string; capacity_gb: number; customer_price: number; is_active: boolean; is_paused: boolean; pause_reason: string | null; network_id: string }
interface Mapping { product_id: string; supplier_id: string; supplier_price: number | null; is_active: boolean }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };

export default function AdminSuppliers() {
  const { user } = useAuth(); const actor = user?.id ?? "";
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [logs, setLogs] = useState<SupplierLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [openNetwork, setOpenNetwork] = useState<string | null>(null);
  const [pausing, setPausing] = useState<{ kind: "network" | "product"; id: string; label: string } | null>(null);
  const [reason, setReason] = useState("");
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(25);

  const load = useCallback(async () => {
    const [s, n, p, m, l] = await Promise.all([
      db().from("suppliers").select("id, code, name, status, balance, last_balance_checked_at, low_balance_threshold, metadata").order("display_order"),
      db().from("networks").select("id, code, name, is_paused, pause_reason, preferred_supplier_id").order("display_order"),
      db().from("data_products").select("id, name, capacity_gb, customer_price, is_active, is_paused, pause_reason, network_id").eq("is_active", true).order("capacity_gb"),
      db().from("supplier_product_mappings").select("product_id, supplier_id, supplier_price, is_active").eq("is_active", true),
      db().from("supplier_api_logs").select("action, endpoint, http_status, call_status, supplier_reference, error_message, duration_ms, created_at").order("created_at", { ascending: false }).limit(300),
    ]);
    setSuppliers(s.data ?? []); setNetworks(n.data ?? []); setProducts(p.data ?? []); setMappings(m.data ?? []); setLogs(l.data ?? []); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const call = async (fn: string, args: Record<string, unknown>, ok: string) => { const { error } = await db().rpc(fn, { p_actor: actor, ...args }); if (error) toast.error(error.message.replace(/_/g, " ")); else { toast.success(ok); void load(); } };
  const suppliersFor = (networkId: string) => suppliers.filter((s) => mappings.some((m) => m.supplier_id === s.id && products.some((p) => p.id === m.product_id && p.network_id === networkId)));
  const costFor = (productId: string, supplierId: string | null) => mappings.find((m) => m.product_id === productId && (supplierId ? m.supplier_id === supplierId : true))?.supplier_price ?? null;
  const routedSupplier = (n: Network) => suppliers.find((s) => s.id === n.preferred_supplier_id) ?? null;
  const visibleLogs = useMemo(() => logs.slice((page - 1) * pageSize, page * pageSize), [logs, page, pageSize]);

  const confirmPause = async () => {
    if (!pausing) return;
    if (pausing.kind === "network") await call("admin_pause_network", { p_network_code: pausing.id, p_paused: true, p_reason: reason }, `${pausing.label} paused`);
    else await call("admin_pause_product", { p_product_id: pausing.id, p_paused: true, p_reason: reason }, `${pausing.label} paused`);
    setPausing(null); setReason("");
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Suppliers" description="Who delivers each network, live float, and what is switched off." action={<Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Refresh"><RefreshCw size={15} /></Button>} />

      <StatGrid cols={3}>
        {suppliers.map((s) => {
          const low = s.balance != null && Number(s.balance) < Number(s.low_balance_threshold ?? 100);
          return <Stat key={s.id} loading={loading} label={s.name} icon={Store} value={s.balance == null ? "—" : <Money value={s.balance} tone={low ? "bad" : "default"} />} tone={s.status !== "active" ? "muted" : low ? "bad" : "good"}
            note={<span className="flex items-center gap-1.5"><Pill tone={s.status === "active" ? "good" : s.status === "paused" ? "warn" : "muted"}>{s.status}</Pill>{s.last_balance_checked_at ? formatAdminDate(s.last_balance_checked_at) : "no balance yet"}{s.status !== "active" ? <button type="button" className="text-primary-glow" onClick={() => void call("admin_set_supplier_status", { p_supplier_code: s.code, p_status: "active" }, `${s.name} activated`)}>activate</button> : <button type="button" className="text-faint-foreground" onClick={() => void call("admin_set_supplier_status", { p_supplier_code: s.code, p_status: "paused" }, `${s.name} paused`)}>pause</button>}</span>} />;
        })}
      </StatGrid>

      <Panel title="Networks" icon={Wifi} note="tap a network to manage its bundles">
        <Rows empty={loading ? "Loading…" : "No networks."}>
          {networks.map((n) => {
            const routed = routedSupplier(n); const options = suppliersFor(n.id); const open = openNetwork === n.id;
            const nProducts = products.filter((p) => p.network_id === n.id); const pausedCount = nProducts.filter((p) => p.is_paused).length;
            return (
              <li key={n.id} className="py-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setOpenNetwork(open ? null : n.id)} className="min-w-0 flex-1 text-left">
                    <p className="text-[13px] font-semibold text-foreground">{n.name} {n.is_paused && <Pill tone="warn">paused</Pill>} {pausedCount > 0 && !n.is_paused && <Pill tone="warn">{pausedCount} bundle{pausedCount > 1 ? "s" : ""} paused</Pill>}</p>
                    <p className="text-[11px] text-faint-foreground">{n.is_paused ? n.pause_reason : `${nProducts.length} bundles · ${open ? "hide" : "show"}`}</p>
                  </button>
                  <label className="flex items-center gap-1.5 text-[11px] text-faint-foreground">Delivered by
                    <select value={routed?.code ?? ""} onChange={(e) => void call("admin_set_network_supplier", { p_network_code: n.code, p_supplier_code: e.target.value }, `${n.name} now delivered by ${suppliers.find((s) => s.code === e.target.value)?.name ?? "default"}`)} className={`${inputCls} h-8 w-auto py-0 text-[12px]`}>
                      <option value="">Default (priority)</option>
                      {options.map((s) => <option key={s.id} value={s.code}>{s.name}{s.status !== "active" ? ` (${s.status})` : ""}</option>)}
                    </select>
                  </label>
                  {n.is_paused
                    ? <Button size="sm" variant="soft" onClick={() => void call("admin_pause_network", { p_network_code: n.code, p_paused: false, p_reason: null }, `${n.name} is back on`)}><Play size={13} />Resume</Button>
                    : <Button size="sm" variant="quiet" onClick={() => { setPausing({ kind: "network", id: n.code, label: n.name }); setReason(""); }}><Pause size={13} />Pause</Button>}
                </div>
                {routed && routed.status !== "active" && <p className="mt-1 text-[11px] text-amber">{routed.name} is {routed.status} — orders fall back to the next available supplier until it is activated.</p>}
                {open && (
                  <ul className="mt-2 divide-y divide-white/[0.05] border-t border-white/[0.06]">
                    {nProducts.map((p) => { const cost = costFor(p.id, routed?.id ?? null); const margin = cost != null ? Number(p.customer_price) - Number(cost) : null; return (
                      <Row key={p.id} primary={<>{p.capacity_gb}GB {p.is_paused && <Pill tone="warn">paused</Pill>}</>} secondary={p.is_paused ? p.pause_reason : cost != null ? `cost ${formatGHS(Number(cost))} · margin ${formatGHS(margin ?? 0)}` : "no cost from this supplier"}
                        right={formatGHS(Number(p.customer_price))}
                        rightNote={p.is_paused ? <button type="button" className="text-primary-glow" onClick={() => void call("admin_pause_product", { p_product_id: p.id, p_paused: false, p_reason: null }, `${n.name} ${p.capacity_gb}GB is back on`)}>resume</button> : <button type="button" className="text-faint-foreground hover:text-amber" onClick={() => { setPausing({ kind: "product", id: p.id, label: `${n.name} ${p.capacity_gb}GB` }); setReason(""); }}>pause</button>}
                        tone={margin != null && margin < 0 ? "bad" : "default"} />); })}
                  </ul>
                )}
              </li>
            );
          })}
        </Rows>
      </Panel>

      <DeliverySpeedCard />

      <Panel title="API activity" note={`${logs.length} recent calls`}>
        <Rows empty="No supplier requests yet.">
          {visibleLogs.map((l, i) => <Row key={`${l.created_at}-${i}`} primary={<span className="font-mono text-[12px]">{l.action} · {l.endpoint}</span>} secondary={`${formatAdminDate(l.created_at)}${l.error_message ? ` · ${l.error_message}` : ""}`} right={l.http_status ?? "—"} rightNote={<Pill tone={l.call_status === "success" ? "good" : "bad"}>{l.call_status}</Pill>} tone={l.call_status === "success" ? "default" : "bad"} />)}
        </Rows>
        <AdminListPagination page={page} pageSize={pageSize} totalItems={logs.length} onPageChange={setPage} onPageSizeChange={setPageSize} itemLabel="calls" />
      </Panel>

      <Modal open={pausing !== null} onClose={() => setPausing(null)} label="Pause">
        <div className="w-[min(92vw,400px)] p-5">
          <h2 className="text-[16px] font-semibold text-foreground">Pause {pausing?.label}</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">Customers will see it greyed out with this message and cannot buy it until you resume.</p>
          <div className="mt-3"><Field label="Message shown to customers"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Currently unavailable. Please try again later." className={inputCls} /></Field></div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="quiet" onClick={() => setPausing(null)}>Cancel</Button><Button onClick={() => void confirmPause()}>Pause</Button></div>
        </div>
      </Modal>
    </div>
  );
}
