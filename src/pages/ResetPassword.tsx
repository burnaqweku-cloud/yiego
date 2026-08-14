import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Eye, EyeOff, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Wordmark from "@/components/brand/Wordmark";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/store/auth-context";

function strongEnough(password: string) {
  return password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const { isAuthenticated, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const valid = strongEnough(password) && password === confirm;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) return;
    setSubmitting(true);
    try {
      await updatePassword(password);
      toast.success("Your password has been updated");
      navigate("/", { replace: true });
    } catch {
      toast.error("We couldn't update your password. Request a new reset link and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="onyx-canvas min-h-dvh px-5 py-8">
      <main className="relative z-10 mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[520px] items-center">
        <Card className="w-full"><CardContent className="p-6 sm:p-7">
          <Link to="/" className="mb-8 inline-flex items-center" aria-label="DataYego — home"><Wordmark className="h-[26px]" /></Link>
          {!isAuthenticated ? (
            <div className="text-center">
              <KeyRound className="mx-auto text-primary-glow" size={28} />
              <h1 className="mt-4 font-display text-2xl font-semibold text-white">This reset link is invalid or expired</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Request a fresh password reset email to continue.</p>
              <Button className="mt-5" onClick={() => navigate("/auth?mode=forgot")}>Request another link</Button>
            </div>
          ) : (
            <>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-glow">Account recovery</p>
              <h1 className="mt-1 font-display text-2xl font-semibold text-white">Choose a new password</h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">Use at least 8 characters with uppercase, lowercase and a number.</p>
              <form className="mt-7 space-y-4" onSubmit={submit}>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">New password</span><div className="flex items-center rounded-2xl border border-white/10 bg-white/[0.03] px-4"><input className="h-12 min-w-0 flex-1 bg-transparent text-sm text-white outline-none" type={show ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /><button type="button" onClick={() => setShow((value) => !value)} aria-label={show ? "Hide password" : "Show password"}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label>
                <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Confirm password</span><input className="onyx-field" type={show ? "text" : "password"} value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" /></label>
                {confirm && password !== confirm && <p className="text-xs text-danger">Passwords do not match.</p>}
                <Button className="w-full" type="submit" disabled={!valid || submitting}>{submitting && <Loader2 className="animate-spin" size={16} />} Update password</Button>
              </form>
            </>
          )}
        </CardContent></Card>
      </main>
    </div>
  );
}
