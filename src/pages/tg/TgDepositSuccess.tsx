import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { miniAppFetch } from "@/lib/tg-miniapp/api";
import { getTg } from "@/lib/tg-miniapp/sdk";
import { useTgMainButton, type MainButtonConfig } from "@/lib/tg-miniapp/useMainButton";

/**
 * Phase 3 — Deposit success / polling page.
 *
 * The Mini App opens Paystack via tg.openLink() — Telegram does NOT call
 * us back when payment completes. So we rely on the webhook + polling.
 * We poll tg-miniapp-deposit-status every 2.5s for up to 90s.
 *
 * Terminal states: confirmed / failed. Otherwise: pending.
 *
 * MainButton: hidden while pending; "Back to bot" once terminal.
 */

type Status = "pending" | "confirmed" | "failed" | "unknown";

const POLL_MS = 2_500;
const MAX_MS = 90_000;

export default function TgDepositSuccess() {
  const [search] = useSearchParams();
  // Accept ?ref= (Mini App nav) OR ?reference=/?trxref= (Paystack callback append)
  const reference = (search.get("ref") || search.get("reference") || search.get("trxref") || "").trim();
  const [status, setStatus] = useState<Status>("pending");
  const [balance, setBalance] = useState<number>(0);
  const [baseAmount, setBaseAmount] = useState<number>(0);
  const [err, setErr] = useState<string>("");
  const [timedOut, setTimedOut] = useState(false);
  const startedAt = useRef<number>(Date.now());

  // Polling loop
  useEffect(() => {
    if (!reference) {
      setErr("Missing reference.");
      return;
    }
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const r = await miniAppFetch<{
          ok: boolean;
          status: Status;
          balance_ghs: number;
          base_amount: number;
        }>("tg-miniapp-deposit-status", {
          method: "GET",
          query: { reference },
        });
        if (cancelled) return;
        setBalance(Number(r?.balance_ghs ?? 0));
        setBaseAmount(Number(r?.base_amount ?? 0));
        setStatus(r?.status ?? "unknown");
        if (r?.status === "confirmed" || r?.status === "failed") {
          try {
            getTg()?.HapticFeedback?.notificationOccurred?.(
              r.status === "confirmed" ? "success" : "error",
            );
          } catch (_) { /* noop */ }
          return; // stop polling
        }
        // keep polling within budget
        if (Date.now() - startedAt.current > MAX_MS) {
          setTimedOut(true);
          return;
        }
        timer = window.setTimeout(tick, POLL_MS);
      } catch (e) {
        if (cancelled) return;
        // soft-fail: keep retrying within the budget
        if (Date.now() - startedAt.current > MAX_MS) {
          setErr(e instanceof Error ? e.message : "Status check failed");
          setTimedOut(true);
          return;
        }
        timer = window.setTimeout(tick, POLL_MS);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [reference]);

  const onBackToBot = useCallback(() => {
    const tg = getTg();
    if (!tg) return;
    try { tg.HapticFeedback?.notificationOccurred?.("success"); } catch (_) { /* noop */ }
    tg.close();
  }, []);

  const terminal = status === "confirmed" || status === "failed" || timedOut;
  const mbConfig = useMemo<MainButtonConfig | null>(() => {
    if (!terminal) return null;
    return { text: "Back to bot", onClick: onBackToBot };
  }, [terminal, onBackToBot]);
  useTgMainButton(mbConfig);

  // ─── Render ──────────────────────────────────────────────────────────
  if (!reference) {
    return (
      <div className="space-y-4">
        <Header subtitle="Deposit status" />
        <Card tone="error">
          <p className="text-sm font-medium" style={{ color: "#991b1b" }}>
            Missing reference.
          </p>
          <Link
            to="/tg/deposit"
            className="mt-3 inline-block w-full text-center rounded-xl py-3 text-base font-semibold"
            style={{ background: "var(--tg-button, #1e293b)", color: "var(--tg-button-text, #ffffff)" }}
          >
            Start a new top-up
          </Link>
        </Card>
      </div>
    );
  }

  if (status === "confirmed") {
    return (
      <div className="space-y-4">
        <Header subtitle="Deposit confirmed" />
        <Card tone="success">
          <div className="text-center">
            <div className="text-3xl mb-2">✅</div>
            <h2 className="text-lg font-semibold" style={{ color: "#166534" }}>
              GHS {baseAmount.toFixed(2)} added to your wallet
            </h2>
            <p className="text-sm mt-2" style={{ color: "#166534" }}>
              New balance: <strong>GHS {balance.toFixed(2)}</strong>
            </p>
            <p className="text-xs mt-3" style={{ color: "var(--tg-hint)" }}>
              Tap <strong>Back to bot</strong> to continue.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="space-y-4">
        <Header subtitle="Deposit not completed" />
        <Card tone="error">
          <div className="text-center">
            <div className="text-3xl mb-2">⚠️</div>
            <h2 className="text-lg font-semibold" style={{ color: "#991b1b" }}>
              Payment didn't go through
            </h2>
            <p className="text-sm mt-2" style={{ color: "#991b1b" }}>
              Reference <code className="px-1 rounded bg-white/60">{reference}</code> was
              cancelled or failed at Paystack. No money was deducted.
            </p>
          </div>
          <Link
            to="/tg/deposit"
            className="mt-4 inline-block w-full text-center rounded-xl py-3 text-base font-semibold"
            style={{ background: "var(--tg-button, #1e293b)", color: "var(--tg-button-text, #ffffff)" }}
          >
            Try again
          </Link>
        </Card>
      </div>
    );
  }

  // pending or timed-out
  return (
    <div className="space-y-4">
      <Header subtitle="Confirming your payment" />
      <Card>
        <div className="text-center">
          <div className="text-3xl mb-2">{timedOut ? "⏳" : "⌛"}</div>
          <h2 className="text-lg font-semibold" style={{ color: "#0f172a" }}>
            {timedOut ? "Still waiting on Paystack…" : "Waiting for confirmation…"}
          </h2>
          <p className="text-sm mt-2" style={{ color: "var(--tg-hint)" }}>
            {timedOut
              ? "Paystack hasn't confirmed yet. If you completed payment, your wallet will credit automatically once it does — usually within a few minutes."
              : "Complete the payment in the page that just opened. We'll credit your wallet the moment it's confirmed."}
          </p>
          <p className="text-xs mt-3" style={{ color: "var(--tg-hint)" }}>
            Reference <code className="px-1 rounded bg-slate-100">{reference}</code>
          </p>
          {err && (
            <p className="text-xs mt-2" style={{ color: "#991b1b" }}>{err}</p>
          )}
        </div>
      </Card>
      {timedOut && (
        <Link
          to="/tg/deposit"
          className="inline-block w-full text-center rounded-xl py-3 text-base font-semibold"
          style={{ background: "#f1f5f9", color: "#0f172a", border: "1px solid #cbd5e1" }}
        >
          Start a new top-up
        </Link>
      )}
      <FallbackLink
        href="https://datasika.com/dashboard/wallet"
        label={timedOut ? "Still stuck?" : "MoMo prompt didn't appear?"}
      />
    </div>
  );
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
  return <div className="rounded-2xl border p-5" style={styles}>{children}</div>;
}

function FallbackLink({ href, label = "Trouble?" }: { href: string; label?: string }) {
  function open(e: React.MouseEvent) {
    e.preventDefault();
    const tg = getTg();
    if (tg?.openLink) tg.openLink(href);
    else window.open(href, "_blank", "noopener,noreferrer");
  }
  return (
    <p className="text-xs text-center pt-2" style={{ color: "var(--tg-hint)" }}>
      {label}{" "}
      <a href={href} onClick={open} className="font-medium underline" style={{ color: "var(--tg-link)" }}>
        Open in browser
      </a>
    </p>
  );
}
