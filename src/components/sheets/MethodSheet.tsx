import { useEffect, useState } from "react";
import { CreditCard, Smartphone, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Modal from "@/components/ui/modal";
import { FlowHeader } from "@/components/flows/flow-parts";
import { useMethods, type FundingMethod } from "@/store/methods";

/** Manage one saved funding method — set it as the default, or remove it
 *  (with an inline confirm; the last remaining method can't be removed). */

export default function MethodSheet({
  method,
  open,
  onClose,
}: {
  method: FundingMethod | null;
  open: boolean;
  onClose: () => void;
}) {
  const { methods, defaultId, setDefault, removeMethod } = useMethods();
  const [confirming, setConfirming] = useState(false);

  // Fresh state every time the sheet opens or closes.
  useEffect(() => {
    setConfirming(false);
  }, [open]);

  if (!method) return null;

  const isDefault = method.id === defaultId;
  const isLast = methods.length <= 1;
  const Icon = method.kind === "momo" ? Smartphone : CreditCard;

  const makeDefault = () => {
    setDefault(method.id);
    toast("Default updated", {
      description: `${method.name} · ${method.detail} is now your default method.`,
    });
    onClose();
  };

  const startRemove = () => {
    if (isLast) {
      toast("You need at least one method", {
        description: "Add another funding method before removing this one.",
      });
      return;
    }
    setConfirming(true);
  };

  const confirmRemove = () => {
    removeMethod(method.id);
    toast("Method removed", {
      description: isDefault
        ? `${method.name} was removed — your other method is now the default.`
        : `${method.name} · ${method.detail} was removed.`,
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} label={`Manage ${method.name}`}>
      <FlowHeader title="Funding method" subtitle="Manage this method" onClose={onClose} />

      <div className="space-y-5 px-5 pb-7 pt-5">
        {/* Summary */}
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-5 py-7 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-[16px] border border-white/[0.07] bg-white/[0.03] text-[#b7c6be]">
            <Icon size={22} />
          </span>
          <div>
            <p className="text-[15px] font-semibold tracking-tight text-foreground">{method.name}</p>
            <p className="mt-0.5 text-[12.5px] text-faint-foreground tnum">{method.detail}</p>
          </div>
          {isDefault && (
            <span className="rounded-full border border-primary-glow/25 bg-primary/10 px-2.5 py-0.5 text-[10.5px] font-semibold text-primary-glow">
              Default
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2.5">
          {!isDefault && (
            <button type="button" className="onyx-btn-primary w-full" onClick={makeDefault}>
              <Star size={16} /> Set as default
            </button>
          )}

          {confirming ? (
            <div className="space-y-3 rounded-2xl border border-danger/25 bg-danger/[0.06] p-4">
              <p className="text-[13px] leading-relaxed text-foreground">
                Remove <span className="font-semibold">{method.name}</span> ({method.detail})?
                {isDefault && " Your other method will become the default."}
              </p>
              <div className="flex gap-2.5">
                <button
                  type="button"
                  className="min-h-[44px] flex-1 rounded-[14px] border border-danger/30 bg-danger/15 text-[13.5px] font-semibold text-danger transition-colors hover:bg-danger/25"
                  onClick={confirmRemove}
                >
                  Yes, remove
                </button>
                <button
                  type="button"
                  className="onyx-btn-ghost min-h-[44px] flex-1"
                  onClick={() => setConfirming(false)}
                >
                  Keep it
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="onyx-btn-ghost w-full text-danger hover:bg-danger/[0.06]"
              onClick={startRemove}
            >
              <Trash2 size={16} /> Remove method
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
