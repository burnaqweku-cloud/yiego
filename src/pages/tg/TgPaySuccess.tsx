import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { miniAppFetch } from "@/lib/tg-miniapp/api";
import { getTg } from "@/lib/tg-miniapp/sdk";
import { useTgMainButton, type MainButtonConfig } from "@/lib/tg-miniapp/useMainButton";

/**
 * Phase 4 — Order payment success / polling page.
 *
 * Polls tg-miniapp-pay-status every 2.5s for up to 90s. Shows:
 *   pending  → "Waiting for confirmation…"
 *   paid     → "✅ Paid · Dispatching to {network}…"  (supplier_status = queued/processing)
 *   paid     → "✅ Delivered"                         (supplier_status = delivered)
 *   failed   → "⚠️ Payment didn't go through"
 *
 * MainButton: hidden while polling; "Back to bot" once terminal.
 */

type Status = "pending" | "paid" | "failed" | "unknown";
type SupplierStatus = "queued" | "processing" | "delivered" | "failed" | null;

interface StatusResp {
  ok: boolean;
  status: Status;
  order_id: string | null;
  network: string | null;
  bundle_size_gb: number;
  recipient_masked: string;
  supplier_status: SupplierStatus;
  base_amount: number;
  total_payable: number;
}

const POLL_MS = 2_500;
const MAX_MS = 90_000;

