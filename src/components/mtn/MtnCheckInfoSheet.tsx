import { Link } from "react-router-dom";
import { Check, Clock, X } from "lucide-react";
import Modal from "@/components/ui/modal";
import { FlowHeader } from "@/components/flows/flow-parts";

/* The ⓘ sheet: why check, what the colours mean, and that you can still buy. */
export default function MtnCheckInfoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} label="About the MTN number check">
      <FlowHeader title="Is your MTN number approved?" subtitle="Approved numbers get data in minutes. Others can take days." onClose={onClose} />
      <div className="space-y-4 px-5 pb-[max(28px,env(safe-area-inset-bottom))] pt-3 text-[13.5px] leading-6 text-muted-foreground">
        <p>MTN verifies every number the first time it receives a bundle from our supplier. Until a number is approved, orders to it can take days instead of minutes. Checking first tells you what to expect before you pay.</p>
        <div className="space-y-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">What the colours mean</p>
          <p className="flex gap-2.5"><Check size={16} className="mt-1 shrink-0 text-primary-glow" /><span><b className="text-foreground">Approved.</b> Bundles to this number deliver in minutes.</span></p>
          <p className="flex gap-2.5"><Clock size={16} className="mt-1 shrink-0 text-amber" /><span><b className="text-foreground">Not yet approved.</b> You can still buy. Your order goes through once MTN approves the number, usually within a few days. After that, every order to it is fast.</span></p>
          <p className="flex gap-2.5"><X size={16} className="mt-1 shrink-0 text-danger" /><span><b className="text-foreground">Not an MTN number</b> or <b className="text-foreground">blocked.</b> This bundle can't be sent to it.</span></p>
        </div>
        <p><b className="text-foreground">Not approved yet?</b> Tap <b className="text-foreground">Submit this number for MTN verification</b> and we'll put it in MTN's queue for you, free, no order needed. You can still buy while you wait.</p>
        <p>Checking is free, needs no account, and does nothing to the number. It only tells you where it stands.</p>
        <Link to="/check-mtn" onClick={onClose} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-primary-glow">Check many numbers at once →</Link>
      </div>
    </Modal>
  );
}
