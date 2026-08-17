import { Clock3, TriangleAlert } from "lucide-react";
import { useDeliveryStatus } from "@/hooks/useDeliveryStatus";

/* Tells a customer how long delivery is taking *before* they pay. Renders
   nothing when we have no measurement, because an invented estimate is worse
   than no estimate — and when deliveries are slow it says so plainly rather
   than letting the "within minutes" copy elsewhere set the expectation. */

export default function DeliveryNotice({ className = "" }: { className?: string }) {
  const status = useDeliveryStatus();
  if (!status?.estimate) return null;

  const Icon = status.slow ? TriangleAlert : Clock3;
  const tone = status.slow
    ? "border-amber/25 bg-amber/[0.08] text-amber"
    : "border-primary-glow/20 bg-primary/[0.06] text-primary-glow";

  return (
    <div className={`flex items-start gap-2.5 rounded-2xl border p-3.5 ${tone} ${className}`}>
      <Icon size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p className="text-[13px] leading-5 text-foreground">{status.estimate}</p>
    </div>
  );
}
