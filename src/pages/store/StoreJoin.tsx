import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import StorePage from "@/components/store/StorePage";
import { useStore } from "@/components/store/StoreShell";
import { useAuth } from "@/store/auth-context";
import { setSignupStore } from "@/store/auth";
import { storeBase } from "@/lib/storeHost";
import { formatGHS } from "@/lib/format";

/* "Become an agent" on a parent's store: sign in or create an account, name your store, pay the fee (or start free). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p1 = () => (supabase as unknown as { schema: (s: string) => any }).schema("phase1");
export default function StoreJoin() {
  const store = useStore(); const navigate = useNavigate(); const { isAuthenticated, signIn, signUp } = useAuth();
  const [offer, setOffer] = useState<{ fee: number; pitch: string | null; agent_count: number } | null | undefined>(undefined);
  const [step, setStep] = useState<"intro" | "account" | "store">("intro"); const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-up");
  const [acc, setAcc] = useState({ fullName: "", email: "", phone: "", password: "" });
  const [shop, setShop] = useState({ store_name: "", slug: "", whatsapp: "" }); const [busy, setBusy] = useState(false);
  useEffect(() => { void p1().rpc("store_network_offer", { p_slug: store.slug }).then((r: { data: typeof offer }) => setOffer(r.data ?? null)); }, [store.slug]);
  useEffect(() => { if (isAuthenticated && step === "account") setStep("store"); }, [isAuthenticated, step]);
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  const doAccount = async () => {
    setBusy(true);
    try {
      if (mode === "sign-up") {
        const digits = acc.phone.replace(/\D/g, "");
        if (!acc.fullName.trim() || !/^0\d{9}$/.test(digits) || acc.password.length < 8 || !acc.email.trim()) { toast.error("Name, a valid 10-digit number, email, and a password of 8+ characters."); return; }
        setSignupStore(store.slug);
        const r = await signUp({ fullName: acc.fullName.trim(), email: acc.email.trim(), phone: digits, password: acc.password });
        if (r?.requiresEmailConfirmation) toast.success("Check your email to confirm, then come back here and sign in.");
      } else await signIn(acc.email.trim(), acc.password);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(false); }
  };
  const doStore = async () => {
    const slug = slugify(shop.slug || shop.store_name);
    if (!shop.store_name.trim() || slug.length < 3) return toast.error("A store name and a link name of at least 3 characters.");
    setBusy(true);
    const { data, error } = await p1().rpc("join_network", { p_parent_slug: store.slug, p_store_name: shop.store_name.trim(), p_slug: slug, p_whatsapp: shop.whatsapp.replace(/\D/g, "") || null });
    setBusy(false);
    if (error) { const m = error.message; return toast.error(m.includes("slug_taken") ? "That link name is taken; try another." : m.includes("already_an_agent") ? "This account already has a store. Sign in at datayego.com/agent." : m.includes("network_not_open") ? "This store isn't taking agents right now." : m.replace(/_/g, " ")); }
    toast.success(data.status === "active" ? "Your store is open!" : "Almost there: pay the fee to open your store.");
    window.location.assign("https://datayego.com/agent");
  };
  if (offer === undefined) return <div className="h-40" />;
  if (offer === null) return <section className="onyx-panel rounded-[22px] p-5 text-center"><p className="text-[14px] text-foreground">{store.store_name} isn't taking new agents right now.</p><Link to={storeBase(store.slug) || "/"} className="mt-3 inline-block text-[13px] font-semibold text-primary-glow">Back to the store</Link></section>;
  return (
    <StorePage title={`Sell data under ${store.store_name}`} lead="Your own online data store, your prices, your profit.">
    <div className="space-y-4">
      <section className="onyx-panel rounded-[22px] p-5">
        <p className="whitespace-pre-line text-[14px] leading-7 text-foreground">{offer.pitch?.trim() || `Get your own online data store, set your own prices and keep the profit on every sale. ${store.store_name} supplies the bundles and supports you.`}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-center">
          <div className="rounded-2xl bg-white/[0.03] py-3"><p className="text-[18px] font-semibold text-foreground">{Number(offer.fee) > 0 ? formatGHS(Number(offer.fee)) : "Free"}</p><p className="text-[11px] text-faint-foreground">{Number(offer.fee) > 0 ? "per month" : "no monthly fee"}</p></div>
          <div className="rounded-2xl bg-white/[0.03] py-3"><p className="text-[18px] font-semibold text-foreground">{offer.agent_count}</p><p className="text-[11px] text-faint-foreground">agents already</p></div>
        </div>
        {step === "intro" && <button type="button" onClick={() => setStep(isAuthenticated ? "store" : "account")} className="onyx-btn-primary mt-5 w-full py-3 text-[14px]">Start</button>}
      </section>
      {step === "account" && (
        <section className="onyx-panel rounded-[22px] p-5 space-y-3">
          <h2 className="text-[15px] font-semibold text-foreground">{mode === "sign-up" ? "Create your account" : "Sign in"}</h2>
          {mode === "sign-up" && <input value={acc.fullName} onChange={(e) => setAcc({ ...acc, fullName: e.target.value })} placeholder="Full name" className="onyx-field w-full" />}
          <input value={acc.email} onChange={(e) => setAcc({ ...acc, email: e.target.value })} type="email" placeholder="Email" autoCapitalize="none" className="onyx-field w-full" />
          {mode === "sign-up" && <input value={acc.phone} onChange={(e) => setAcc({ ...acc, phone: e.target.value })} inputMode="tel" placeholder="Phone number" className="onyx-field w-full" />}
          <input value={acc.password} onChange={(e) => setAcc({ ...acc, password: e.target.value })} type="password" placeholder="Password" className="onyx-field w-full" />
          <button type="button" disabled={busy} onClick={() => void doAccount()} className="onyx-btn-primary w-full py-3 text-[14px] disabled:opacity-60">{busy ? "Please wait…" : "Continue"}</button>
          <p className="text-center text-[12.5px] text-muted-foreground">{mode === "sign-up" ? <>Have an account? <button type="button" onClick={() => setMode("sign-in")} className="font-semibold text-primary-glow">Sign in</button></> : <>New here? <button type="button" onClick={() => setMode("sign-up")} className="font-semibold text-primary-glow">Create an account</button></>}</p>
        </section>
      )}
      {step === "store" && (
        <section className="onyx-panel rounded-[22px] p-5 space-y-3">
          <h2 className="text-[15px] font-semibold text-foreground">Name your store</h2>
          <input value={shop.store_name} onChange={(e) => setShop({ ...shop, store_name: e.target.value, slug: shop.slug || slugify(e.target.value) })} maxLength={60} placeholder="Store name, e.g. Kofi Data Hub" className="onyx-field w-full" />
          <div><input value={shop.slug} onChange={(e) => setShop({ ...shop, slug: slugify(e.target.value) })} maxLength={30} placeholder="link-name" className="onyx-field w-full" /><p className="mt-1 text-[11.5px] text-faint-foreground">Your store will be at <b className="text-foreground">{shop.slug || "link-name"}.datayego.com</b>{store.custom_domain_for_network ? ` and ${shop.slug || "link-name"}.${store.custom_domain_for_network}` : ""}.</p></div>
          <input value={shop.whatsapp} onChange={(e) => setShop({ ...shop, whatsapp: e.target.value })} inputMode="tel" placeholder="WhatsApp number for your customers" className="onyx-field w-full" />
          <button type="button" disabled={busy} onClick={() => void doStore()} className="onyx-btn-primary w-full py-3 text-[14px] disabled:opacity-60">{busy ? "Creating…" : Number(offer.fee) > 0 ? `Create store and pay ${formatGHS(Number(offer.fee))}` : "Create my store"}</button>
          <p className="text-center text-[11.5px] text-faint-foreground">You'll manage it at datayego.com/agent.</p>
        </section>
      )}
    </div>
    </StorePage>
  );
}
