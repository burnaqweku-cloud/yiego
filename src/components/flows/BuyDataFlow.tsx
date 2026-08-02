import { useEffect, useState } from "react";
import { ChevronRight, Wifi } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader, ProcessingView, SelectRow, SuccessView } from "./flow-parts";
import { NETWORKS, type Bundle, type Network } from "@/data/bundles";
import { useWallet } from "@/store/wallet";
import { useProfile } from "@/store/profile";
import { useAuth } from "@/store/auth-context";
import { formatGHS } from "@/lib/format";
import {
  createGuestDataPayment,
  createWalletDataOrder,
  loadPhase1Products,
  type Phase1Product,
} from "@/lib/phase1-api";

type Step = "network" | "bundle" | "phone" | "review" | "processing" | "success";
type PaymentMethod = "wallet" | "paystack";

function netShort(n: Network): string {
  if (n.id === "at") return "AT";
  return n.name.slice(0, 3).toUpperCase();
}

function NetLogo({ network }: { network: Network }) {
  return (
    <span
      className="onyx-netlogo grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-white/[0.03] text-[12px] font-bold tracking-tight"
      style={{ color: network.color, borderColor: `${network.color}55` }}
    >
      {netShort(network)}
    </span>
  );
}

function BundleTag({ tag }: { tag: NonNullable<Bundle["tag"]> }) {
  const best = tag === "Best value";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.05em] ${
        best
          ? "border-amber/25 bg-amber/[0.12] text-amber"
          : "border-primary-glow/20 bg-primary/[0.12] text-primary-glow"
      }`}
    >
      {tag}
    </span>
  );
}

export default function BuyDataFlow({
  open,
  onClose,
  onAddMoney,
}: {
  open: boolean;
  onClose: () => void;
  onAddMoney: () => void;
}) {
  const { balance } = useWallet();
  const { profile } = useProfile();
  const { isAuthenticated, user } = useAuth();
  const [step, setStep] = useState<Step>("network");
  const [network, setNetwork] = useState<Network | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [products, setProducts] = useState<Phase1Product[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);
  const [phone, setPhone] = useState(profile.phone);
  const [guestEmail, setGuestEmail] = useState(profile.email);
  const [receiptRef, setReceiptRef] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("wallet");

  // Reset on every open AND close. Resetting on close is what cancels a
  // pending "processing" timer (the step-effect cleanup fires), so closing
  // mid-processing can never silently charge the wallet.
  useEffect(() => {
    setStep("network");
    setNetwork(null);
    setBundle(null);
    setPhone(profile.phone);
    setGuestEmail(user?.email ?? profile.email);
    setPaymentMethod("wallet");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.email]);

  useEffect(() => {
    let mounted = true;

    async function loadProducts() {
      setProductsLoading(true);
      const result = await loadPhase1Products();

      if (!mounted) return;

      if (result.error) {
        setProducts([]);
        setProductsError("Bundles are temporarily unavailable. Please try again.");
      } else {
        setProducts(result.data);
        setProductsError(result.data.length === 0 ? "No data bundles are available right now." : null);
      }

      setProductsLoading(false);
    }

    if (open) {
      loadProducts();
    }

    return () => {
      mounted = false;
    };
  }, [open]);

  const digits = phone.replace(/\D/g, "");
  const phoneValid = digits.length === 10 && digits.startsWith("0");
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim());
  const masked = phoneValid ? `${digits.slice(0, 3)} ••• ${digits.slice(7)}` : phone;
  const price = bundle?.price ?? 0;
  const canPay = balance >= price;
  function bundlesFor(networkId: Network["id"]) {
    const prefix = networkId === "mtn" ? "mtn" : networkId === "telecel" ? "tel" : "at";
    return products
      .filter((product) => product.app_product_code?.startsWith(prefix))
      .map((product) => ({
        id: product.app_product_code ?? product.id,
        size: product.name.replace(/^.*?—\s*/, ""),
        validity: product.validity ?? "Supplier terms",
        price: Number(product.customer_price),
        tag:
          Number(product.customer_price) <= 10
            ? "Popular"
            : Number(product.customer_price) >= 40
              ? "Best value"
              : undefined,
      }));
  }

  const startPaystackCheckout = async () => {
    if (!network || !bundle) return;

    if (!emailValid) {
      toast.error("Enter a valid email for your receipt");
      return;
    }

    setStep("processing");
    const result = await createGuestDataPayment({
      productId: bundle.id,
      recipientPhone: digits,
      guestEmail: guestEmail.trim(),
      guestPhone: digits,
    });

    if (result.error || !result.data?.data?.authorizationUrl) {
      toast.error(result.error ?? "Could not start Paystack payment");
      setStep("review");
      return;
    }

    window.location.assign(result.data.data.authorizationUrl);
  };

  const startWalletCheckout = async () => {
    if (!network || !bundle) return;

    setStep("processing");
    const result = await createWalletDataOrder({
      productId: bundle.id,
      recipientPhone: digits,
    });

    if (result.error || !result.data?.data?.orderReference) {
      toast.error(result.error ?? "Could not create wallet order");
      setStep("review");
      return;
    }

    setReceiptRef(result.data.data.orderReference);
    setStep("success");
  };

  return (
    <Modal open={open} onClose={onClose} label="Buy data">
      {step === "network" && (
        <>
          <FlowHeader title="Buy data" subtitle="Choose a network" onClose={onClose} />
          <div className="space-y-2.5 px-5 pb-6 pt-4">
            {productsLoading && (
              <p className="px-1 pb-2 text-[12px] text-faint-foreground">
                Loading available bundles...
              </p>
            )}
            {productsError && <p className="rounded-xl border border-danger/20 bg-danger/[0.08] p-3 text-xs text-ink-rose">{productsError}</p>}
            {!productsError && NETWORKS.map((n) => (
              <SelectRow
                key={n.id}
                onClick={() => {
                  setNetwork(n);
                  setBundle(null);
                  setStep("bundle");
                }}
                leading={<NetLogo network={n} />}
                title={n.name}
                subtitle="Data bundles"
                trailing={<ChevronRight size={18} className="shrink-0 text-faint-foreground" />}
              />
            ))}
          </div>
        </>
      )}

      {step === "bundle" && network && (
        <>
          <FlowHeader
            title={`${network.name} bundles`}
            subtitle="Choose a data bundle"
            onBack={() => setStep("network")}
            onClose={onClose}
          />
          <div className="space-y-2.5 px-5 pb-6 pt-4">
            {bundlesFor(network.id).map((b) => (
              <SelectRow
                key={b.id}
                onClick={() => {
                  setBundle(b);
                  setStep("phone");
                }}
                leading={
                  <span className="onyx-tile-icon shrink-0">
                    <Wifi size={18} />
                  </span>
                }
                title={
                  <span className="flex items-center gap-2">
                    {b.size}
                    {b.tag && <BundleTag tag={b.tag} />}
                  </span>
                }
                subtitle={`Valid ${b.validity}`}
                trailing={
                  <span className="shrink-0 font-display text-[15px] font-semibold tnum text-white">
                    {formatGHS(b.price)}
                  </span>
                }
              />
            ))}
            {bundlesFor(network.id).length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">No bundles are currently available for this network.</p>
            )}
          </div>
        </>
      )}

      {step === "phone" && network && bundle && (
        <>
          <FlowHeader
            title="Recipient"
            subtitle={`${network.name} · ${bundle.size}`}
            onBack={() => setStep("bundle")}
            onClose={onClose}
          />
          <div className="space-y-4 px-5 pb-2 pt-5">
            <div>
              <label
                htmlFor="buydata-phone"
                className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint-foreground"
              >
                Phone number
              </label>
              <input
                id="buydata-phone"
                className="onyx-field mt-2 text-[16px] tracking-wide tnum"
                inputMode="numeric"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="024 000 0000"
              />
              {phone.length > 0 && !phoneValid && (
                <p className="mt-1.5 text-[12px] text-danger">
                  Enter a valid 10-digit Ghana number.
                </p>
              )}
              {isAuthenticated && /^0\d{9}$/.test(profile.phone) && (
                <button type="button" className="onyx-pill mt-3" onClick={() => setPhone(profile.phone)}>Use my number</button>
              )}
            </div>

            {!isAuthenticated && (
              <div>
                <label
                  htmlFor="buydata-email"
                  className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint-foreground"
                >
                  Email for receipt
                </label>
                <input
                  id="buydata-email"
                  className="onyx-field mt-2 text-[15px]"
                  inputMode="email"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                  placeholder="you@example.com"
                />
                {guestEmail.length > 0 && !emailValid && (
                  <p className="mt-1.5 text-[12px] text-danger">
                    Enter a valid email address.
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
              <div>
                <p className="text-[13.5px] font-semibold text-foreground">
                  {network.name} · {bundle.size}
                </p>
                <p className="text-[12px] text-faint-foreground">Valid {bundle.validity}</p>
              </div>
              <span className="font-display text-[16px] font-semibold tnum text-white">
                {formatGHS(bundle.price)}
              </span>
            </div>
          </div>
          <FlowFooter>
            <button
              type="button"
              className="onyx-btn-primary w-full disabled:pointer-events-none disabled:opacity-40"
              disabled={!phoneValid}
              onClick={() => setStep("review")}
            >
              Continue
            </button>
          </FlowFooter>
        </>
      )}

      {step === "review" && network && bundle && (
        <>
          <FlowHeader title="Review & pay" onBack={() => setStep("phone")} onClose={onClose} />
          <div className="space-y-4 px-5 pb-2 pt-5">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1.5">
              {[
                { label: "Network", value: network.name },
                { label: "Bundle", value: `${bundle.size} · valid ${bundle.validity}` },
                { label: "Recipient", value: masked },
                ...(!isAuthenticated ? [{ label: "Receipt email", value: guestEmail.trim() }] : []),
                { label: "Fee", value: "Free" },
              ].map((r, i) => (
                <div
                  key={r.label}
                  className={`flex items-center justify-between gap-4 px-3.5 py-3 ${
                    i > 0 ? "border-t border-white/[0.05]" : ""
                  }`}
                >
                  <span className="text-[12.5px] text-faint-foreground">{r.label}</span>
                  <span className="truncate text-right text-[13.5px] font-semibold text-foreground">
                    {r.value}
                  </span>
                </div>
              ))}
              <div className="flex items-center justify-between gap-4 border-t border-white/[0.08] px-3.5 py-3.5">
                <span className="text-[13px] font-semibold text-foreground">Amount</span>
                <span className="font-display text-[18px] font-semibold tnum text-white">
                  {formatGHS(bundle.price)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3.5">
              <div>
                <p className="text-[13px] font-semibold text-foreground">{isAuthenticated ? "Choose payment method" : "Pay with Paystack"}</p>
                <p className="text-[12px] text-faint-foreground tnum">{isAuthenticated ? "Wallet or direct Paystack checkout" : "Guest checkout with Paystack"}</p>
              </div>
              <div className="text-right">
                <p className="text-[12px] text-faint-foreground">
                  {isAuthenticated && paymentMethod === "wallet" ? (canPay ? "Balance after" : "Amount needed") : "Payment method"}
                </p>
                <p
                  className={`text-[13.5px] font-semibold tnum ${
                    canPay || paymentMethod === "paystack" || !isAuthenticated ? "text-foreground" : "text-danger"
                  }`}
                >
                  {isAuthenticated && paymentMethod === "wallet" ? formatGHS(canPay ? balance - price : price - balance) : "Mobile Money / Card"}
                </p>
              </div>
            </div>

            {isAuthenticated && (
              <div className="grid grid-cols-2 gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-1.5" aria-label="Payment method">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("wallet")}
                  className={`rounded-xl px-3 py-3 text-left transition ${paymentMethod === "wallet" ? "border border-primary-glow/25 bg-primary/[0.12] text-primary-glow" : "border border-transparent text-muted-foreground hover:bg-white/[0.04]"}`}
                >
                  <span className="block text-xs font-semibold">YieGo Wallet</span>
                  <span className="mt-1 block text-[11px] opacity-80">{formatGHS(balance)} available</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("paystack")}
                  className={`rounded-xl px-3 py-3 text-left transition ${paymentMethod === "paystack" ? "border border-primary-glow/25 bg-primary/[0.12] text-primary-glow" : "border border-transparent text-muted-foreground hover:bg-white/[0.04]"}`}
                >
                  <span className="block text-xs font-semibold">Paystack</span>
                  <span className="mt-1 block text-[11px] opacity-80">MoMo or card</span>
                </button>
              </div>
            )}
          </div>
          <FlowFooter>
            {!isAuthenticated ? (
              <button
                type="button"
                className="onyx-btn-primary w-full disabled:pointer-events-none disabled:opacity-40"
                disabled={!emailValid}
                onClick={startPaystackCheckout}
              >
                Pay {formatGHS(bundle.price)} with Paystack
              </button>
            ) : paymentMethod === "paystack" ? (
              <button
                type="button"
                className="onyx-btn-primary w-full"
                onClick={startPaystackCheckout}
              >
                Pay {formatGHS(bundle.price)} with Paystack
              </button>
            ) : canPay ? (
              <button
                type="button"
                className="onyx-btn-primary w-full"
                onClick={startWalletCheckout}
              >
                Pay {formatGHS(bundle.price)}
              </button>
            ) : (
              <button type="button" className="onyx-btn-primary w-full" onClick={onAddMoney}>
                Add money
              </button>
            )}
          </FlowFooter>
        </>
      )}

      {step === "processing" && (
        <ProcessingView label={isAuthenticated && paymentMethod === "wallet" ? "Sending your data…" : "Opening Paystack…"} />
      )}

      {step === "success" && network && bundle && (
        <SuccessView
          title="Data on its way!"
          message={`${bundle.size} sent to ${masked} on ${network.name}.`}
          rows={[
            { label: "Bundle", value: `${network.name} ${bundle.size}` },
            { label: "Recipient", value: masked },
            { label: "Paid", value: formatGHS(bundle.price) },
            ...(receiptRef ? [{ label: "Reference", value: receiptRef }] : []),
          ]}
          primaryLabel="Done"
          onPrimary={onClose}
          secondaryLabel="Buy again"
          onSecondary={() => {
            setNetwork(null);
            setBundle(null);
            setStep("network");
          }}
        />
      )}
    </Modal>
  );
}
