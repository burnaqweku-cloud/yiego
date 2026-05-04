import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getSession, miniAppFetch } from "@/lib/tg-miniapp/api";
import { getTg } from "@/lib/tg-miniapp/sdk";
import { useTgMainButton, type MainButtonConfig } from "@/lib/tg-miniapp/useMainButton";

/**
 * Phase 3 — Wallet Top-up Mini App.
 *
 * Flow:
 *   1. Exchange initData → session JWT (+ load wallet balance).
 *   2. Pre-fill amount from `?amt=` URL param OR start_param `amt_<n>`
 *      (so the bot can deep-link a specific amount).
 *   3. Show: balance, editable amount, fee preview, payment method
 *      (Paystack — MoMo / Card), MainButton "Pay GHS X.XX".
 *   4. On submit → tg-miniapp-deposit-init → open authorization_url
 *      via tg.openLink (Paystack hosted MoMo/card page).
 *   5. Navigate to /tg/deposit/success?ref=<reference> for polling.
 *
 * Mandatory: "Trouble paying? Open in browser" fallback link at bottom.
 */

const DEPOSIT_MIN = 5;
const DEPOSIT_MAX = 5000;
const DEPOSIT_PRESETS = [10, 20, 50, 100];
const FEE_RATE = 0.04;

type Phase = "loading" | "form" | "submitting" | "fatal" | "needs_link";

interface SessionInfo {
  user_id: string | null;
  first_name: string | null;
  start_param: string | null;
}

