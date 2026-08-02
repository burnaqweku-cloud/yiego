import type { ReactNode } from "react";

export default function AdminPageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-5 border-b border-white/[0.08] pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary-glow">{eyebrow}</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {action}
    </header>
  );
}
