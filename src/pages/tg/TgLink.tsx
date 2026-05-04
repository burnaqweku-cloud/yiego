import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { getSession, miniAppFetch } from "@/lib/tg-miniapp/api";
import { getTg } from "@/lib/tg-miniapp/sdk";
import { useTgMainButton } from "@/lib/tg-miniapp/useMainButton";

/**
 * Phase 2 — Account Linking Mini App.
 *
 * Flow:
 *   1. On mount, exchange initData for a session JWT (via getSession).
 *   2. If the chat is already linked → show success state immediately.
 *   3. Otherwise → show email/phone + password form.
 *   4. Submit → POST /tg-miniapp-link → on success, show ✅ Linked!
 *      and configure the Telegram MainButton to close the Mini App.
 */

type Phase = "loading" | "form" | "submitting" | "linked" | "fatal";

export default function TgLink() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [fatal, setFatal] = useState<string>("");
  const [formError, setFormError] = useState<string>("");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [linked, setLinked] = useState<{
    user_id: string;
    full_name: string | null;
    firstName: string | null;
    welcomePoints: number;
  }>({
    user_id: "",
    full_name: null,
    firstName: null,
    welcomePoints: 0,
  });

  // 1. Bootstrap session
  useEffect(() => {
    (async () => {
      try {
        const s = await getSession(true);
        if (s.user_id) {
          setLinked({
            user_id: s.user_id,
            full_name: null,
            firstName: s.user.first_name ?? null,
            welcomePoints: 0,
          });
          setPhase("linked");
        } else {
          setPhase("form");
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setFatal(msg);
        setPhase("fatal");
      }
    })();
  }, []);

  // 2. Wire MainButton — only on the linked screen; hidden on every other phase.
  const onBackToBot = useCallback(() => {
    const tg = getTg();
    if (!tg) return;
    try { tg.HapticFeedback?.notificationOccurred?.("success"); } catch (_) { /* noop */ }
    tg.close();
  }, []);
  useTgMainButton(
    phase === "linked"
      ? { text: "Back to bot", onClick: onBackToBot }
      : null,
  );

  // 3. Submit handler
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");
    const id = identifier.trim();
    if (!id || !password) {
      setFormError("Enter your username/email and password.");
      return;
    }
    setPhase("submitting");
    try {
      const res = await miniAppFetch<{
        ok: boolean;
        user_id: string;
        full_name: string | null;
        welcome_points_granted?: number;
      }>("tg-miniapp-link", {
        method: "POST",
        body: { identifier: id, password },
      });
      try { getTg()?.HapticFeedback?.notificationOccurred?.("success"); } catch (_) { /* noop */ }
      // Refresh session so it now has user_id
      try { await getSession(true); } catch (_) { /* noop */ }
      const tg = getTg();
      const firstName = tg?.initDataUnsafe?.user?.first_name ?? null;
      setLinked({
        user_id: res.user_id,
        full_name: res.full_name,
        firstName,
        welcomePoints: res.welcome_points_granted ?? 0,
      });
      setPassword("");
      setPhase("linked");
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      try { getTg()?.HapticFeedback?.notificationOccurred?.("error"); } catch (_) { /* noop */ }
      setFormError(prettyError(msg));
      setPhase("form");
    }
  }

  const fallbackHref = useMemo(() => {
    // "Open in browser" fallback — works even if Mini App webview is acting up
    return "https://yiego.com/dashboard/connect-telegram";
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────
  if (phase === "loading") {
    return (
      <div className="space-y-4">
        <Header subtitle="Verifying your Telegram session…" />
        <Card>
          <div className="text-sm" style={{ color: "var(--tg-hint)" }}>One moment…</div>
        </Card>
      </div>
    );
  }

  if (phase === "fatal") {
    return (
      <div className="space-y-4">
        <Header subtitle="Could not start linking" />
        <Card tone="error">
          <div className="font-semibold mb-1" style={{ color: "#991b1b" }}>❌ Verification failed</div>
          <div className="text-sm" style={{ color: "#7f1d1d" }}>{fatal}</div>
          <p className="text-xs mt-3" style={{ color: "var(--tg-hint)" }}>
            If you opened this page outside Telegram, that is expected. Open it from the @yiego_bot.
          </p>
        </Card>
        <FallbackLink href={fallbackHref} />
      </div>
    );
  }

  if (phase === "linked") {
    const greeting = linked.full_name || linked.firstName || "friend";
    return (
      <div className="space-y-4">
        <Header subtitle="Account linked successfully" />
        <Card tone="success">
          <div className="text-3xl mb-1">✅</div>
          <div className="text-base font-semibold" style={{ color: "#166534" }}>
            Welcome, {greeting}.
          </div>
          {linked.welcomePoints > 0 && (
            <div
              className="mt-3 rounded-xl px-3 py-2 text-sm font-semibold inline-flex items-center gap-1"
              style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a" }}
            >
              🎁 +{linked.welcomePoints} welcome points
            </div>
          )}
          <p className="text-sm mt-3" style={{ color: "#166534" }}>
            Your YieGo account is now connected. You can use wallet payments,
            <code className="mx-1 px-1 rounded bg-white/60">/account</code>,
            <code className="mx-1 px-1 rounded bg-white/60">/deposit</code>, and faster checkout.
          </p>
          <p className="text-xs mt-3" style={{ color: "var(--tg-hint)" }}>
            Tap <strong>Back to bot</strong> below to continue.
          </p>
        </Card>
      </div>
    );
  }

  // form / submitting
  const submitting = phase === "submitting";
  return (
    <div className="space-y-4">
      <Header subtitle="Sign in to link your YieGo account" />
      <Card>
        <p className="text-sm leading-relaxed mb-3" style={{ color: "var(--tg-text)" }}>
          <strong>Already have a YieGo account?</strong> Sign in below with the same
          username/email and password you use on yiego.com.
        </p>
        <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--tg-hint)" }}>
          We just need to confirm the account is yours — your password is never stored.
          Don't have an account yet? Tap <strong>Create one</strong> below to sign up.
        </p>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Field label="Username or email">
            <input
              type="text"
              autoComplete="username"
              inputMode="text"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="yourname or you@example.com"
              disabled={submitting}
              className="w-full rounded-xl px-3 py-2.5 text-base outline-none border bg-white"
              style={{ borderColor: "#cbd5e1", color: "#0f172a" }}
            />
          </Field>
          <Field label="Password">
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Your YieGo password"
                disabled={submitting}
                className="w-full rounded-xl px-3 py-2.5 pr-16 text-base outline-none border bg-white"
                style={{ borderColor: "#cbd5e1", color: "#0f172a" }}
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

          {formError && (
            <div
              className="rounded-lg px-3 py-2 text-sm"
              style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}
            >
              {formError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !identifier.trim() || !password}
            className="w-full rounded-xl py-3 text-base font-semibold transition-opacity"
            style={{
              background: "var(--tg-button, #1e293b)",
              color: "var(--tg-button-text, #ffffff)",
              opacity: submitting || !identifier.trim() || !password ? 0.6 : 1,
            }}
          >
            {submitting ? "Linking…" : "Link my account"}
          </button>

          <p className="text-xs text-center pt-1" style={{ color: "var(--tg-hint)" }}>
            We only use this to confirm you own the account. Your password is never stored.
          </p>
        </form>
      </Card>
      <SignupLine />
      <FallbackLink href={fallbackHref} />
    </div>
  );
}

// ─── Bits ────────────────────────────────────────────────────────────────

function prettyError(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("invalid credentials") || m.includes("invalid login")) {
    return "Invalid username/email or password. Try again.";
  }
  if (m.includes("missing_bearer") || m.includes("session_expired") || m.includes("bad_session")) {
    return "Your Telegram session expired — please reopen this page from the bot.";
  }
  if (m.includes("rate") || m.includes("too many")) {
    return "Too many attempts. Wait a moment and try again.";
  }
  return msg || "Something went wrong. Try again.";
}

