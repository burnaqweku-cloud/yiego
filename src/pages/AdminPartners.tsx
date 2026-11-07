import { useCallback, useEffect, useState } from "react";
import { Copy, Handshake, Plus, RefreshCw, Tags } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Field, inputCls, Money, Panel, Pill, Stat, StatGrid } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { formatGHS } from "@/lib/format";
import { createPartner, loadAdminPartners, PARTNER_PACKAGES, partnerLink, payPartner, setPartnerRate, updatePartner, type AdminPartner, type AdminPartnerRate, type PartnerPackage } from "@/lib/partners";

const friendly = (m: string) => m.includes("no_account") ? "No DataYego account uses that email. Ask them to sign up first."
  : m.includes("duplicate") ? "That person or code is already a partner." : m.includes("master") ? "Only the master admin (with 2-step sign-in) can do this."
  : m.includes("nothing_owed") ? "Nothing is owed to this partner." : "Something went wrong. Try again.";

export default function AdminPartners() {
  const [partners, setPartners] = useState<AdminPartner[]>([]);
  const [rates, setRates] = useState<AdminPartnerRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState<AdminPartner | null>(null);
  const [form, setForm] = useState({ email: "", name: "", code: "" });
  const [payRef, setPayRef] = useState("");
  const [edit, setEdit] = useState<Record<string, { starter: string; pro: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await loadAdminPartners();
    if (error) toast.error(friendly(error.message));
    setPartners(data?.partners ?? []); setRates(data?.rates ?? []); setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const owed = partners.reduce((a, p) => a + Number(p.owed), 0);
  const run = async (p: PromiseLike<{ error: { message: string } | null }>, ok: string) => {
    const { error } = await p; if (error) { toast.error(friendly(error.message)); return false; }
    toast.success(ok); await load(); return true;
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Partners" subtitle="Influencers earn a fixed amount on every delivered order from their link." action={<Button variant="quiet" size="sm" onClick={() => void load()}><RefreshCw />Refresh</Button>} />
      <StatGrid cols={3}>
        <Stat label="Owed to partners" value={<Money value={owed} />} note="Shown in Finance under Money we owe" loading={loading} />
        <Stat label="Partners" value={partners.length} loading={loading} />
        <Stat label="Orders this week" value={partners.reduce((a, p) => a + Number(p.orders_week), 0)} loading={loading} />
      </StatGrid>

      <Panel title="Partners" icon={Handshake} action={<Button size="sm" onClick={() => setAdding(true)}><Plus />Add partner</Button>}>
        {partners.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">{loading ? "Loading…" : "No partners yet."}</p> : (
          <div className="space-y-3">
            {partners.map((p) => (
              <article key={p.id} className="rounded-xl border border-border bg-card/40 p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold">{p.name} <Pill tone={p.status === "active" ? "good" : "muted"}>{p.status}</Pill></p>
                    <p className="truncate text-xs text-muted-foreground">{p.email} · code {p.code}</p>
                  </div>
                  <div className="text-right"><p className="text-xs text-muted-foreground">Owed</p><p className="font-semibold"><Money value={p.owed} /></p></div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">{p.orders_week} orders this week · {p.orders_total} total · paid {formatGHS(Number(p.paid))}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select className={`${inputCls} w-auto`} value={p.package} onChange={(e) => void run(updatePartner(p.id, { package: e.target.value as PartnerPackage }), "Package updated")}>
                    {(Object.keys(PARTNER_PACKAGES) as PartnerPackage[]).map((k) => <option key={k} value={k}>{PARTNER_PACKAGES[k].name}</option>)}
                  </select>
                  <Button size="sm" variant="quiet" onClick={() => { void navigator.clipboard.writeText(partnerLink(p.code)); toast.success("Link copied"); }}><Copy />Link</Button>
                  <Button size="sm" variant="quiet" onClick={() => void run(updatePartner(p.id, { status: p.status === "active" ? "paused" : "active" }), p.status === "active" ? "Paused" : "Reactivated")}>{p.status === "active" ? "Pause" : "Reactivate"}</Button>
                  <Button size="sm" variant="soft" disabled={Number(p.owed) <= 0} onClick={() => { setPayRef(""); setPaying(p); }}>Mark paid</Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Earning per delivered order" icon={Tags} note="Starter = 40% and Pro = 60% of our bundle margin. Premier partners earn Pro rates until you agree custom terms. Bundles at 0 earn nothing.">
        <div className="space-y-1.5">
          {rates.filter((r) => r.network.toLowerCase().includes("mtn") || r.starter > 0 || r.pro > 0).map((r) => {
            const e = edit[r.product_id];
            return (
              <div key={r.product_id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{r.name}</span>
                {e ? <>
                  <input className={`${inputCls} w-20`} inputMode="decimal" value={e.starter} onChange={(x) => setEdit({ ...edit, [r.product_id]: { ...e, starter: x.target.value } })} aria-label="Starter" />
                  <input className={`${inputCls} w-20`} inputMode="decimal" value={e.pro} onChange={(x) => setEdit({ ...edit, [r.product_id]: { ...e, pro: x.target.value } })} aria-label="Pro" />
                  <Button size="sm" onClick={async () => { if (await run(setPartnerRate(r.product_id, Number(e.starter), Number(e.pro)), "Rate saved")) { const n = { ...edit }; delete n[r.product_id]; setEdit(n); } }}>Save</Button>
                </> : <>
                  <span className="w-20 text-right">{formatGHS(r.starter)}</span>
                  <span className="w-20 text-right text-muted-foreground">{formatGHS(r.pro)}</span>
                  <Button size="sm" variant="quiet" onClick={() => setEdit({ ...edit, [r.product_id]: { starter: String(r.starter), pro: String(r.pro) } })}>Edit</Button>
                </>}
              </div>
            );
          })}
          <p className="pt-1 text-xs text-muted-foreground">Columns: Starter · Pro</p>
        </div>
      </Panel>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add partner">
        <div className="space-y-3">
          <Field label="Their DataYego account email" hint="They must have signed up already."><input className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Name or channel"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Link code (optional)" hint="Letters and numbers. Left empty, one is made from the name."><input className={inputCls} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} /></Field>
          <Button className="w-full" disabled={!form.email || !form.name} onClick={async () => { if (await run(createPartner(form.email, form.name, form.code), "Partner added")) { setAdding(false); setForm({ email: "", name: "", code: "" }); } }}>Add partner</Button>
        </div>
      </Modal>

      <Modal open={!!paying} onClose={() => setPaying(null)} title="Mark partner paid">
        {paying && <div className="space-y-3">
          <p className="text-sm">Pay <b>{paying.name}</b> <b>{formatGHS(Number(paying.owed))}</b>{paying.momo_number ? ` on ${paying.momo_number}` : ""}. Send the money first, then confirm here. This takes it out of Money at bank and clears what we owe them.</p>
          <Field label="Payment reference (optional)"><input className={inputCls} value={payRef} onChange={(e) => setPayRef(e.target.value)} /></Field>
          <Button className="w-full" onClick={async () => { if (await run(payPartner(paying.id, payRef), "Payout recorded")) setPaying(null); }}>Confirm paid</Button>
        </div>}
      </Modal>
    </div>
  );
}
