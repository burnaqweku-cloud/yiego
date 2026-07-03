import { Code2, LayoutPanelTop, Link2 } from "lucide-react";
import { comingSoonToast } from "@/lib/toasts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const FEATURES = [
  { icon: Link2, label: "Payment links" },
  { icon: LayoutPanelTop, label: "Checkout pages" },
  { icon: Code2, label: "Developer API" },
] as const;

/**
 * Business / developer pillar — YieGo's Paystack-like side.
 * One confident pitch, one dark code block as the developer-trust signal.
 */
export default function PaymentsPromo() {
  return (
    <Card>
      <CardContent>
        <Badge variant="mint" className="uppercase tracking-[0.12em]">
          Business
        </Badge>

        <h2 className="mt-3 font-display text-lg font-bold tracking-tight">
          Accept payments like a pro
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Create payment links, checkout pages, or plug the YieGo API into your
          product — start receiving money in minutes.
        </p>

        <pre
          aria-hidden="true"
          className="no-scrollbar mt-4 overflow-x-auto rounded-xl bg-ink p-3.5 font-mono text-[11px] leading-[1.8] text-white/75"
        >
          <span className="text-white/40">{"$ "}</span>
          <span className="text-white/90">curl</span>
          <span className="text-amber">{" -X POST "}</span>
          <span className="text-primary-soft">api.yiego.com/v1/links</span>
          <span className="text-white/30">{" \\"}</span>
          {"\n  "}
          <span className="text-amber">-H</span>
          <span className="text-primary-soft">
            {' "Authorization: Bearer sk_live_…"'}
          </span>
          <span className="text-white/30">{" \\"}</span>
          {"\n  "}
          <span className="text-amber">-d</span>
          {" amount=150 "}
          <span className="text-amber">-d</span>
          {" currency=GHS"}
        </pre>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
          {FEATURES.map(({ icon: Icon, label }) => (
            <span
              key={label}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <Icon size={14} strokeWidth={2} />
              {label}
            </span>
          ))}
        </div>

        <div className="mt-5 flex items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => comingSoonToast("Payment links")}
          >
            Create payment link
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => comingSoonToast("API docs")}
          >
            API docs →
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