function Header({ subtitle }: { subtitle: string }) {
  return (
    <header>
      <h1 className="text-xl font-semibold">YieGo · Account Link</h1>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>
        {label}
      </span>
      {children}
    </label>
  );
}

function FallbackLink({ href }: { href: string }) {
  function open(e: React.MouseEvent) {
    e.preventDefault();
    const tg = getTg();
    if (tg?.openLink) {
      tg.openLink(href);
    } else {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }
  return (
    <p className="text-xs text-center pt-2" style={{ color: "var(--tg-hint)" }}>
      Trouble signing in?{" "}
      <a href={href} onClick={open} className="font-medium underline" style={{ color: "var(--tg-link)" }}>
        Open in browser
      </a>
    </p>
  );
}

function SignupLine() {
  // Subtle inline link — same visual weight as the "Open in browser"
  // fallback above. Navigates inside the same Mini App webview via
  // React Router (do NOT use tg.openLink here — that opens an
  // external browser).
  return (
    <p className="text-xs text-center pt-1" style={{ color: "var(--tg-hint)" }}>
      Don't have a YieGo account yet?{" "}
      <Link
        to="/tg/signup"
        className="font-medium underline"
        style={{ color: "var(--tg-link)" }}
      >
        Create one
      </Link>{" "}
      — only for first-time users (avoid duplicate accounts).
    </p>
  );
}
