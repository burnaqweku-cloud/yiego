import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/* Two-factor for admins. First time: scan a QR code with an authenticator
   app and confirm one code. Every sign-in after that: type the 6-digit code.
   The session is upgraded to aal2, which is what the database checks. */
export default function AdminMfa({ hasFactor, onDone }: { hasFactor: boolean; onDone: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (hasFactor) {
        const { data } = await supabase.auth.mfa.listFactors();
        const f = data?.totp?.find((x) => x.status === "verified") ?? data?.totp?.[0];
        if (!cancelled && f) setFactorId(f.id);
        return;
      }
      // Clean up any half-finished enrolment, then start a fresh one.
      const { data: existing } = await supabase.auth.mfa.listFactors();
      for (const f of existing?.all ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `DataYego admin ${new Date().toISOString().slice(0, 16).replace("T", " ")}` });
      if (cancelled) return;
      if (error || !data) { setError(error?.message ?? "Couldn't start two-factor setup."); return; }
      setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret);
    })();
    return () => { cancelled = true; };
  }, [hasFactor]);

  const verify = async () => {
    if (!factorId || code.replace(/\D/g, "").length !== 6) return;
    setBusy(true); setError(null);
    const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId });
    if (chErr || !ch) { setBusy(false); setError(chErr?.message ?? "Couldn't start verification."); return; }
    const { error: vErr } = await supabase.auth.mfa.verify({ factorId, challengeId: ch.id, code: code.replace(/\D/g, "") });
    setBusy(false);
    if (vErr) { setError("That code didn't match. Codes change every 30 seconds — try the current one."); setCode(""); return; }
    toast.success(hasFactor ? "Verified." : "Two-factor is on for your admin account.");
    onDone();
  };

  return (
    <div className="onyx-canvas flex min-h-dvh items-center justify-center px-5 py-8">
      <div className="onyx-panel w-full max-w-sm rounded-3xl p-6">
        <div className="text-center">
          {hasFactor ? <KeyRound size={26} className="mx-auto text-primary-glow" /> : <ShieldCheck size={26} className="mx-auto text-primary-glow" />}
          <h1 className="mt-3 text-[19px] font-semibold text-foreground">{hasFactor ? "Enter your code" : "Set up two-factor"}</h1>
          <p className="mt-1 text-[12.5px] text-muted-foreground">{hasFactor ? "Open your authenticator app and type the 6-digit code for DataYego admin." : "Admin access needs a second step. Scan this with Google Authenticator, Authy or any authenticator app, then enter the code it shows."}</p>
        </div>
        {!hasFactor && (
          <div className="mt-4">
            {qr ? <img src={qr} alt="QR code" className="mx-auto h-44 w-44 rounded-2xl bg-white p-2" /> : <div className="mx-auto h-44 w-44 animate-pulse rounded-2xl bg-white/[0.06]" />}
            {secret && <details className="mt-2 text-center text-[11.5px] text-muted-foreground"><summary className="cursor-pointer">Can't scan? Enter the key manually</summary><code className="mt-1 block break-all rounded-lg bg-white/[0.04] p-2 text-[11px] text-foreground">{secret}</code></details>}
          </div>
        )}
        <input inputMode="numeric" autoComplete="one-time-code" maxLength={7} value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void verify(); }} placeholder="123 456" className="onyx-field mt-4 w-full text-center text-[22px] tracking-[0.3em]" autoFocus />
        {error && <p className="mt-2 text-center text-[12px] text-danger">{error}</p>}
        <button type="button" onClick={() => void verify()} disabled={busy || code.replace(/\D/g, "").length !== 6} className="onyx-btn-primary mt-3 w-full py-3 text-[14px]">{busy ? "Checking…" : hasFactor ? "Continue" : "Turn on two-factor"}</button>
        <button type="button" onClick={() => void supabase.auth.signOut().then(() => { window.location.href = "/"; })} className="mt-3 w-full text-center text-[12px] text-muted-foreground">Sign out</button>
      </div>
    </div>
  );
}
