import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "@/store/auth-context";
import { Gift, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import Seo from "@/components/seo/Seo";
import BuyDataFlow, { type BuyPreselect } from "@/components/flows/BuyDataFlow";
import { supabase } from "@/integrations/supabase/client";
import { deviceHash } from "@/lib/device";
import { formatGHS } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

/* A giveaway link: one bundle at a special price, one claim per number (and device/account), hidden cap.
   The page never shows how many are left; when the cap is hit it simply reads as ended. */
interface Campaign { slug: string; title: string; blurb: string | null; price: number; normal_price: number; product_id: string; product_code: string | null; product_name: string; network: string; network_code: string; validity: string | null; open: boolean; require_account: boolean }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p1 = () => (supabase as unknown as { schema: (s: string) => any }).schema("phase1");

export default function Giveaway() {
  const { slug: slugParam } = useParams(); const { isAuthenticated } = useAuth();
  const [c, setC] = useState<Campaign | null | undefined>(undefined);
  const slug = slugParam ?? (c?.slug ?? "");
  const [phone, setPhone] = useState(""); const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false); const [preselect, setPreselect] = useState<BuyPreselect | null>(null);
  useEffect(() => { const q = slugParam ? p1().rpc("campaign_public", { p_slug: slugParam }) : p1().rpc("campaign_current", {}); void q.then((r: { data: Campaign | null }) => setC(r.data ?? null)); }, [slugParam]);
  const claim = async () => {
    if (!c) return;
    const digits = phone.replace(/\D/g, "");
    if (!/^0\d{9}$/.test(digits)) return toast.error("Enter the 10-digit number that should receive the data.");
    setBusy(true);
    const dev = await deviceHash().catch(() => null);
    const { data, error } = await p1().rpc("campaign_claim", { p_slug: c.slug, p_phone: digits, p_device: dev });
    setBusy(false);
    if (error) {
      const m = error.message;
      return toast.error(m.includes("order_in_progress") ? "This number has an order in progress. Wait until it is delivered, then come back and claim; your place isn't lost." : m.includes("unpaid_order_open") ? "This number has an unpaid order from the last few minutes. Pay or let it expire, then claim here." : m.includes("sign_in_required") ? "Sign in or create a free account to claim." : m.includes("phone_used") ? "This number has already had its giveaway bundle." : m.includes("device_used") || m.includes("account_used") ? "This giveaway is one per person, and this phone has already claimed one." : m.includes("wrong_network") ? `That number isn't on ${c.network}. The giveaway is for ${c.network} numbers.` : m.includes("campaign_full") || m.includes("campaign_closed") ? "This giveaway has ended. Thank you to everyone who took part!" : "Couldn't claim right now. Try again.");
    }
    setPreselect({ kind: "bundle", networkId: c.network_code as "mtn" | "telecel" | "at", productCode: c.product_code ?? c.product_id, campaign: { token: data.token, price: Number(data.price), phone: data.phone, title: c.title } });
    setOpen(true);
  };
  const size = c?.product_name.replace(/^.*?—\s*/, "") ?? "";
  return (
    <div className="mx-auto w-full max-w-[640px]">
      <Seo path={slugParam ? `/g/${slugParam}` : "/giveaway"} title={c ? `${c.title} · DataYego` : "Giveaway · DataYego"} description={c?.blurb ?? "A DataYego giveaway."} />
      <Card className="w-full"><CardContent className="p-6 sm:p-8">
        {c === undefined && <p className="text-[14px] text-muted-foreground">Loading…</p>}
        {c === null && <><span className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.06] px-3 py-1 text-[12px] font-semibold text-muted-foreground"><Gift size={13} />Giveaways</span><h1 className="mt-3 font-display text-2xl font-semibold text-foreground">No active giveaway right now</h1><p className="mt-2 text-[14px] text-muted-foreground">Giveaways are announced on our WhatsApp channel first. Follow it and check back here; this page always shows the one that is running.</p><Button className="mt-5" onClick={() => (window.location.href = "/shop")}>Go to the shop</Button></>}
        {c && !c.open && <><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-glow">Giveaway</p><h1 className="mt-1 font-display text-2xl font-semibold text-foreground">{c.title}</h1><p className="mt-3 text-[14px] text-muted-foreground">This giveaway has ended. Thank you to everyone who took part. Normal prices are on the shop.</p><Button className="mt-5" onClick={() => (window.location.href = "/shop")}>Go to the shop</Button></>}
        {c && c.open && (
          <>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-[12px] font-semibold text-primary-glow"><Gift size={13} />Giveaway</span>
            <h1 className="mt-3 font-display text-[28px] font-semibold leading-tight text-foreground sm:text-[34px]">{c.title}</h1>
            {c.blurb && <p className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground">{c.blurb}</p>}
            <div className="mt-5 flex items-end gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
              <div><p className="text-[12px] text-faint-foreground">{c.network} · {size}{c.validity ? ` · ${c.validity}` : ""}</p><p className="mt-1 font-display text-[30px] font-semibold text-foreground">{formatGHS(c.price)}</p></div>
              <p className="pb-2 text-[14px] text-faint-foreground line-through">{formatGHS(c.normal_price)}</p>
            </div>
            {c.require_account && !isAuthenticated ? (
              <div className="mt-5 rounded-2xl border border-primary/30 bg-primary/10 p-4"><p className="text-[14px] font-semibold text-foreground">Sign in to claim</p><p className="mt-1 text-[13px] text-muted-foreground">This giveaway is for DataYego account holders. Creating an account is free and takes a minute; it also keeps your orders and receipts in one place.</p><div className="mt-3 flex flex-wrap gap-2"><Link to={`/auth?next=${encodeURIComponent(slugParam ? `/g/${slugParam}` : "/giveaway")}`} className="onyx-btn-primary px-4 py-2.5 text-[13.5px]">Sign in / Create account</Link></div></div>
            ) : (<>
            <label className="mt-5 block"><span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{c.network} number to receive the data</span><input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))} inputMode="tel" placeholder="024 000 0000" className="onyx-field w-full text-[18px] tracking-wide" /></label>
            <p className="mt-2 text-[12px] text-faint-foreground">One giveaway bundle per number. Check the number carefully; data sent to a wrong number can't be recalled. If the number has an order still delivering, finish that first and come back.</p>
            <Button className="mt-4 w-full py-3 text-[15px]" disabled={busy} onClick={() => void claim()}>{busy ? "Checking…" : `Claim and pay ${formatGHS(c.price)}`}</Button>
            </>)}
            <div className="mt-5 grid grid-cols-2 gap-3 text-[12.5px] text-muted-foreground"><span className="inline-flex items-center gap-1.5"><Zap size={14} className="text-primary-glow" />Delivered automatically</span><span className="inline-flex items-center gap-1.5"><ShieldCheck size={14} className="text-primary-glow" />Pay by MoMo or card</span></div>
          </>
        )}
      </CardContent></Card>
      <BuyDataFlow open={open} preselect={preselect} onClose={() => setOpen(false)} onAddMoney={() => undefined} />
    </div>
  );
}
