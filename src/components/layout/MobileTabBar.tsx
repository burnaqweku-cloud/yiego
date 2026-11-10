import type { LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

/* The app-style bar along the bottom of a phone screen: the handful of places people go most,
   one thumb away. A tab is either a page (`to`) or an action (`onClick`, e.g. "More").
   Pass the breakpoint class that hides it on wide screens, where the normal navigation shows. */
export interface TabItem { label: string; icon: LucideIcon; to?: string; end?: boolean; onClick?: () => void; active?: boolean; badge?: number }

export default function MobileTabBar({ items, className, label = "Main" }: { items: TabItem[]; className?: string; label?: string }) {
  return (
    <nav className={cn("yg-tabbar", className)} aria-label={label}>
      {items.map((item) => {
        const body = (
          <>
            <span className="yg-tab-ico">
              <item.icon size={20} aria-hidden="true" />
              {item.badge ? <span className="yg-tab-badge">{item.badge > 99 ? "99+" : item.badge}</span> : null}
            </span>
            <span className="truncate">{item.label}</span>
          </>
        );
        return item.to
          ? <NavLink key={item.label} to={item.to} end={item.end} className={({ isActive }) => cn("yg-tab", isActive && "is-active")}>{body}</NavLink>
          : <button key={item.label} type="button" onClick={item.onClick} aria-pressed={item.active} className={cn("yg-tab", item.active && "is-active")}>{body}</button>;
      })}
    </nav>
  );
}

/** Keeps the end of a page clear of the bar. Give it the same hide-on-wide class as the bar. */
export function TabBarSpace({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn("yg-tabbar-space", className)} />;
}
