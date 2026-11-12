import { CheckCircle2, Clock3 } from "lucide-react";
import PinCard from "@/components/services/PinCard";
import type { ServiceOrder } from "@/lib/services";

/* What a buyer sees for one service order: the PINs, or what is still happening. */
export default function OrderResult({ order }: { order: ServiceOrder }) {
  if (order.status === "delivered") return (
    <div className="space-y-3">
      <div className="flex items-start gap-3"><CheckCircle2 size={22} className="mt-0.5 shrink-0 text-primary-glow" aria-hidden="true" />
        <div className="min-w-0"><p className="text-[15px] font-semibold text-foreground">{order.quantity > 1 ? `${order.quantity} × ` : ""}{order.name}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">Order {order.reference}. We've also sent {order.quantity > 1 ? "them" : "it"} by SMS to {order.phone}.</p></div></div>
      {order.pins.map((pin, i) => <PinCard key={pin.serial} pin={pin} index={i} total={order.pins.length} />)}
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">Keep these safe. Anyone with the serial number and PIN can use the checker.</p>
    </div>
  );
  const text = order.status === "paid_waiting_stock" ? ["Payment received", "We're getting your checker ready. It will appear here and arrive by SMS shortly. You don't need to pay again."]
    : order.status === "refunded" ? ["Refunded", "This order was refunded."]
    : ["Waiting for your payment", "Once your payment goes through, your checker appears here straight away. If you've already paid, give it a moment."];
  return (
    <div className="flex items-start gap-3"><Clock3 size={22} className="mt-0.5 shrink-0 text-amber" aria-hidden="true" />
      <div className="min-w-0"><p className="text-[15px] font-semibold text-foreground">{text[0]}</p><p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{text[1]}</p><p className="mt-1 text-[12px] text-faint-foreground">{order.name} · order {order.reference}</p></div></div>
  );
}