export default function TgPaySuccess() {
  const [search] = useSearchParams();
  // Accept ?ref= (Mini App nav) OR ?reference=/?trxref= (Paystack callback append)
  const reference = (search.get("ref") || search.get("reference") || search.get("trxref") || "").trim();
  const [data, setData] = useState<StatusResp | null>(null);
  const [err, setErr] = useState<string>("");
  const [timedOut, setTimedOut] = useState(false);
  const startedAt = useRef<number>(Date.now());

  // Poll
  useEffect(() => {
    if (!reference) {
      setErr("Missing reference.");
      return;
    }
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const r = await miniAppFetch<StatusResp>("tg-miniapp-pay-status", {
          method: "GET",
          query: { reference },
        });
        if (cancelled) return;
        setData(r);
        const terminal =
          r.status === "failed" ||
          (r.status === "paid" && r.supplier_status === "delivered") ||
          (r.status === "paid" && r.supplier_status === "failed");
        if (terminal) {
          try {
            getTg()?.HapticFeedback?.notificationOccurred?.(
              r.status === "failed" || r.supplier_status === "failed" ? "error" : "success",
            );
          } catch (_) { /* noop */ }
          return;
        }
        if (Date.now() - startedAt.current > MAX_MS) {
          setTimedOut(true);
          return;
        }
        timer = window.setTimeout(tick, POLL_MS);
      } catch (e) {
        if (cancelled) return;
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

  // MainButton: hidden while polling unconfirmed; "Back to bot" once terminal/timeout
  const isTerminal =
    !!data && (
      data.status === "failed" ||
      (data.status === "paid" && (data.supplier_status === "delivered" || data.supplier_status === "failed"))
    );
  const showBackButton = isTerminal || timedOut;
  const mbConfig = useMemo<MainButtonConfig | null>(() => {
    if (!showBackButton) return null;
    return { text: "Back to bot", onClick: onBackToBot };
  }, [showBackButton, onBackToBot]);
  useTgMainButton(mbConfig);

  // ─── Render ──────────────────────────────────────────────────────────
  if (!reference) {
    return (
      <div className="space-y-4">
        <Header subtitle="Order status" />
        <Card tone="error">
          <p className="text-sm font-medium" style={{ color: "#991b1b" }}>Missing reference.</p>
        </Card>
      </div>
    );
  }

  // Failed payment
  if (data?.status === "failed") {
    return (
      <div className="space-y-4">
        <Header subtitle="Payment not completed" />
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
            <p className="text-xs mt-3" style={{ color: "var(--tg-hint)" }}>
              Tap <strong>Back to bot</strong> and run /buy again.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // Paid + supplier failed
  if (data?.status === "paid" && data.supplier_status === "failed") {
    return (
      <div className="space-y-4">
        <Header subtitle="Delivery problem" />
        <Card tone="error">
          <div className="text-center">
            <div className="text-3xl mb-2">⚠️</div>
            <h2 className="text-lg font-semibold" style={{ color: "#991b1b" }}>
              Payment received but delivery failed
            </h2>
            <p className="text-sm mt-2" style={{ color: "#991b1b" }}>
              Our team has been notified and will resolve it shortly.
            </p>
            <OrderMeta data={data} reference={reference} />
          </div>
        </Card>
      </div>
    );
  }

  // Delivered
  if (data?.status === "paid" && data.supplier_status === "delivered") {
    return (
      <div className="space-y-4">
        <Header subtitle="Delivered" />
        <Card tone="success">
          <div className="text-center">
            <div className="text-3xl mb-2">✅</div>
            <h2 className="text-lg font-semibold" style={{ color: "#166534" }}>
              Bundle delivered
            </h2>
            <p className="text-sm mt-2" style={{ color: "#166534" }}>
              {data.bundle_size_gb}GB {data.network} sent to {data.recipient_masked}.
            </p>
            <OrderMeta data={data} reference={reference} success />
            <p className="text-xs mt-3" style={{ color: "var(--tg-hint)" }}>
              Tap <strong>Back to bot</strong> to continue.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  // Paid, dispatching
  if (data?.status === "paid") {
    return (
      <div className="space-y-4">
        <Header subtitle="Paid · dispatching" />
        <Card tone="success">
          <div className="text-center">
            <div className="text-3xl mb-2">✅</div>
            <h2 className="text-lg font-semibold" style={{ color: "#166534" }}>
              Paid · dispatching to {data.network ?? "your line"}…
            </h2>
            <p className="text-sm mt-2" style={{ color: "#166534" }}>
              {data.bundle_size_gb}GB · {data.recipient_masked}
            </p>
            <OrderMeta data={data} reference={reference} success />
            <p className="text-xs mt-3" style={{ color: "var(--tg-hint)" }}>
              We'll keep checking. Bundle usually lands within a couple of minutes.
            </p>
          </div>
        </Card>
        {data.order_id && (
          <FallbackLink
            href={`https://yiego.com/track-order?order_id=${encodeURIComponent(data.order_id)}`}
            label="Track in browser"
          />
        )}
      </div>
    );
  }

  // Pending or unknown — still polling
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
              ? "Paystack hasn't confirmed yet. If you completed payment, the bundle will be sent automatically once it does — usually within a few minutes."
              : "Complete the payment in the page that just opened. We'll dispatch the bundle the moment it's confirmed."}
          </p>
          {data && (
            <p className="text-xs mt-3" style={{ color: "var(--tg-hint)" }}>
              {data.bundle_size_gb}GB {data.network} · {data.recipient_masked}
            </p>
          )}
          <p className="text-xs mt-2" style={{ color: "var(--tg-hint)" }}>
            Reference <code className="px-1 rounded bg-slate-100">{reference}</code>
          </p>
          {err && <p className="text-xs mt-2" style={{ color: "#991b1b" }}>{err}</p>}
        </div>
      </Card>
      <FallbackLink
        href={`https://yiego.com/track-order?ref=${encodeURIComponent(reference)}`}
        label={timedOut ? "Still stuck?" : "MoMo prompt didn't appear?"}
      />
    </div>
  );
}

// ─── Bits ─────────────────────────────────────────────────────────────

function OrderMeta({ data, reference, success }: { data: StatusResp; reference: string; success?: boolean }) {
  const muted = success ? "#166534" : "var(--tg-hint)";
  return (
    <div className="text-xs mt-3 space-y-0.5" style={{ color: muted }}>
      {data.order_id && <div>Order <code className="px-1 rounded bg-white/60">{data.order_id}</code></div>}
      <div>Reference <code className="px-1 rounded bg-white/60">{reference}</code></div>
    </div>
  );
}

function Header({ subtitle }: { subtitle: string }) {
  return (
    <header>
      <h1 className="text-xl font-semibold">YieGo · Pay for order</h1>
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
