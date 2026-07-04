import { NavLink } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import Monogram from "@/components/brand/Monogram";
import { NAV_ITEMS } from "./nav";
import { cn } from "@/lib/utils";

export default function Sidebar() {
  return (
    <aside className="onyx-rail sticky top-0 z-20 hidden h-dvh w-[264px] shrink-0 flex-col justify-between px-5 py-7 lg:flex">
      <div>
        <NavLink to="/" className="flex items-center gap-3 px-1" aria-label="YieGo — Home">
          <Monogram size={40} />
          <div className="leading-tight">
            <p className="font-display text-[17px] font-semibold tracking-tight text-white">YieGo</p>
            <p className="text-[11px] tracking-tight text-faint-foreground">
              Your everyday digital plug
            </p>
          </div>
        </NavLink>

        <nav className="mt-10 flex flex-col gap-1">
          {NAV_ITEMS.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                cn(
                  "onyx-navitem group flex items-center gap-3 rounded-xl px-3.5 py-3 text-[14.5px] font-medium tracking-tight",
                  isActive
                    ? "onyx-navitem-on"
                    : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <n.icon
                    size={18}
                    strokeWidth={2}
                    className={isActive ? "text-primary-glow" : "text-current"}
                  />
                  {n.label}
                  {isActive && <span className="onyx-navdot ml-auto" />}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <div className="onyx-railcard rounded-2xl p-4">
        <div className="flex items-center gap-2 text-primary-glow">
          <ShieldCheck size={16} />
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em]">Secured</span>
        </div>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
          PCI-DSS payments &amp; 256-bit encryption on every cedi.
        </p>
      </div>
    </aside>
  );
}
