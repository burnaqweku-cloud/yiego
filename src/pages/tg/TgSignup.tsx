import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getSession, miniAppFetch } from "@/lib/tg-miniapp/api";
import { getTg } from "@/lib/tg-miniapp/sdk";
import { useTgMainButton, type MainButtonConfig } from "@/lib/tg-miniapp/useMainButton";

/**
 * Phase 3 — Mini App signup.
 *
 * Mirrors website /auth signup field set + validation EXACTLY.
 * On success, the server creates the account, auto-links it to this
 * Telegram chat, and grants the 100-point welcome bonus.
 */

type Phase = "loading" | "form" | "submitting" | "done" | "fatal";

interface FieldErrors {
  full_name?: string;
  username?: string;
  phone?: string;
  email?: string;
  password?: string;
  terms?: string;
}

const USERNAME_RE = /^[a-zA-Z0-9_.]+$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(v: {
  full_name: string;
  username: string;
  phone: string;
  email: string;
  password: string;
  terms: boolean;
}): FieldErrors {
  const e: FieldErrors = {};
  if (!v.full_name.trim()) e.full_name = "Full name is required";

  const u = v.username.trim();
  if (!u) e.username = "Username is required";
  else if (u.length < 3) e.username = "Username must be at least 3 characters";
  else if (u.length > 20) e.username = "Username must be 20 characters or less";
  else if (!USERNAME_RE.test(u)) e.username = "Only letters, numbers, underscores, and dots allowed";

  if (!v.phone.trim()) e.phone = "Phone number is required";

  if (!EMAIL_RE.test(v.email.trim())) e.email = "Please enter a valid email address";

  if (v.password.length < 6) e.password = "Password must be at least 6 characters";

  if (!v.terms) e.terms = "You must agree to the Terms, Privacy & Disclaimer.";

  return e;
}

