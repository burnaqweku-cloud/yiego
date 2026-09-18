import type { ReactNode } from "react";

/* Page heading inside the admin frame. The top bar already names the page,
   so this stays small: title, one line of context, an optional action. */
export default function AdminPageHeader({ title, description, action }: { eyebrow?: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="flex flex-col gap-3 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <h1 className="text-[22px] font-semibold tracking-tight text-foreground sm:text-[24px]">{title}</h1>
        <p className="mt-1 text-[13.5px] leading-5 text-muted-foreground">{description}</p>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
