import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2, Eye, EyeOff, Loader2, Lock, Mail, Phone, UserRound } from "lucide-react";
import { toast } from "sonner";
import Monogram from "@/components/brand/Monogram";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/store/auth-context";

type Mode = "login" | "signup" | "forgot" | "check-email";

function safeNext(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") && !value.startsWith("/auth") ? value : "/";
}

function friendlyAuthError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("invalid login")) return "The email or password is incorrect.";
  if (message.includes("already registered") || message.includes("already been registered")) return "An account already exists with this email.";
  if (message.includes("rate limit")) return "Too many attempts. Please wait a moment and try again.";
  if (message.includes("weak password")) return "Choose a stronger password with at least 8 characters.";
  return "We couldn't complete that request. Please check your details and try again.";
}

function strongEnough(password: string) {
  return password.length >= 8 && /[a-z]/.test(password) && /[A-Z]/.test(password) && /\d/.test(password);
}

export default function Auth() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const nextPath = useMemo(() => safeNext(searchParams.get("next")), [searchParams]);
  const requestedMode = searchParams.get("mode") === "signup" ? "signup" : searchParams.get("mode") === "forgot" ? "forgot" : "login";
  const { signIn, signUp, resetPassword, isAuthenticated, loading } = useAuth();
  const [mode, setMode] = useState<Mode>(requestedMode);
  const [submitting, setSubmitting] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) navigate(nextPath, { replace: true });
  }, [isAuthenticated, loading, navigate, nextPath]);

  const phoneValid = /^0\d{9}$/.test(phone);
  const passwordValid = strongEnough(password);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (mode === "signup" && (!phoneValid || !passwordValid)) return;
    setSubmitting(true);
    try {
      if (mode === "login") {
        await signIn(email.trim(), password);
        toast.success("Welcome back to YieGo");
        navigate(nextPath, { replace: true });
      } else if (mode === "signup") {
        const result = await signUp({ fullName: fullName.trim(), email: email.trim(), phone, password });
        if (result.requiresEmailConfirmation) {
          setMode("check-email");
        } else {
          toast.success("Your YieGo account is ready");
          navigate(nextPath, { replace: true });
        }
      }
    } catch (error) {
      toast.error(friendlyAuthError(error));
    } finally {
      setSubmitting(false);
    }
  };

  const sendReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await resetPassword(email.trim());
      setMode("check-email");
    } catch (error) {
      toast.error(friendlyAuthError(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="onyx-canvas min-h-dvh px-5 py-8">
      <div className="onyx-aurora" aria-hidden="true"><span className="onyx-aurora-a" /><span className="onyx-aurora-b" /><span className="onyx-grain" /></div>
      <main className="relative z-10 mx-auto flex min-h-[calc(100dvh-4rem)] w-full max-w-[1100px] items-center">
        <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-[1fr_430px] lg:items-center">
          <section className="hidden lg:block">
            <Link to="/" className="inline-flex items-center gap-3"><Monogram size={46} /><div><p className="font-display text-xl font-semibold text-white">YieGo</p><p className="text-sm text-faint-foreground">Ghana data, paid and delivered cleanly.</p></div></Link>
            <h1 className="mt-10 max-w-xl font-display text-5xl font-semibold tracking-tight text-white">One account for your wallet, orders and receipts.</h1>
            <p className="mt-4 max-w-lg leading-7 text-muted-foreground">Sign in to fund your wallet, buy data, track orders and keep receipts. Guests can still buy data with Paystack.</p>
          </section>

          <Card><CardContent className="p-6 sm:p-7">
            <Link to="/" className="mb-7 flex items-center gap-3 lg:hidden"><Monogram size={42} /><div><p className="font-display text-lg font-semibold text-white">YieGo</p><p className="text-xs text-faint-foreground">Your everyday digital plug</p></div></Link>

            {mode === "check-email" ? (
              <div className="py-3 text-center">
                <CheckCircle2 className="mx-auto text-primary-glow" size={34} />
                <h2 className="mt-4 font-display text-2xl font-semibold text-white">Check your email</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">We sent instructions to <span className="font-semibold text-foreground">{email}</span>. Open the link in that email to continue.</p>
                <Button variant="soft" className="mt-6" onClick={() => setMode("login")}>Back to sign in</Button>
              </div>
            ) : mode === "forgot" ? (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-glow">Account recovery</p>
                <h2 className="mt-1 font-display text-2xl font-semibold text-white">Reset your password</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">Enter your email and we'll send you a secure reset link.</p>
                <form className="mt-7 space-y-4" onSubmit={sendReset}>
                  <AuthField icon={Mail} label="Email"><input className="h-12 min-w-0 flex-1 bg-transparent text-sm text-white outline-none" value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="email" placeholder="you@example.com" required /></AuthField>
                  <Button type="submit" className="w-full" disabled={submitting}>{submitting && <Loader2 className="animate-spin" size={16} />} Send reset link</Button>
                </form>
                <button type="button" className="mt-5 w-full text-center text-sm font-semibold text-primary-glow" onClick={() => setMode("login")}>Back to sign in</button>
              </>
            ) : (
              <>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-glow">{mode === "login" ? "Welcome back" : "Create account"}</p>
                <h2 className="mt-1 font-display text-2xl font-semibold text-white">{mode === "login" ? "Sign in" : "Join YieGo"}</h2>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{mode === "login" ? "Use your email and password to continue." : "Create an account to activate your wallet and order history."}</p>
                <form className="mt-7 space-y-4" onSubmit={submit}>
                  {mode === "signup" && <>
                    <AuthField icon={UserRound} label="Full name"><input className="h-12 min-w-0 flex-1 bg-transparent text-sm text-white outline-none" value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your name" autoComplete="name" required /></AuthField>
                    <AuthField icon={Phone} label="Ghana phone number"><input className="h-12 min-w-0 flex-1 bg-transparent text-sm text-white outline-none" value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="0244001122" inputMode="tel" autoComplete="tel" required /></AuthField>
                    {phone && !phoneValid && <p className="-mt-2 text-xs text-danger">Enter a valid 10-digit Ghana number beginning with 0.</p>}
                  </>}
                  <AuthField icon={Mail} label="Email"><input className="h-12 min-w-0 flex-1 bg-transparent text-sm text-white outline-none" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" type="email" autoComplete="email" required /></AuthField>
                  <AuthField icon={Lock} label="Password" trailing={<button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>}><input className="h-12 min-w-0 flex-1 bg-transparent text-sm text-white outline-none" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "signup" ? 8 : 6} required /></AuthField>
                  {mode === "signup" && <p className="-mt-2 text-xs leading-5 text-faint-foreground">Use at least 8 characters with uppercase, lowercase and a number.</p>}
                  {mode === "login" && <button type="button" className="block w-full text-right text-xs font-semibold text-primary-glow" onClick={() => setMode("forgot")}>Forgot password?</button>}
                  <Button type="submit" className="w-full" disabled={submitting || (mode === "signup" && (!phoneValid || !passwordValid))}>{submitting && <Loader2 className="animate-spin" size={16} />}{mode === "login" ? "Sign in" : "Create account"}</Button>
                </form>
                <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center text-sm text-muted-foreground">{mode === "login" ? "No account yet?" : "Already have an account?"} <button type="button" className="font-semibold text-primary-glow" onClick={() => setMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "Create one" : "Sign in"}</button></div>
              </>
            )}
          </CardContent></Card>
        </div>
      </main>
    </div>
  );
}

function AuthField({ icon: Icon, label, children, trailing }: { icon: typeof Mail; label: string; children: React.ReactNode; trailing?: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span><div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4"><Icon size={17} className="text-faint-foreground" />{children}{trailing}</div></label>;
}