export default function TgSignup() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("loading");
  const [fatal, setFatal] = useState("");
  const [topError, setTopError] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const [done, setDone] = useState<{
    full_name: string | null;
    welcomePoints: number;
  }>({ full_name: null, welcomePoints: 0 });

  // 1. Bootstrap session (also confirms Mini App context)
  useEffect(() => {
    (async () => {
      try {
        const s = await getSession(true);
        if (s.user_id) {
          // Already linked — bounce back to /tg/link which will show the
          // "already linked" success state without confusing the user.
          navigate("/tg/link", { replace: true });
          return;
        }
        setPhase("form");
      } catch (e) {
        setFatal(e instanceof Error ? e.message : String(e));
        setPhase("fatal");
      }
    })();
  }, [navigate]);

  // 2. Wire MainButton — explicit per-phase config; cleared on unmount.
  const onSubmitClick = useCallback(() => {
    const form = document.getElementById("tg-signup-form") as HTMLFormElement | null;
    form?.requestSubmit();
  }, []);
  const onBackToBot = useCallback(() => {
    const tg = getTg();
    if (!tg) return;
    try { tg.HapticFeedback?.notificationOccurred?.("success"); } catch (_) { /* noop */ }
    tg.close();
  }, []);
  const mbConfig = useMemo<MainButtonConfig | null>(() => {
    if (phase === "form") {
      return { text: "Create account", onClick: onSubmitClick };
    }
    if (phase === "submitting") {
      return { text: "Creating…", active: false, progress: true, onClick: onSubmitClick };
    }
    if (phase === "done") {
      return { text: "Back to bot", onClick: onBackToBot };
    }
    return null;
  }, [phase, onSubmitClick, onBackToBot]);
  useTgMainButton(mbConfig);

  // 3. Submit handler
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTopError("");
    const v = {
      full_name: fullName,
      username,
      phone,
      email,
      password,
      terms: agreed,
    };
    const fieldErrs = validate(v);
    if (Object.keys(fieldErrs).length) {
      setErrors(fieldErrs);
      try { getTg()?.HapticFeedback?.notificationOccurred?.("error"); } catch (_) { /* noop */ }
      return;
    }
    setErrors({});
    setPhase("submitting");

    try {
      const tg = getTg();
      const initData = tg?.initData ?? "";
      const res = await miniAppFetch<{
        ok: boolean;
        user_id: string;
        full_name: string | null;
        welcome_points_granted?: number;
      }>("tg-miniapp-signup", {
        method: "POST",
        body: {
          full_name: fullName.trim(),
          username: username.trim(),
          phone: phone.trim(),
          email: email.trim().toLowerCase(),
          password,
          agreed_to_terms: agreed,
          initData,
        },
      });
      try { getTg()?.HapticFeedback?.notificationOccurred?.("success"); } catch (_) { /* noop */ }
      try { await getSession(true); } catch (_) { /* noop */ }
      setDone({
        full_name: res.full_name,
        welcomePoints: res.welcome_points_granted ?? 0,
      });
      setPassword("");
      setPhase("done");
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err);
      // Server returns plain string error — try to map common cases
      const lower = raw.toLowerCase();
      const fe: FieldErrors = {};
      if (lower.includes("email already") || lower.includes("account with this email")) {
        fe.email = "An account with this email already exists";
        setTopError("This email is already registered. Tap “Already have an account?” below to sign in.");
      } else if (lower.includes("username") && lower.includes("taken")) {
        fe.username = "This username is already taken";
      } else {
        setTopError(raw || "Something went wrong. Try again.");
      }
      setErrors(fe);
      try { getTg()?.HapticFeedback?.notificationOccurred?.("error"); } catch (_) { /* noop */ }
      setPhase("form");
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="space-y-4">
        <Header subtitle="Verifying your Telegram session…" />
        <Card><div className="text-sm" style={{ color: "var(--tg-hint)" }}>One moment…</div></Card>
      </div>
    );
  }

  if (phase === "fatal") {
    return (
      <div className="space-y-4">
        <Header subtitle="Could not start signup" />
        <Card tone="error">
          <div className="font-semibold mb-1" style={{ color: "#991b1b" }}>❌ Verification failed</div>
          <div className="text-sm" style={{ color: "#7f1d1d" }}>{fatal}</div>
          <p className="text-xs mt-3" style={{ color: "var(--tg-hint)" }}>
            If you opened this page outside Telegram, that's expected. Open it from @yiego_bot.
          </p>
        </Card>
      </div>
    );
  }

  if (phase === "done") {
    const greeting = done.full_name?.split(" ")[0] || getTg()?.initDataUnsafe?.user?.first_name || "there";
    return (
      <div className="space-y-4">
        <Header subtitle="Welcome to YieGo" />
        <Card tone="success">
          <div className="text-3xl mb-1">🎉</div>
          <div className="text-base font-semibold" style={{ color: "#166534" }}>
            Account created, {greeting}!
          </div>
          <p className="text-sm mt-2" style={{ color: "#166534" }}>
            Your YieGo account is now linked to this Telegram chat.
          </p>
          {done.welcomePoints > 0 && (
            <div
              className="mt-3 rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center gap-1"
              style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}
            >
              🎁 +{done.welcomePoints} welcome points
            </div>
          )}
          <p className="text-xs mt-3" style={{ color: "var(--tg-hint)" }}>
            Tap <strong>Back to bot</strong> below to continue.
          </p>
        </Card>
      </div>
    );
  }

  // form / submitting
  const submitting = phase === "submitting";
  const hasTgSdk = !!getTg();
  return (
    <div className="space-y-4">
      <Header subtitle="Create your YieGo account" />
      <Card>
        <form id="tg-signup-form" onSubmit={handleSubmit} className="space-y-3" autoComplete="on">
          {topError && (
            <div
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}
            >
              {topError}
            </div>
          )}

          <Field label="Full name" error={errors.full_name}>
            <TgInput
              type="text"
              autoComplete="name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Kofi Mensah"
              disabled={submitting}
              maxLength={100}
            />
          </Field>

          <Field label="Username" error={errors.username}>
            <TgInput
              type="text"
              autoComplete="username"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, ""))}
              placeholder="kofi_m"
              disabled={submitting}
              maxLength={20}
            />
          </Field>

          <Field label="Phone number" error={errors.phone}>
            <TgInput
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="0241234567"
              disabled={submitting}
              maxLength={20}
            />
          </Field>

          <Field label="Email" error={errors.email}>
            <TgInput
              type="email"
              autoComplete="email"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              disabled={submitting}
              maxLength={255}
            />
          </Field>

          <Field label="Password" error={errors.password}>
            <div className="relative">
              <TgInput
                type={showPw ? "text" : "password"}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                disabled={submitting}
                maxLength={128}
                className="pr-16"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                disabled={submitting}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-semibold px-2 py-1 rounded-md"
                style={{ color: "var(--tg-link)" }}
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          </Field>

          <label className="flex items-start gap-2 pt-1 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              disabled={submitting}
              className="mt-1 h-4 w-4"
              style={{ accentColor: "var(--tg-button, #1e293b)" }}
            />
            <span className="text-xs leading-snug" style={{ color: "#475569" }}>
              I agree to the{" "}
              <FallbackA href="https://yiego.com/terms">Terms of Service</FallbackA>,{" "}
              <FallbackA href="https://yiego.com/privacy">Privacy Policy</FallbackA>, and{" "}
              <FallbackA href="https://yiego.com/disclaimer">Disclaimer</FallbackA>.
            </span>
          </label>
          {errors.terms && (
            <div className="text-xs" style={{ color: "#b91c1c" }}>{errors.terms}</div>
          )}

          {/* Hidden submit enables Enter-key submission. Visible button only
              shown as fallback when the Telegram MainButton is unavailable. */}
          {hasTgSdk ? (
            <button type="submit" disabled={submitting} className="sr-only" aria-hidden="true" tabIndex={-1}>
              Create account
            </button>
          ) : (
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-xl py-3 text-base font-semibold transition-opacity"
              style={{
                background: "var(--tg-button, #1e293b)",
                color: "var(--tg-button-text, #ffffff)",
                opacity: submitting ? 0.6 : 1,
              }}
            >
              {submitting ? "Creating account…" : "Create account"}
            </button>
          )}

          <p className="text-xs text-center pt-1" style={{ color: "var(--tg-hint)" }}>
            You'll get <strong>100 welcome points</strong> automatically — that's a head start
            toward free data 🎁
          </p>
        </form>
      </Card>

      <p className="text-xs text-center pt-1" style={{ color: "var(--tg-hint)" }}>
        Already have an account?{" "}
        <Link to="/tg/link" className="font-medium underline" style={{ color: "var(--tg-link)" }}>
          Sign in
        </Link>
      </p>
    </div>
  );
}