export default function TgDeposit() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [phase, setPhase] = useState<Phase>("loading");
  const [fatal, setFatal] = useState("");
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [balance, setBalance] = useState<number>(0);
  const [amount, setAmount] = useState<string>("");
  const [formError, setFormError] = useState("");

  // 1. Bootstrap: session + wallet balance
  useEffect(() => {
    (async () => {
      try {
        const s = await getSession();
        if (!s.user_id) {
          setPhase("needs_link");
          return;
        }
        // Pre-fill from URL ?amt= OR start_param=amt_<n>
        const fromUrl = parsePreset(search.get("amt"));
        const fromStart = parseStartParamAmt(s.start_param);
        const initial = fromUrl ?? fromStart ?? null;
        if (initial != null) setAmount(String(initial));

        // Fetch current balance via the status endpoint with a dummy ref:
        // simpler: piggyback the status fn (we always need balance). Use a
        // sentinel ref that won't match anything → status:"unknown" but
        // balance is returned regardless.
        try {
          const r = await miniAppFetch<{ balance_ghs: number }>(
            "tg-miniapp-deposit-status",
            { method: "GET", query: { reference: "__balance_only__" } },
          );
          setBalance(Number(r?.balance_ghs ?? 0));
        } catch {
          // Balance is informational — don't block the page on this
          setBalance(0);
        }

        setInfo({
          user_id: s.user_id,
          first_name: s.user?.first_name ?? null,
          start_param: s.start_param,
        });
        setPhase("form");
      } catch (e) {
        setFatal(e instanceof Error ? e.message : String(e));
        setPhase("fatal");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parsedAmount = parseAmount(amount);
  const valid =
    parsedAmount != null && parsedAmount >= DEPOSIT_MIN && parsedAmount <= DEPOSIT_MAX;
  const fee = valid ? round2(parsedAmount! * FEE_RATE) : 0;
  const total = valid ? round2(parsedAmount! + fee) : 0;

  // 2. Submit handler — opens Paystack hosted page in Telegram in-app browser
  const submit = useCallback(async () => {
    setFormError("");
    if (!valid) {
      setFormError(`Enter an amount between GHS ${DEPOSIT_MIN} and GHS ${DEPOSIT_MAX}.`);
      return;
    }
    setPhase("submitting");
    try {
      const res = await miniAppFetch<{
        ok: boolean;
        authorization_url: string;
        reference: string;
      }>("tg-miniapp-deposit-init", {
        method: "POST",
        body: { amount_ghs: parsedAmount },
      });
      try { getTg()?.HapticFeedback?.notificationOccurred?.("success"); } catch (_) { /* noop */ }
      // Hide the Telegram MainButton BEFORE navigating to Paystack so it
      // doesn't sit stuck-in-loading over the Paystack iframe.
      try { getTg()?.MainButton?.hideProgress?.(); } catch (_) { /* noop */ }
      try { getTg()?.MainButton?.hide?.(); } catch (_) { /* noop */ }
      // Navigate the Mini App webview itself to Paystack. This is the only
      // approach that reliably keeps the user inside Telegram on iOS — calling
      // tg.openLink() with a non-Telegram HTTPS URL opens Safari on iOS and
      // ejects the user from Telegram entirely. Paystack's callback_url
      // returns the webview to /tg/deposit/success?ref=... where polling
      // confirms the credit.
      if (getTg()) {
        window.location.href = res.authorization_url;
      } else {
        // Non-Telegram fallback (dev / browser preview)
        window.open(res.authorization_url, "_blank", "noopener,noreferrer");
        navigate(`/tg/deposit/success?ref=${encodeURIComponent(res.reference)}`);
      }
    } catch (e) {
      try { getTg()?.HapticFeedback?.notificationOccurred?.("error"); } catch (_) { /* noop */ }
      setFormError(prettyError(e instanceof Error ? e.message : String(e)));
      setPhase("form");
    }
  }, [valid, parsedAmount, navigate]);

  // 3. MainButton — only on the form/submitting states
  const mbConfig = useMemo<MainButtonConfig | null>(() => {
    if (phase === "form") {
      return {
        text: valid ? `Pay GHS ${total.toFixed(2)}` : "Enter amount",
        active: valid,
        onClick: submit,
      };
    }
    if (phase === "submitting") {
      return { text: "Opening payment…", active: false, progress: true, onClick: submit };
    }
    return null;
  }, [phase, valid, total, submit]);
  useTgMainButton(mbConfig);

  // ─── Phases ──────────────────────────────────────────────────────────
  if (phase === "loading") {
    return <CenterMsg muted>Loading wallet…</CenterMsg>;
  }
  if (phase === "fatal") {
    return (
      <div className="space-y-4">
        <Header subtitle="Top up your DataSika wallet" />
        <Card tone="error">
          <p className="text-sm font-medium" style={{ color: "#991b1b" }}>{prettyError(fatal)}</p>
          <p className="text-xs mt-2" style={{ color: "#991b1b" }}>
            Reopen this page from inside the bot.
          </p>
        </Card>
      </div>
    );
  }
  if (phase === "needs_link") {
    return (
      <div className="space-y-4">
        <Header subtitle="Top up your DataSika wallet" />
        <Card>
          <p className="text-sm" style={{ color: "#0f172a" }}>
            Wallet deposits need a linked DataSika account.
          </p>
          <Link
            to="/tg/link"
            className="mt-3 inline-block w-full text-center rounded-xl py-3 text-base font-semibold"
            style={{ background: "var(--tg-button, #1e293b)", color: "var(--tg-button-text, #ffffff)" }}
          >
            Link my account
          </Link>
        </Card>
        <FallbackLink href="https://datasika.com/dashboard/wallet" />
      </div>
    );
  }

  const submitting = phase === "submitting";
  return (
    <div className="space-y-4">
      <Header subtitle={info?.first_name ? `Hi ${info.first_name} — top up your wallet` : "Top up your wallet"} />

      <Card>
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium" style={{ color: "#475569" }}>Wallet balance</span>
          <span className="text-2xl font-bold" style={{ color: "#0f172a" }}>
            GHS {balance.toFixed(2)}
          </span>
        </div>
      </Card>

      <Card>
        <Field label="Deposit amount (GHS)">
          <input
            type="number"
            inputMode="decimal"
            min={DEPOSIT_MIN}
            max={DEPOSIT_MAX}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={`Min ${DEPOSIT_MIN} · Max ${DEPOSIT_MAX}`}
            disabled={submitting}
            className="w-full rounded-xl px-3 py-2.5 text-base outline-none border bg-white"
            style={{ borderColor: "#cbd5e1", color: "#0f172a" }}
          />
        </Field>

        <div className="flex flex-wrap gap-2 mt-2">
          {DEPOSIT_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setAmount(String(p))}
              disabled={submitting}
              className="rounded-lg px-3 py-1.5 text-sm font-medium border"
              style={{
                background: parsedAmount === p ? "var(--tg-button, #1e293b)" : "#f8fafc",
                color: parsedAmount === p ? "var(--tg-button-text, #ffffff)" : "#0f172a",
                borderColor: "#cbd5e1",
              }}
            >
              GHS {p}
            </button>
          ))}
        </div>

        <div className="mt-4 rounded-xl p-3 text-sm" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <Row label="Amount" value={`GHS ${(parsedAmount ?? 0).toFixed(2)}`} />
          <Row label="Processing fee (4%)" value={`GHS ${fee.toFixed(2)}`} />
          <div className="h-px my-2" style={{ background: "#e2e8f0" }} />
          <Row label="Total to pay" value={`GHS ${total.toFixed(2)}`} bold />
        </div>

        <div className="mt-4">
          <span className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>
            Payment method
          </span>
          <div
            className="rounded-xl border px-3 py-3 flex items-center justify-between"
            style={{ borderColor: "#cbd5e1", background: "#ffffff" }}
          >
            <div>
              <div className="text-sm font-semibold" style={{ color: "#0f172a" }}>
                Mobile Money or Card
              </div>
              <div className="text-xs mt-0.5" style={{ color: "var(--tg-hint)" }}>
                Secured by Paystack · MTN, Vodafone, AirtelTigo, Visa, Mastercard
              </div>
            </div>
            <span
              className="text-[10px] font-bold uppercase tracking-wide rounded-md px-2 py-1"
              style={{ background: "#dcfce7", color: "#166534" }}
            >
              Selected
            </span>
          </div>
        </div>

        {formError && (
          <div
            className="mt-3 rounded-lg px-3 py-2 text-sm"
            style={{ background: "#fef2f2", color: "#991b1b", border: "1px solid #fecaca" }}
          >
            {formError}
          </div>
        )}

        {/* In-form fallback button — only shown when the Telegram MainButton
            is not available (e.g. opened outside Telegram). */}
        {!getTg() && (
          <button
            type="button"
            onClick={submit}
            disabled={submitting || !valid}
            className="mt-4 w-full rounded-xl py-3 text-base font-semibold transition-opacity"
            style={{
              background: "var(--tg-button, #1e293b)",
              color: "var(--tg-button-text, #ffffff)",
              opacity: submitting || !valid ? 0.6 : 1,
            }}
          >
            {submitting ? "Opening payment…" : valid ? `Pay GHS ${total.toFixed(2)}` : "Enter amount"}
          </button>
        )}

        <p className="text-xs text-center pt-3" style={{ color: "var(--tg-hint)" }}>
          Your wallet credits instantly once Paystack confirms the payment.
        </p>
      </Card>

      <FallbackLink href={fallbackUrl(parsedAmount)} />
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function fallbackUrl(amt: number | null): string {
  const base = "https://datasika.com/dashboard/wallet";
  if (amt == null) return base;
  return `${base}?deposit=${encodeURIComponent(amt)}`;
}

function parseAmount(s: string): number | null {
  const n = Number(String(s).replace(/[, ]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function parsePreset(s: string | null): number | null {
  if (!s) return null;
  return parseAmount(s);
}

/** Bot deep links use start_param like "amt_25" → 25. */
function parseStartParamAmt(sp: string | null): number | null {
  if (!sp) return null;
  const m = /^amt_(\d+(?:[._]\d{1,2})?)$/i.exec(sp);
  if (!m) return null;
  return parseAmount(m[1].replace("_", "."));
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function prettyError(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("session_expired") || m.includes("missing_bearer") || m.includes("bad_session")) {
    return "Your Telegram session expired — please reopen this page from the bot.";
  }
  if (m.includes("rate") || m.includes("too many")) {
    return "Too many attempts. Wait a moment and try again.";
  }
  if (m.includes("between ghs")) return msg; // server validation message
  return msg || "Something went wrong. Try again.";
}

// ─── Bits ─────────────────────────────────────────────────────────────

function Header({ subtitle }: { subtitle: string }) {
  return (
    <header>
      <h1 className="text-xl font-semibold">DataSika · Wallet Top-up</h1>
      <p className="text-sm mt-1" style={{ color: "var(--tg-hint)" }}>{subtitle}</p>
    </header>
  );
}

function Card({
  children,
  tone,
}: { children: React.ReactNode; tone?: "success" | "error" }) {
  const styles =
    tone === "success"
      ? { borderColor: "#bbf7d0", background: "#f0fdf4" }
      : tone === "error"
      ? { borderColor: "#fecaca", background: "#fef2f2" }
      : { borderColor: "#e2e8f0", background: "#ffffff" };
  return (
    <div className="rounded-2xl border p-5" style={styles}>{children}</div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium mb-1" style={{ color: "#475569" }}>{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span style={{ color: "#475569" }}>{label}</span>
      <span style={{ color: "#0f172a", fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
  );
}

function FallbackLink({ href }: { href: string }) {
  function open(e: React.MouseEvent) {
    e.preventDefault();
    const tg = getTg();
    if (tg?.openLink) tg.openLink(href);
    else window.open(href, "_blank", "noopener,noreferrer");
  }
  return (
    <p className="text-xs text-center pt-2" style={{ color: "var(--tg-hint)" }}>
      Trouble paying?{" "}
      <a href={href} onClick={open} className="font-medium underline" style={{ color: "var(--tg-link)" }}>
        Open in browser
      </a>
    </p>
  );
}

function CenterMsg({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div
      className="flex flex-col items-center justify-center py-20 text-sm"
      style={{ color: muted ? "var(--tg-hint)" : "#0f172a" }}
    >
      {children}
    </div>
  );
}
