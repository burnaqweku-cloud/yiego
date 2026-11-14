import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* How every page of the customer app opens (the look of 14 Nov 2026): a deep green band running out of the header,
   with the logo's slanted dash as a panel on the right, the page's name in heavy type, and room underneath for the
   one thing that page is about (the wallet, a delivery, a search box). On a phone it runs edge to edge; on a
   computer it is a rounded block in the page column. Styles: styles/look.css (.yg-band). */
export default function Band({ kicker, title, sub, children, className, as: Title = "h1" }: {
  kicker?: ReactNode; title: ReactNode; sub?: ReactNode; children?: ReactNode; className?: string; as?: "h1" | "h2";
}) {
  return (
    <section className={cn("yg-band", className)}>
      <div className="yg-band__panel" aria-hidden="true" />
      {kicker && <p className="yg-band__kicker">{kicker}</p>}
      <Title className="yg-band__title">{title}</Title>
      {sub && <p className="yg-band__sub">{sub}</p>}
      {children}
    </section>
  );
}
