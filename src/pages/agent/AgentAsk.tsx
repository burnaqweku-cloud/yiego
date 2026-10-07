import { AskDataYegoPanel } from "@/components/agent/AskDataYego";

/* More → Store assistant: the dashboard assistant as a full page (the floating Ask button opens the same thing as a sheet). */
export default function AgentAsk() {
  return (
    <div className="space-y-4">
      <div><p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary-glow">Help</p><h1 className="font-display text-[24px] font-semibold text-foreground">Store assistant</h1><p className="mt-1 text-[13px] text-muted-foreground">Questions about your store, your orders, your money or where something is. It sees your own store only and never changes anything.</p></div>
      <div className="onyx-panel overflow-hidden rounded-2xl"><AskDataYegoPanel full /></div>
    </div>
  );
}
