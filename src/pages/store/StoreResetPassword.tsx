import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useStore } from "@/components/store/StoreShell";
import StorePage from "@/components/store/StorePage";
import { storeBase } from "@/lib/storeHost";
import { supabase } from "@/integrations/supabase/client";

/* The store's own "choose a new password" page (16 Nov 2026). The link in the store's reset email lands here with a
   one-time token; it is exchanged for a session, then the new password is saved. Everything on it is the store's:
   an agent's customer never meets DataYego. */
export default function StoreResetPassword() {
  const store = useStore(); const { slug: paramSlug } = useParams(); const slug = paramSlug ?? store.slug; const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState(""); const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams(window.location.search);
    const tokenHash = q.get("token_hash");
    void (async () => {
      if (tokenHash && q.get("type") === "recovery") {
        const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
        // The token is spent: take it out of the address so a refresh or a shared screenshot can't reuse it.
        window.history.replaceState(null, "", window.location.pathname);
        if (alive) setState(error ? "invalid" : "ready");
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (alive) setState(data.session ? "ready" : "invalid");
    })();
    return () => { alive = false; };
  }, []);

  const strong = password.length >= 8 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
  const save = async () => {
    if (!strong) return toast.error("Use at least 8 characters with upper and lower case and a number.");
    if (password !== confirm) return toast.error("The two passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) return toast.error("We couldn't save your new password. Ask for a new link and try again.");
    toast.success("Your password has been changed.");
    navigate(`${storeBase(slug)}/account`, { replace: true });
  };

  return (
    <StorePage narrow title={state === "invalid" ? "This link has expired" : "Choose a new password"} lead={state === "invalid" ? "Reset links work once and only for an hour. Ask for a new one." : `For your ${store.store_name} account.`}>
      <section className="onyx-panel rounded-[22px] p-5">
        {state === "checking" && <p className="text-center text-[13px] text-muted-foreground">Checking your link…</p>}
        {state === "invalid" && <Link to={`${storeBase(slug)}/sign-in?forgot=1`} className="onyx-btn-primary block w-full py-3 text-center text-[14px]">Send me a new link</Link>}
        {state === "ready" && <div className="space-y-3">
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="New password" autoComplete="new-password" className="onyx-field w-full" />
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" placeholder="Type it again" autoComplete="new-password" className="onyx-field w-full" />
          <p className="text-[11.5px] text-faint-foreground">At least 8 characters with upper and lower case and a number.</p>
          <button type="button" disabled={busy} onClick={() => void save()} className="onyx-btn-primary w-full py-3 text-[14px] disabled:opacity-60">{busy ? "Saving…" : "Save new password"}</button>
        </div>}
      </section>
    </StorePage>
  );
}
