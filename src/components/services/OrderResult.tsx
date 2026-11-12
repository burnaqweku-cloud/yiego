import { CheckCircle2, Clock3 } from "lucide-react";
import PinCard from "@/components/services/PinCard";
import type { ServiceOrder } from "@/lib/services";

/* What a buyer sees for one service order: the PINs (or the AFA result), or what is still happening. */
export default function OrderResult({ order, sms = false }: { order: ServiceOrder; sms?: boolean }) {
  if (order.kind === "afa") {
    const number = order.afa?.phone ?? order.phone;
    const [title, text, done] = order.status === "delivered" ? ["Registered", `${number} is now on MTN AFA${order.afa?.name ? `, in the name of ${order.afa.name}` : ""}.`, true]
      : order.status === "processing" ? ["Registration in progress", `Payment received. We're registering ${number} on MTN AFA. This page updates when it's done${sms ? " and we'll text you" : ", and we'll email you"}. You don't need to pay again.`, false]
      : order.status === "refunded" ? ["Refunded", "This registration didn't go through and the payment was refunded.", false]
      : ["Waiting for your payment", "Once your payment goes through, we start the registration. If you've already paid, give it a moment.", false];
    const Icon = done ? CheckCircle2 : Clock3;
    return (
      <div className="flex items-start gap-3"><Icon size={22} className={done ? "mt-0.5 shrink-0 text-primary-glow" : "mt-0.5 shrink-0 text-amber"} aria-hidden="true" />
        <div className="min-w-0"><p className="text-[15px] font-semibold text-foreground">{title}</p><p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{text}</p><p className="mt-1 text-[12px] text-faint-foreground">{order.name} · order {order.reference}</p></div></div>
    );
  }
  if (order.status === "delivered") return (
    <div className="space-y-3">
      <div className="flex items-start gap-3"><CheckCircle2 size={22} className="mt-0.5 shrink-0 text-primary-glow" aria-hidden="true" />
        <div className="min-w-0"><p className="text-[15px] font-semibold text-foreground">{order.quantity > 1 ? `${order.quantity} × ` : ""}{order.name}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">Order {order.reference}. {sms ? `We've also sent ${order.quantity > 1 ? "them" : "it"} by SMS to ${order.phone}.` : "A copy is in your email, with a link back to this page."}</p></div></div>
      {order.pins.map((pin, i) => <PinCard key={pin.serial} pin={pin} index={i} total={order.pins.length} />)}
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">Keep these safe. Anyone with the serial number and PIN can use the checker.</p>
    </div>
  );
  const text = order.status === "paid_waiting_stock" ? ["Pending", `Payment received. We're working on your order: your ${order.quantity > 1 ? `${order.quantity} checkers` : "checker"} will appear here and arrive by SMS shortly. You don't need to pay again.`]
    : order.status === "refunded" ? ["Refunded", "This order was refunded."]
    : ["Waiting for your payment", "Once your payment goes through, your checker appears here straight away. If you've already paid, give it a moment."];
  return (
    <div className="flex items-start gap-3"><Clock3 size={22} className="mt-0.5 shrink-0 text-amber" aria-hidden="true" />
      <div className="min-w-0"><p className="text-[15px] font-semibold text-foreground">{text[0]}</p><p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{text[1]}</p><p className="mt-1 text-[12px] text-faint-foreground">{order.name} · order {order.reference}</p></div></div>
  );
}
