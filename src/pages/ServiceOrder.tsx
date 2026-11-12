import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Card } from "@/components/ui/card";
import OrderResult from "@/components/services/OrderResult";
import { confirmServiceOrder, type ServiceOrder as Order } from "@/lib/services";

/* Where a buyer lands after paying for a service with mobile money or card, and the link in their email.
   It checks the payment and shows the PIN as soon as the order is delivered. */
export default function ServiceOrder() {
  const { token = "" } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [failed, setFailed] = useState(false);
  const tries = useRef(0);

  useEffect(() => {
    let live = true; let timer: number | undefined;
    const check = async () => {
      const r = await confirmServiceOrder(token);
      if (!live) return;
      if (!r.data) { setFailed(true); return; }
      setOrder(r.data);
      // A mobile money approval can take a little while: keep looking for a few minutes.
      if (r.data.status !== "delivered" && r.data.status !== "refunded" && tries.current < 40) { tries.current += 1; timer = window.setTimeout(() => void check(), tries.current < 10 ? 4000 : 10000); }
    };
    void check();
    return () => { live = false; if (timer) window.clearTimeout(timer); };
  }, [token]);

  return (
    <div className="mx-auto w-full max-w-[520px] space-y-4">
      <Card className="p-5 sm:p-6">
        {failed ? <><h1 className="font-display text-[22px] font-semibold text-foreground">We couldn't find that order</h1><p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">Open the link from your SMS or email again. If you paid and see this, message us with your phone number and we'll sort it out.</p></>
          : !order ? <p role="status" className="text-[14px] text-muted-foreground">Checking your payment…</p>
          : <OrderResult order={order} />}
      </Card>
      <p className="text-center text-[13px] text-muted-foreground"><Link to="/services" className="font-semibold text-primary-glow">Back to DY Services</Link></p>
    </div>
  );
}