// ─── Bits ──────────────────────────────────────────────────────────────

function Header({ subtitle }: { subtitle: string }) {
  return (
    <header>
      <h1 className="text-xl font-semibold">YieGo · Create account</h1>
      <p className="text-sm mt-1" style={{ color: "var(--tg-hint)" }}>{subtitle}</p>
    </header>
  );
}

function Card({
  children,
  tone,
}: {
  children: React.ReactNode;
  tone?: "success" | "error";
}) {
  const styles =
    tone === "success"
      ? { borderColor: "#bbf7d0", background: "#f0fdf4" }
      : tone === "error"
      ? { borderColor: "#fecaca", background: "#fef2f2" }
      : { borderColor: "#e2e8f0", background: "#ffffff" };
  return (
    <div className="rounded-2xl border p-5" style={styles}>
      {children}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>{label}</span>
      {children}
      {error && (
        <span className="block text-xs mt-1" style={{ color: "#b91c1c" }}>{error}</span>
      )}
    </label>
  );
}

function TgInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl px-3 py-2.5 text-base outline-none border bg-white ${props.className ?? ""}`}
      style={{ borderColor: "#cbd5e1", color: "#0f172a", ...(props.style ?? {}) }}
    />
  );
}

function FallbackA({ href, children }: { href: string; children: React.ReactNode }) {
  function open(e: React.MouseEvent) {
    e.preventDefault();
    const tg = getTg();
    if (tg?.openLink) tg.openLink(href);
    else window.open(href, "_blank", "noopener,noreferrer");
  }
  return (
    <a href={href} onClick={open} className="underline" style={{ color: "var(--tg-link)" }}>
      {children}
    </a>
  );
}
