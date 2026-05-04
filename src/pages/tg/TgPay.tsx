import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { getSession, miniAppFetch } from "@/lib/tg-miniapp/api";
import { getTg } from "@/lib/tg-miniapp/sdk";
import { useTgMainButton, type MainButtonConfig } from "@/lib/tg-miniapp/useMainButton";

/**
 * Phase 4 — Order Payment Mini App.
 *
 * Flow:
 *   1. Resolve order reference from ?ref= OR start_param=pay_<TGORD-XXX>.
 *   2. GET tg-miniapp-pay-init?reference=… → preview details.
 *   3. Show order summary (network, bundle, recipient, amount + 4% fee).
 *   4. MainButton "Pay GHS X.XX" → POST tg-miniapp-pay-init →
 *      tg.openLink(authorization_url) → navigate /tg/pay/success?ref=NEW_REF.
 *
 * The Mini App stays mounted while Paystack opens in Telegram's in-app
 * browser. When the user dismisses it, they're already on the success
 * polling page.
 */

type Phase = "loading" | "preview" | "submitting" | "fatal" | "already_paid";

interface OrderPreview {
  reference: string;
  order_id: string | null;
  network: string | null;
  bundle_size_gb: number;
  recipient_masked: string;
  amount_ghs: number;
  fee: number;
  total_payable: number;
  already_paid: boolean;
}

