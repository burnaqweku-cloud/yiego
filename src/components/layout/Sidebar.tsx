import { NavLink } from "react-router-dom";
import { LogIn } from "lucide-react";
import Monogram from "@/components/brand/Monogram";
import { ADMIN_NAV_ITEM, GUEST_NAV_ITEMS, MEMBER_NAV_ITEMS } from "./nav";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth-context";
import { useAdminAccess } from "@/hooks/useAdminAccess";

export default function Sidebar() {
  const { isAuthenticated } = useAuth();
  const { isAdmin } = useAdminAccess();
  const items = isAuthenticated
    ? [...MEMBER_NAV_ITEMS, ...(isAdmin ? [ADMIN_NAV_ITEM] : [])]
    : GUEST_NAV_ITEMS;
  return (
    <aside className="onyx-rail sticky top-0 z-20 hidden h-dvh w-[264px] shrink-0 flex-col justify-between px-5 py-7 lg:flex">
      <div>
        <NavLink to="/" className="flex items-center gap-3 px-1" aria-label="YieGo — Home">
          <Monogram size={40} />
          <div className="leading-tight">
            <p className="font-display text-[17px] font-semibold tracking-tight text-white">YieGo</p>
            <p className="text-[11px] tracking-tight text-faint-foreground">
              Ghana data, delivered
            </p>
          </div>
        </NavLink>

        <nav className="mt-10 flex flex-col gap-1">
          {items.map((n) => (
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

      <div className="space-y-4">
        {!isAuthenticated && (
          <NavLink to="/auth" className="onyx-btn-primary flex w-full items-center justify-center gap-2">
            <LogIn size={17} /> Sign in
          </NavLink>
        )}
        <p className="px-1 text-[12px] leading-relaxed text-faint-foreground">Buy Ghana data and track every order.</p>
      </div>
    </aside>
  );
}
