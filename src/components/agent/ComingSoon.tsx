import { Lock } from "lucide-react";
import { useAgent } from "@/components/agent/AgentShell";

/* Shown in place of a feature that's built but not yet released to everyone. */
export default function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  const { agent } = useAgent();
  return (
    <div className="onyx-panel rounded-[22px] p-6 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/12 text-primary-glow"><Lock size={20} /></span>
      <h2 className="mt-4 text-[18px] font-semibold text-foreground">{title}</h2>
      <p className="mx-auto mt-2 max-w-[42ch] text-[13.5px] leading-6 text-muted-foreground">{blurb}</p>
      <p className="mt-4 text-[12px] text-faint-foreground">We'll announce it on your dashboard and by email when it opens for {agent.store_name}.</p>
    </div>
  );
}