export default function TgPay() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [phase, setPhase] = useState<Phase>("loading");
  const [fatal, setFatal] = useState("");
  const [preview, setPreview] = useState<OrderPreview | null>(null);
  const [formError, setFormError] = useState("");

  // 1. Bootstrap: resolve reference + fetch preview
  useEffect(() => {
    (async () => {
      try {
        const s = await getSession();
        // Guest sessions are allowed — order ownership is enforced server-side
        // by chat_id when the intent has no linked user.
        const ref = resolveReference(search.get("ref"), s.start_param);
        if (!ref) {
          setFatal("Missing order reference. Reopen this page from the bot's Pay button.");
          setPhase("fatal");
          return;
        }
        const r = await miniAppFetch<OrderPreview & { ok: true }>(
          "tg-miniapp-pay-init",
          { method: "GET", query: { reference: ref } },
        );
        setPreview(r);
        setPhase(r.already_paid ? "already_paid" : "preview");
      } catch (e) {
        setFatal(e instanceof Error ? e.message : String(e));
        setPhase("fatal");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. Submit handler — POST init → openLink → navigate to success page
  const submit = useCallback(async () => {
    if (!preview) return;
    setFormError("");
    setPhase("submitting");
    try {
      const res = await miniAppFetch<{
        ok: boolean;
        authorization_url: string;
        reference: string;
      }>("tg-miniapp-pay-init", {
        method: "POST",
        body: { order_reference: preview.reference },
      });
      try { getTg()?.HapticFeedback?.notificationOccurred?.("success"); } catch (_) { /* noop */ }
      // Hide the Telegram MainButton BEFORE navigating to Paystack so it
      // doesn't sit stuck-in-loading on top of the Paystack iframe.
      try { getTg()?.MainButton?.hideProgress?.(); } catch (_) { /* noop */ }
      try { getTg()?.MainButton?.hide?.(); } catch (_) { /* noop */ }
      // Navigate the Mini App webview itself to Paystack. tg.openLink() on
      // iOS opens Safari (system browser) for non-Telegram URLs, ejecting the
      // user from Telegram. Webview navigation keeps them inside; Paystack's
      // callback_url returns them to /tg/pay/success?ref=...
      if (getTg()) {
        window.location.href = res.authorization_url;
      } else {
        window.open(res.authorization_url, "_blank", "noopener,noreferrer");
        navigate(`/tg/pay/success?ref=${encodeURIComponent(res.reference)}`);
      }
    } catch (e) {
      try { getTg()?.HapticFeedback?.notificationOccurred?.("error"); } catch (_) { /* noop */ }
      setFormError(prettyError(e instanceof Error ? e.message : String(e)));
      setPhase("preview");
    }
  }, [preview, navigate]);

  // 3. MainButton
  const mbConfig = useMemo<MainButtonConfig | null>(() => {
    if (phase === "preview" && preview) {
      return {
        text: `Pay GHS ${preview.total_payable.toFixed(2)}`,
        active: true,
        onClick: submit,
      };
    }
    if (phase === "submitting") {
      return { text: "Opening payment…", active: false, progress: true, onClick: submit };
    }
    return null;
  }, [phase, preview, submit]);
  useTgMainButton(mbConfig);

  // ─── Phases ──────────────────────────────────────────────────────────
  if (phase === "loading") return <CenterMsg muted>Loading order…</CenterMsg>;

  if (phase === "fatal") {
    return (
      <div className="space-y-4">
        <Header subtitle="Order payment" />
        <Card tone="error">
          <p className="text-sm font-medium" style={{ color: "#991b1b" }}>{prettyError(fatal)}</p>
          <p className="text-xs mt-2" style={{ color: "#991b1b" }}>
            Reopen this page from inside the bot.
          </p>
        </Card>
      </div>
    );
  }

  if (phase === "already_paid" && preview) {
    return (
      <div className="space-y-4">
        <Header subtitle="Order already paid" />
        <Card tone="success">
          <div className="text-center">
            <div className="text-3xl mb-2">✅</div>
            <h2 className="text-lg font-semibold" style={{ color: "#166534" }}>
              This order is already paid
            </h2>
            <p className="text-sm mt-2" style={{ color: "#166534" }}>
              {preview.bundle_size_gb}GB {preview.network} · {preview.recipient_masked}
            </p>
            <p className="text-xs mt-3" style={{ color: "var(--tg-hint)" }}>
              Reference <code className="px-1 rounded bg-white/60">{preview.reference}</code>
            </p>
          </div>
          <Link
            to={`/tg/pay/success?ref=${encodeURIComponent(preview.reference)}`}
            className="mt-4 inline-block w-full text-center rounded-xl py-3 text-base font-semibold"
            style={{ background: "var(--tg-button, #1e293b)", color: "var(--tg-button-text, #ffffff)" }}
          >
            View status
          </Link>
        </Card>
      </div>
    );
  }

  if (!preview) return <CenterMsg muted>Loading order…</CenterMsg>;

  const submitting = phase === "submitting";
  return (
    <div className="space-y-4">
      <Header subtitle="Confirm and pay for your order" />

      <Card>
        <div className="rounded-xl p-3 text-sm" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
          <Row label="Bundle" value={`${preview.bundle_size_gb}GB ${preview.network ?? ""}`.trim()} bold />
          <Row label="Recipient" value={preview.recipient_masked} />
          <div className="h-px my-2" style={{ background: "#e2e8f0" }} />
          <Row label="Bundle price" value={`GHS ${preview.amount_ghs.toFixed(2)}`} />
          <Row label="Processing fee (4%)" value={`GHS ${preview.fee.toFixed(2)}`} />
          <div className="h-px my-2" style={{ background: "#e2e8f0" }} />
          <Row label="Total to pay" value={`GHS ${preview.total_payable.toFixed(2)}`} bold />
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

        {/* In-form fallback button — only when MainButton isn't available */}
        {!getTg() && (
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="mt-4 w-full rounded-xl py-3 text-base font-semibold transition-opacity"
            style={{
              background: "var(--tg-button, #1e293b)",
              color: "var(--tg-button-text, #ffffff)",
              opacity: submitting ? 0.6 : 1,
            }}
          >
            {submitting ? "Opening payment…" : `Pay GHS ${preview.total_payable.toFixed(2)}`}
          </button>
        )}

        <p className="text-xs text-center pt-3" style={{ color: "var(--tg-hint)" }}>
          We deliver the bundle automatically once Paystack confirms the payment.
        </p>
      </Card>

      <p className="text-xs text-center pt-2" style={{ color: "var(--tg-hint)" }}>
        Trouble paying?{" "}
        <FallbackOpenLink reference={preview.reference} />
      </p>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

/** Reference can come from URL ?ref= OR start_param=pay_<TGORD-XXXX>. */
function resolveReference(fromUrl: string | null, startParam: string | null): string | null {
  const u = (fromUrl || "").trim();
  if (u) return u;
  if (!startParam) return null;
  const m = /^pay_(.+)$/i.exec(startParam);
  return m ? m[1] : null;
}

function prettyError(msg: string): string {
  const m = (msg || "").toLowerCase();
  if (m.includes("session_expired") || m.includes("missing_bearer") || m.includes("bad_session")) {
    return "Your Telegram session expired — please reopen this page from the bot.";
  }
  if (m.includes("not found")) return "We couldn't find this order. It may have expired — start a new /buy in the bot.";
  if (m.includes("different account")) return "This order belongs to a different account.";
  if (m.includes("already been paid") || m.includes("already paid")) return "This order has already been paid.";
  if (m.includes("rate") || m.includes("too many")) return "Too many attempts. Wait a moment and try again.";
  return msg || "Something went wrong. Try again.";
}

function FallbackOpenLink({ reference }: { reference: string }) {
  const href = `https://datasika.com/track-order?ref=${encodeURIComponent(reference)}`;
  function open(e: React.MouseEvent) {
    e.preventDefault();
    const tg = getTg();
    if (tg?.openLink) tg.openLink(href);
    else window.open(href, "_blank", "noopener,noreferrer");
  }
  return (
    <a href={href} onClick={open} className="font-medium underline" style={{ color: "var(--tg-link)" }}>
      Open in browser
    </a>
  );
}

// ─── Bits ─────────────────────────────────────────────────────────────

function Header({ subtitle }: { subtitle: string }) {
  return (
    <header>
      <h1 className="text-xl font-semibold">DataSika · Pay for order</h1>
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

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span style={{ color: "#475569" }}>{label}</span>
      <span style={{ color: "#0f172a", fontWeight: bold ? 700 : 500 }}>{value}</span>
    </div>
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
