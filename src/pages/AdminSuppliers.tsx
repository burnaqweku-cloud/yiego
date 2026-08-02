import { useCallback, useEffect, useState } from "react";
import { DatabaseZap, RefreshCw, Store } from "lucide-react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  adminDatabase,
  formatAdminDate,
  readableStatus,
  supplierNetworkName,
  type SupplierLogRow,
  type SupplierPackage,
  type SupplierPackageResponse,
} from "@/lib/admin-data";

export default function AdminSuppliers() {
  const [logs, setLogs] = useState<SupplierLogRow[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [packages, setPackages] = useState<Record<string, SupplierPackage[]>>({});
  const [pricingTier, setPricingTier] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);

  const refreshPrices = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: invokeError } = await supabase.functions.invoke<SupplierPackageResponse>("datamartgh-get-packages");
    if (invokeError || !data || data.status !== "success") {
      setPackages({});
      setError("Could not load the current DataMartGH catalogue. Try again in a moment.");
    } else {
      setPackages(data.data ?? {});
      setPricingTier(data.pricingTier ?? null);
      setCheckedAt(new Date());
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      adminDatabase().from<SupplierLogRow[]>("supplier_api_logs").select("action, endpoint, http_status, call_status, created_at").order("created_at", { ascending: false }).limit(10),
      adminDatabase().from<{ balance: number | string }[]>("suppliers").select("balance").limit(1),
    ]).then(([logResult, supplierResult]) => {
      if (!mounted) return;
      setLogs(logResult.data ?? []);
      const supplierBalance = supplierResult.data?.[0]?.balance;
      setBalance(supplierBalance === undefined || supplierBalance === null ? null : Number(supplierBalance));
    });
    void refreshPrices();
    return () => { mounted = false; };
  }, [refreshPrices]);

  const bundleCount = Object.values(packages).reduce((total, list) => total + list.length, 0);

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Business"
        title="Suppliers"
        description="Monitor the DataMartGH connection, inspect direct supplier costs and review recent API activity. Supplier credentials remain on the backend."
        action={<Button variant="ghost" size="sm" onClick={() => void refreshPrices()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />Refresh prices</Button>}
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <Card><CardContent><Store className="text-primary-glow" size={19} /><p className="mt-4 text-xs uppercase tracking-[0.14em] text-faint-foreground">Connection</p><div className="mt-2 flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-success" /><p className="font-display text-xl font-semibold text-white">Active</p></div></CardContent></Card>
        <Card><CardContent><DatabaseZap className="text-primary-glow" size={19} /><p className="mt-4 text-xs uppercase tracking-[0.14em] text-faint-foreground">Recorded balance</p><p className="mt-2 font-display text-xl font-semibold text-white">{balance === null ? "Unavailable" : `GH₵${balance.toFixed(2)}`}</p></CardContent></Card>
        <Card><CardContent><RefreshCw className="text-primary-glow" size={19} /><p className="mt-4 text-xs uppercase tracking-[0.14em] text-faint-foreground">Live catalogue</p><p className="mt-2 font-display text-xl font-semibold text-white">{loading ? "—" : `${bundleCount} bundles`}</p><p className="mt-1 text-xs text-muted-foreground">{pricingTier ?? "Supplier tier"}</p></CardContent></Card>
      </section>

      <Card>
        <CardHeader className="items-start"><div><div className="flex flex-wrap items-center gap-2"><CardTitle>Direct supplier prices</CardTitle><Badge variant="success">Live cost</Badge>{pricingTier && <Badge variant="neutral">{pricingTier}</Badge>}</div><p className="mt-2 text-sm text-muted-foreground">These are DataMartGH costs, kept separate from YieGo's customer selling prices.</p></div></CardHeader>
        <CardContent>
          {loading && Object.keys(packages).length === 0 ? <div className="grid min-h-48 place-items-center text-sm text-muted-foreground"><div className="text-center"><RefreshCw className="mx-auto mb-3 animate-spin text-primary-glow" size={23} />Loading current supplier catalogue…</div></div> : error ? <div className="rounded-2xl border border-amber/20 bg-amber/[0.06] p-5 text-sm text-amber">{error}</div> : (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{Object.entries(packages).map(([networkCode, list]) => <section key={networkCode} className="rounded-2xl border border-white/[0.08] bg-white/[0.025] p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="font-display text-lg font-semibold text-white">{supplierNetworkName(networkCode)}</h3><p className="mt-0.5 text-xs text-faint-foreground">{networkCode}</p></div><Badge variant="neutral">{list.length}</Badge></div><div className="mt-4 max-h-96 space-y-1.5 overflow-y-auto pr-1">{list.map((item) => <div key={`${networkCode}-${item.capacity}`} className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2.5"><div className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${item.inStock ? "bg-success" : "bg-danger"}`} /><span className="text-sm font-medium text-white">{item.capacity}GB</span></div><span className="font-display text-sm font-semibold text-primary-glow">GH₵{Number(item.price).toFixed(2)}</span></div>)}</div></section>)}</div>
              <p className="mt-4 text-xs text-faint-foreground">{checkedAt ? `Last refreshed at ${checkedAt.toLocaleTimeString()}.` : ""} Refresh before changing customer catalogue prices.</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><div><CardTitle>API activity</CardTitle><p className="mt-1 text-xs text-faint-foreground">Recent DataMartGH requests</p></div><Badge variant="neutral">Live log</Badge></CardHeader>
        <CardContent>{logs.length === 0 ? <p className="py-6 text-sm text-muted-foreground">No supplier requests yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead><tr className="border-b border-white/[0.08] text-[10px] uppercase tracking-[0.15em] text-faint-foreground"><th className="pb-3">Action</th><th className="pb-3">Endpoint</th><th className="pb-3">Result</th><th className="pb-3 text-right">Time</th></tr></thead><tbody>{logs.map((log) => <tr key={`${log.endpoint}-${log.created_at}`} className="border-b border-white/[0.05] last:border-0"><td className="py-4 font-semibold text-white">{readableStatus(log.action)}</td><td className="py-4 text-muted-foreground">{log.endpoint}</td><td className="py-4"><Badge variant={log.call_status === "success" ? "success" : "amber"}>{readableStatus(log.call_status)} · {log.http_status ?? "n/a"}</Badge></td><td className="py-4 text-right text-xs text-muted-foreground">{formatAdminDate(log.created_at)}</td></tr>)}</tbody></table></div>}</CardContent>
      </Card>
    </div>
  );
}
