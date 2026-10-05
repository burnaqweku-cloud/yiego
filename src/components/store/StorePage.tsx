import type { ReactNode } from "react";
import { useStore } from "@/components/store/StoreShell";

/* The head of an inner store page (About, Contact, FAQ, Track, Sign in…), drawn
   the way each template draws its headings so a page never feels dropped in
   from somewhere else. Studio: big heading on white. Market: a small signboard.
   Classic: the quiet dark heading. */
export default function StorePage({ title, lead, aside, children, narrow }: { title: ReactNode; lead?: ReactNode; aside?: ReactNode; children: ReactNode; narrow?: boolean }) {
  const { template } = useStore();
  return (
    <div className={narrow ? "mx-auto max-w-md" : undefined}>
      {template === "studio" && (
        <header className="pb-6 pt-3"><h1 className="st-h2">{title}</h1>{lead && <p className="mt-2 max-w-[56ch] text-[15px] leading-relaxed text-[var(--st-slate)]">{lead}</p>}{aside && <div className="mt-4">{aside}</div>}</header>
      )}
      {template === "market" && (
        <header className="st-board mb-5 !py-5"><h1 className="!text-[26px]">{title}</h1>{lead && <p className="mt-1.5 text-[13.5px]">{lead}</p>}{aside && <div className="mt-3">{aside}</div>}</header>
      )}
      {template === "classic" && (
        <header className="pb-4"><h1 className="font-display text-[24px] font-semibold text-foreground">{title}</h1>{lead && <p className="mt-1 text-[13.5px] text-muted-foreground">{lead}</p>}{aside && <div className="mt-3">{aside}</div>}</header>
      )}
      {children}
    </div>
  );
}
