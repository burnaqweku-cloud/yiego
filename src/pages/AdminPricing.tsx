import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, Save } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminRecordModal, { AdminDetailsButton } from "@/components/admin/AdminRecordModal";
import AdminStatStrip from "@/components/admin/AdminStatStrip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { adminDatabase } from "@/lib/admin-data";
import { formatGHS } from "@/lib/format";

interface PricingRow {
  id: string;
  app_product_code: string | null;
  name: string;
  capacity_gb: number | string;
  customer_price: number | string;
  cost_price: number | string | null;
  is_active: boolean;
  updated_at: string;
  networks: { name: string; code: string } | null;
  supplier_product_mappings: Array<{ supplier_price: number | string | null; is_active: boolean }>;
}

function supplierCost(row: PricingRow) {
  const mapped = row.supplier_product_mappings.find((item) => item.is_active)?.supplier_price;
  return Number(mapped ?? row.cost_price ?? 0);
}

function marginPercent(row: PricingRow) {
  const cost = supplierCost(row);
  if (cost <= 0) return 0;
  return ((Number(row.customer_price) - cost) / cost) * 100;
}

export default function AdminPricing() {
  const [rows, setRows] = useState<PricingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [network, setNetwork] = useState("all");
  const [selected, setSelected] = useState<PricingRow | null>(null);
  const [price, setPrice] = useState("");
  const [active, setActive] = useState(true);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await adminDatabase()
      .from<PricingRow>("data_products")
      .select("id, app_product_code, name, capacity_gb, customer_price, cost_price, is_active, updated_at, networks(name, code), supplier_product_mappings(supplier_price, is_active)")
      .order("display_order", { ascending: true });
    if (error) {
      toast.error("Could not load the selling catalogue.");
      setRows([]);
    } else setRows((data ?? []) as PricingRow[]);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const networks = useMemo(() => Array.from(new Set(rows.map((row) => row.networks?.name).filter(Boolean) as string[])), [rows]);
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => (network === "all" || row.networks?.name === network) && (!needle || row.name.toLowerCase().includes(needle) || row.app_product_code?.toLowerCase().includes(needle) || row.networks?.name.toLowerCase().includes(needle)));
  }, [network, rows, search]);

  const belowCost = rows.filter((row) => Number(row.customer_price) < supplierCost(row)).length;
  const atCost = rows.filter((row) => Number(row.customer_price) === supplierCost(row)).length;
  const customPriced = rows.filter((row) => Number(row.customer_price) !== supplierCost(row)).length;

  const openDetails = (row: PricingRow) => {
    setSelected(row);
    setPrice(Number(row.customer_price).toFixed(2));
    setActive(row.is_active);
    setReason("");
  };

  const save = async () => {
    if (!selected) return;
    const nextPrice = Number(price);
    if (!Number.isFinite(nextPrice) || nextPrice < 0) return toast.error("Enter a valid selling price.");
    if (nextPrice < supplierCost(selected) && !window.confirm("This selling price is below the supplier cost. Save it anyway?")) return;
    setSaving(true);
    const { data, error } = await supabase.functions.invoke<{ status?: string; error?: string }>("admin-catalog-action", { body: { productId: selected.id, customerPrice: nextPrice, isActive: active, reason: reason.trim() } });
    setSaving(false);
    if (error || data?.error) return toast.error(data?.error ?? error?.message ?? "Could not update this bundle.");
    toast.success("Selling price updated.");
    setSelected(null);
    await load();
  };

  return (
    <div className="space-y-7">
      <AdminPageHeader eyebrow="Sales management" title="Data pricing" description="Set YieGo's customer prices while keeping live supplier costs visible for margin decisions." />
      <AdminStatStrip loading={loading} items={[
        { label: "Bundles", value: rows.length },
        { label: "Custom", value: customPriced },
        { label: "At cost", value: atCost },
        { label: "Below cost", value: belowCost, tone: belowCost ? "danger" : "success" },
      ]} />

      <Card><CardContent>
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_220px]">
          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/10 px-4 py-3"><Search size={17} className="text-faint-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search bundle or product code" className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-faint-foreground" /></label>
          <select value={network} onChange={(event) => setNetwork(event.target.value)} className="onyx-field"><option value="all">All networks</option>{networks.map((item) => <option key={item} value={item}>{item}</option>)}</select>
        </div>
        <div className="mt-5 space-y-3 md:hidden">{visible.map((row) => <article key={row.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate font-semibold text-white">{row.name}</p><Badge variant={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Hidden"}</Badge></div><p className="mt-1 text-xs text-muted-foreground">{row.networks?.name ?? "Network"} · Cost {formatGHS(supplierCost(row))}</p><p className="mt-2 font-display font-semibold text-primary-glow">Sell {formatGHS(Number(row.customer_price))}</p></div><AdminDetailsButton label={`View ${row.name} pricing`} onClick={() => openDetails(row)} /></article>)}</div>
        <div className="mt-5 hidden overflow-x-auto md:block"><table className="w-full min-w-[820px] text-left text-sm"><thead><tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-[0.15em] text-faint-foreground"><th className="pb-3">Bundle</th><th className="pb-3">Supplier cost</th><th className="pb-3">Selling price</th><th className="pb-3">Profit</th><th className="pb-3">Margin</th><th className="pb-3">Status</th><th className="pb-3 text-right">Details</th></tr></thead><tbody>{visible.map((row) => { const cost = supplierCost(row); const profit = Number(row.customer_price) - cost; return <tr key={row.id} className="border-b border-white/[0.055] last:border-0"><td className="py-4"><p className="font-semibold text-white">{row.name}</p><p className="mt-1 text-xs text-muted-foreground">{row.networks?.name} · {row.app_product_code}</p></td><td className="py-4 text-muted-foreground">{formatGHS(cost)}</td><td className="py-4 font-display font-semibold text-white">{formatGHS(Number(row.customer_price))}</td><td className={`py-4 font-semibold ${profit < 0 ? "text-danger" : profit > 0 ? "text-success" : "text-muted-foreground"}`}>{formatGHS(profit)}</td><td className="py-4 text-muted-foreground">{marginPercent(row).toFixed(1)}%</td><td className="py-4"><Badge variant={row.is_active ? "success" : "neutral"}>{row.is_active ? "Active" : "Hidden"}</Badge></td><td className="py-4 text-right"><AdminDetailsButton label={`View ${row.name} pricing`} onClick={() => openDetails(row)} /></td></tr>; })}</tbody></table></div>
        {!loading && visible.length === 0 && <div className="grid min-h-48 place-items-center text-sm text-muted-foreground">No matching bundles.</div>}
      </CardContent></Card>

      <AdminRecordModal open={Boolean(selected)} onClose={() => setSelected(null)} title={selected?.name ?? "Bundle"} subtitle={`${selected?.networks?.name ?? "Network"} · ${selected?.app_product_code ?? "Product"}`} fields={selected ? [
        { label: "Supplier cost", value: formatGHS(supplierCost(selected)) },
        { label: "Current selling price", value: formatGHS(Number(selected.customer_price)) },
        { label: "Profit per sale", value: formatGHS(Number(selected.customer_price) - supplierCost(selected)) },
        { label: "Margin", value: `${marginPercent(selected).toFixed(1)}%` },
        { label: "Availability", value: selected.is_active ? "Active" : "Hidden" },
        { label: "Last updated", value: new Date(selected.updated_at).toLocaleString("en-GH") },
      ] : []}>
        <div><h3 className="font-display text-lg font-semibold text-white">Edit selling price</h3><div className="mt-4 grid gap-4">
          <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Selling price (GHS)</span><input className="onyx-field" value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" /></label>
          <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4"><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /><span><span className="block text-sm font-semibold text-white">Available for sale</span><span className="text-xs text-muted-foreground">Turn off to hide this bundle from customers.</span></span></label>
          <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Reason for change <span className="font-normal text-faint-foreground">(optional)</span></span><textarea className="onyx-field min-h-24 resize-y" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Example: Supplier cost increased" /></label>
          <Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Save pricing</Button>
        </div></div>
      </AdminRecordModal>
    </div>
  );
}
