import { useEffect, useState } from "react";
import { Check, Copy, Gift, Share2 } from "lucide-react";
import { toast } from "sonner";
import { inviteLink, myReferrals, type ReferralSummary } from "@/lib/referrals";
import { formatGHS } from "@/lib/format";

/* "Invite & earn" on the account page: the link, a share button, and who's joined. */
export default function InviteCard() {
  const [data, setData] = useState<ReferralSummary | null>(null); const [copied, setCopied] = useState(false);
  useEffect(() => { void myReferrals().then(setData); }, []);
  if (!data?.code) return null;
  const link = inviteLink(data.code);
  const text = `Buy MTN, Telecel and AirtelTigo data on DataYego — delivered in minutes. Sign up with my link and your first bundle is at agent price: ${link}`;
  const copy = async () => { try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { toast.error("Couldn't copy. Long-press the link instead."); } };
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: "DataYego", text, url: link }); return; } catch { /* cancelled */ } }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  const when = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return (
    <section className="onyx-panel rounded-[24px] p-6">
      <div className="flex items-center gap-3"><span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/15 text-primary-glow"><Gift size={20} /></span>
        <div><p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Invite &amp; earn</p><h2 className="font-display text-[19px] font-semibold leading-tight text-foreground">Give a friend agent prices. Get {formatGHS(data.reward)} in data.</h2></div></div>
      <p className="mt-3 text-[13px] leading-6 text-muted-foreground">Share your link. Your friend's first bundle is at agent price, and once it's delivered, {formatGHS(data.reward)} lands in your DataYego wallet. No limit on how many friends.</p>
      <div className="mt-4 flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5"><span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{link.replace(/^https?:\/\//, "")}</span><button type="button" onClick={() => void copy()} className="shrink-0 text-primary-glow" aria-label="Copy link">{copied ? <Check size={17} /> : <Copy size={17} />}</button></div>
      <button type="button" onClick={() => void share()} className="onyx-btn-primary mt-3 flex w-full items-center justify-center gap-2 py-3 text-[14px]"><Share2 size={16} />Share on WhatsApp</button>
      <div className="mt-5 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-2xl bg-white/[0.03] py-3"><p className="text-[18px] font-semibold tabular-nums text-foreground">{data.invited}</p><p className="text-[11px] text-faint-foreground">Joined</p></div>
        <div className="rounded-2xl bg-white/[0.03] py-3"><p className="text-[18px] font-semibold tabular-nums text-foreground">{data.rewarded}</p><p className="text-[11px] text-faint-foreground">Rewarded</p></div>
        <div className="rounded-2xl bg-white/[0.03] py-3"><p className="text-[18px] font-semibold tabular-nums text-primary-glow">{formatGHS(data.earned)}</p><p className="text-[11px] text-faint-foreground">Earned</p></div>
      </div>
      {data.list.length > 0 && <ul className="mt-4 divide-y divide-white/[0.06]">{data.list.slice(0, 20).map((f, i) => (
        <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-[13px]"><div className="min-w-0"><p className="truncate font-medium text-foreground">{f.name}</p><p className="text-[11px] text-faint-foreground">Joined {when(f.joined)}</p></div>
          <span className={`shrink-0 text-[12px] ${f.status === "rewarded" ? "font-semibold text-primary-glow" : "text-faint-foreground"}`}>{f.status === "rewarded" ? `+${formatGHS(f.amount ?? data.reward)}` : f.status === "waiting" ? "Waiting for first order" : f.status === "reversed" ? "Reversed" : "Not eligible"}</span></li>))}
      </ul>}
    </section>
  );
}
