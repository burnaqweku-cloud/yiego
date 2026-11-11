import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { unsubscribeFollowUps } from "@/lib/followUps";

/* Reached from "Stop these reminders" in a follow-up email. It works on arrival: no sign-in, no second tap. */
export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("t") ?? "";
  const [state, setState] = useState<"working" | "done" | "failed">("working");
  useEffect(() => {
    let live = true;
    if (!/^[0-9a-f-]{36}$/i.test(token)) { setState("failed"); return; }
    void Promise.resolve(unsubscribeFollowUps(token)).then((r) => { if (live) setState(r.data ? "done" : "failed"); }, () => { if (live) setState("failed"); });
    return () => { live = false; };
  }, [token]);
  return (
    <div className="mx-auto w-full max-w-[480px]">
      <Card className="p-6 sm:p-8">
        {state === "working" && <p className="text-[14px] text-muted-foreground">Stopping your reminders…</p>}
        {state === "done" && <>
          <CheckCircle2 size={28} className="text-primary-glow" aria-hidden="true" />
          <h1 className="mt-3 font-display text-2xl font-semibold text-foreground">Reminders stopped</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">We won’t send you any more reminder emails. You’ll still get emails about your own orders.</p>
        </>}
        {state === "failed" && <>
          <h1 className="font-display text-2xl font-semibold text-foreground">This link didn’t work</h1>
          <p className="mt-2 text-[14px] leading-relaxed text-muted-foreground">Open the link from your email again, or message us and we’ll stop the reminders for you.</p>
        </>}
        <Link to="/shop" className="mt-5 inline-block text-[14px] font-semibold text-primary-glow">Go to DataYego</Link>
      </Card>
    </div>
  );
}
