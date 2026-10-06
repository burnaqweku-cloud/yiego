import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Copy, Gift, Share2, Store, Tag, Wallet } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/ui/modal";
import { FlowHeader } from "@/components/flows/flow-parts";
import { useAuth } from "@/store/auth-context";
import { inviteLink, myReferrals, type ReferralSummary } from "@/lib/referrals";
import { formatGHS } from "@/lib/format";

/* Invite & earn popup: how it works, your link, share. Guests are sent to sign up. */
export default function InviteSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { isAuthenticated } = useAuth();
  const [data, setData] = useState<ReferralSummary | null>(null); const [copied, setCopied] = useState(false);
  useEffect(() => { if (open && isAuthenticated) void myReferrals().then(setData); }, [open, isAuthenticated]);
  const reward = formatGHS(data?.reward ?? 1); const agentReward = formatGHS(data?.agent_reward ?? 5);
  const link = data?.code ? inviteLink(data.code) : null;
  const text = link ? `Buy MTN, Telecel and AirtelTigo data on DataYego — usually delivered within minutes. Sign up with my link and get the referral price on your first bundle: ${link}` : "";
  const copy = async () => { if (!link) return; try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { toast.error("Couldn't copy. Long-press the link instead."); } };
  const share = async () => {
    if (!link) return;
    if (navigator.share) { try { await navigator.share({ title: "DataYego", text, url: link }); return; } catch { /* cancelled */ } }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
  };
  return (
    <Modal open={open} onClose={onClose} label="Invite and earn">
      <FlowHeader title="Invite & earn" subtitle="Invite a friend. Earn free data." onClose={onClose} />
      <div className="min-w-0 space-y-4 px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-4">
        <div className="rounded-2xl border border-primary-glow/20 bg-primary/[0.07] p-4 text-center"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-primary-glow"><Gift size={22} /></span><p className="mt-2 font-display text-[18px] font-semibold leading-tight text-foreground">Get free data</p><p className="mt-1 text-[13px] text-muted-foreground">Invite a friend. Earn {reward} in data, or {agentReward} if they become an agent.</p></div>
        <ul className="space-y-3 text-[13px] leading-5 text-muted-foreground">
          <li className="flex min-w-0 gap-3"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-primary-glow"><Tag size={15} /></span><span>Your friend gets the <b className="text-foreground">referral price</b> (our agent price) on their first bundle, any network, any size.</span></li>
          <li className="flex min-w-0 gap-3"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-primary-glow"><Wallet size={15} /></span><span>You get <b className="text-foreground">{reward} in your DataYego wallet</b> once their first order is delivered. Spend it on data. No limit on friends.</span></li>
          <li className="flex min-w-0 gap-3"><span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-primary-glow"><Store size={15} /></span><span>If your friend <b className="text-foreground">becomes a DataYego agent</b> and pays their first month, you get another <b className="text-foreground">{agentReward}</b>.</span></li>
        </ul>
        {isAuthenticated ? (<>
          <div><p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">Your link</p>
            <div className="mt-1.5 flex min-w-0 items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5"><span className="min-w-0 flex-1 truncate text-[13px] text-foreground">{link ? link.replace(/^https?:\/\//, "") : "…"}</span><button type="button" onClick={() => void copy()} className="shrink-0 text-primary-glow" aria-label="Copy link">{copied ? <Check size={17} /> : <Copy size={17} />}</button></div></div>
          <button type="button" disabled={!link} onClick={() => void share()} className="onyx-btn-primary flex w-full items-center justify-center gap-2 py-3 text-[14px] disabled:opacity-60"><Share2 size={16} />Share on WhatsApp</button>
          <Link to="/account" onClick={onClose} className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-primary-glow">See my referrals <ArrowRight size={14} /></Link>
        </>) : (<>
          <Link to="/auth?mode=signup" onClick={onClose} className="onyx-btn-primary block w-full py-3 text-center text-[14px]">Sign up to get your link</Link>
          <p className="text-center text-[12px] text-faint-foreground">Already have an account? <Link to="/auth" onClick={onClose} className="font-semibold text-primary-glow">Sign in</Link></p>
        </>)}
      </div>
    </Modal>
  );
}
