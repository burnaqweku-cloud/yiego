import { NavLink } from "react-router-dom";
import {
  ArrowRightLeft,
  House,
  LayoutGrid,
  Menu,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  name: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

const ITEMS: NavItem[] = [
  { name: "Home", to: "/", icon: House, end: true },
  { name: "Services", to: "/services", icon: LayoutGrid },
  { name: "Payments", to: "/payments", icon: ArrowRightLeft },
  { name: "Wallet", to: "/wallet", icon: Wallet },
  { name: "More", to: "/more", icon: Menu },
];

export default function BottomNav() {
  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 pb-safe shadow-nav backdrop-blur lg:hidden"
    >
      <div className="flex h-16 items-stretch">
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="flex flex-1 select-none flex-col items-center justify-center gap-1 transition-transform duration-150 active:scale-[0.97]"
          >
            {({ isActive }) => (
              <>
                <item.icon
                  className={cn(
                    "size-[22px] transition-colors duration-150",
                    isActive ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span
                  className={cn(
                    "text-[10px] leading-none transition-colors duration-150",
                    isActive
                      ? "font-semibold text-primary"
                      : "font-medium text-muted-foreground",
                  )}
                >
                  {item.name}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "h-1 w-1 rounded-full bg-primary transition-opacity duration-150",
                    isActive ? "opacity-100" : "opacity-0",
                  )}
                />
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
