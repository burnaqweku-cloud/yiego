import { useEffect, useState } from "react";
import { storeBase } from "@/lib/storeHost";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useStore } from "@/components/store/StoreShell";
import StorePage from "@/components/store/StorePage";
import { useAuth } from "@/store/auth-context";
import { setSignupStore } from "@/store/auth";

/* Sign up / sign in on the agent's store. Accounts created here belong to this store. */
export default function StoreAuth({ mode }: { mode: "sign-in" | "sign-up" }) {
  const store = useStore(); const { slug: paramSlug } = useParams(); const slug = paramSlug ?? store.slug; const navigate = useNavigate();
  const { isAuthenticated, signIn, signUp } = useAuth();
  const [f, setF] = useState({ fullName: "", email: "", phone: "", password: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (isAuthenticated) navigate(`${storeBase(slug)}/account`, { replace: true }); }, [isAuthenticated, slug, navigate]);
  const digits = f.phone.replace(/\D/g, "");
  const phoneValid = /^0\d{9}$/.test(digits);
  const passwordValid = f.password.length >= 8 && /[A-Z]/.test(f.password) && /[a-z]/.test(f.password) && /\d/.test(f.password);
  const submit = async () => {
    setBusy(true);
    try {
      if (mode === "sign-up") {
        if (!f.fullName.trim() || !phoneValid || !passwordValid || !f.email.trim()) { toast.error("Check your details: a name, a valid 10-digit number, and a password with upper and lower case and a number."); return; }
        setSignupStore(store.slug);
        const result = await signUp({ fullName: f.fullName.trim(), email: f.email.trim(), phone: digits, password: f.password });
        if (result?.requiresEmailConfirmation) toast.success("Account created. Check your email to confirm, then sign in.");
        else toast.success(`Welcome to ${store.store_name}.`);
      } else {
        await signIn(f.email.trim(), f.password);
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(false); }
  };
  return (
    <StorePage narrow title={mode === "sign-up" ? "Create your account" : "Welcome back"} lead={mode === "sign-up" ? `An account with ${store.store_name} saves your number, keeps your orders in one place and lets you pay from a wallet.` : `Sign in to see your orders with ${store.store_name} and your wallet.`}>
    <section className="onyx-panel rounded-[22px] p-5">
      <div className="space-y-3">
        {mode === "sign-up" && <input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} placeholder="Full name" autoComplete="name" className="onyx-field w-full" />}
        <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} type="email" placeholder="Email" autoComplete="email" autoCapitalize="none" className="onyx-field w-full" />
        {mode === "sign-up" && <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} inputMode="tel" placeholder="Phone number (0XXXXXXXXX)" autoComplete="tel" className="onyx-field w-full" />}
        <input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} type="password" placeholder="Password" autoComplete={mode === "sign-up" ? "new-password" : "current-password"} className="onyx-field w-full" />
        {mode === "sign-up" && <p className="text-[11.5px] text-faint-foreground">At least 8 characters with upper and lower case and a number.</p>}
        <button type="button" disabled={busy} onClick={() => void submit()} className="onyx-btn-primary w-full py-3 text-[14px] disabled:opacity-60">{busy ? "Please wait…" : mode === "sign-up" ? "Create account" : "Sign in"}</button>
      </div>
      <p className="mt-4 text-center text-[12.5px] text-muted-foreground">{mode === "sign-up" ? <>Already have an account? <Link to={`${storeBase(slug)}/sign-in`} className="font-semibold text-primary-glow">Sign in</Link></> : <>New here? <Link to={`${storeBase(slug)}/sign-up`} className="font-semibold text-primary-glow">Create an account</Link></>}</p>
    </section>
    </StorePage>
  );
}
