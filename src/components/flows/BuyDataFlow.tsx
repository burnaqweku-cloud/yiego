import { useEffect, useState } from "react";
import { ChevronRight, TriangleAlert, Wifi } from "lucide-react";
import Modal from "@/components/ui/modal";
import { FlowFooter, FlowHeader, ProcessingView, SelectRow, SuccessView } from "./flow-parts";
import PinGate from "./PinGate";
import { BUNDLES, NETWORKS, type Bundle, type Network } from "@/data/bundles";
import { useWallet, nowLabel } from "@/store/wallet";
import { useProfile } from "@/store/profile";
import { formatGHS } from "@/lib/format";

type Step = "network" | "bundle" | "phone" | "review" | "pin" | "processing" | "success";

function netShort(n: Network): string {
  if (n.id === "at") return "AT";
  return n.name.slice(0, 3).toUpperCase();
}

function NetLogo({ network }: { network: Network }) {
  return (
    <span
      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border bg-white/[0.03] text-[12px] font-bold tracking-tight"
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
  const { balance, debit } = useWallet();
  const { profile } = useProfile();
  const needPin = profile.pinSet && !!profile.pinHash;
  const [step, setStep] = useState<Step>("network");
  const [network, setNetwork] = useState<Network | null>(null);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [phone, setPhone] = useState(profile.phone);

  // Reset on every open AND close. Resetting on close is what cancels a
  // pending "processing" timer (the step-effect cleanup fires), so closing
  // mid-processing can never silently charge the wallet.
  useEffect(() => {
    setStep("network");
    setNetwork(null);
    setBundle(null);
    setPhone(profile.phone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const digits = phone.replace(/\D/g, "");
  const phoneValid = digits.length === 10 && digits.startsWith("0");
  const masked = phoneValid ? `${digits.slice(0, 3)} ••• ${digits.slice(7)}` : phone;
  const price = bundle?.price ?? 0;
  const canPay = balance >= price;

  // Simulate the purchase, then commit it to the wallet.
  useEffect(() => {
    if (step !== "processing" || !network || !bundle) return;
    const id = window.setTimeout(() => {
      debit(bundle.price, {
        type: "data",
        title: `${network.name} Data — ${bundle.size}`,
        subtitle: `${masked} · ${nowLabel()}`,
      });
      setStep("success");
    }, 1700);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  return (
    <Modal open={open} onClose={onClose} label="Buy data">
      {step === "network" && (
        <>
          <FlowHeader title="Buy data" subtitle="Choose a network" onClose={onClose} />
          <div className="space-y-2.5 px-5 pb-6 pt-4">
            {NETWORKS.map((n) => (
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
            subtitle="Pick a data bundle"
            onBack={() => setStep("network")}
            onClose={onClose}
          />
          <div className="space-y-2.5 px-5 pb-6 pt-4">
            {BUNDLES[network.id].map((b) => (
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
              <button type="button" className="onyx-pill mt-3" onClick={() => setPhone(profile.phone)}>
                Use my number
              </button>
            </div>

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
                <p className="text-[13px] font-semibold text-foreground">Pay from Wallet</p>
                <p className="text-[12px] text-faint-foreground tnum">
                  Balance {formatGHS(balance)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[12px] text-faint-foreground">Balance after</p>
                <p
                  className={`text-[13.5px] font-semibold tnum ${
                    canPay ? "text-foreground" : "text-danger"
                  }`}
                >
                  {formatGHS(balance - price)}
                </p>
              </div>
            </div>

            {!canPay && (
              <div className="flex items-start gap-2.5 rounded-2xl border border-danger/25 bg-danger/[0.08] px-4 py-3">
                <TriangleAlert size={16} className="mt-0.5 shrink-0 text-danger" />
                <p className="text-[12.5px] leading-relaxed text-[#f0c9c4]">
                  Not enough in your wallet. Add money to complete this purchase.
                </p>
              </div>
            )}
          </div>
          <FlowFooter>
            {canPay ? (
              <button
                type="button"
                className="onyx-btn-primary w-full"
                onClick={() => setStep(needPin ? "pin" : "processing")}
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

      {step === "pin" && (
        <PinGate
          onConfirm={() => setStep("processing")}
          onBack={() => setStep("review")}
          onClose={onClose}
        />
      )}

      {step === "processing" && <ProcessingView label="Sending your data…" />}

      {step === "success" && network && bundle && (
        <SuccessView
          title="Data on its way!"
          message={`${bundle.size} sent to ${masked} on ${network.name}.`}
          rows={[
            { label: "Bundle", value: `${network.name} ${bundle.size}` },
            { label: "Recipient", value: masked },
            { label: "Paid", value: formatGHS(bundle.price) },
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
