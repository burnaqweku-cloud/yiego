import { Link, NavLink } from "react-router-dom";
import {
  Bitcoin,
  Code2,
  GraduationCap,
  Gift,
  House,
  LayoutPanelTop,
  Link2,
  Receipt,
  Settings,
  Smartphone,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { comingSoonToast } from "@/lib/toasts";
import { MOCK_USER } from "@/data/mock";

interface NavItem {
  name: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
  /**
   * Several items share a placeholder route for now — only the item marked
   * `highlight` participates in active detection, so exactly one sidebar row
   * lights up per page.
   */
  highlight?: boolean;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const GROUPS: NavGroup[] = [
  {
    label: "Main",
    items: [
      { name: "Overview", to: "/", icon: House, end: true, highlight: true },
      { name: "Wallet", to: "/wallet", icon: Wallet, highlight: true },
      { name: "Transactions", to: "/wallet", icon: Receipt },
    ],
  },
  {
    label: "Services",
    items: [
      { name: "Top-ups & Bills", to: "/services", icon: Smartphone, highlight: true },
      { name: "Crypto & Exchange", to: "/services", icon: Bitcoin },
      { name: "Digital & Tools", to: "/services", icon: Gift },
      { name: "Education", to: "/services", icon: GraduationCap },
    ],
  },
  {
    label: "Business",
    items: [
      { name: "Payment Links", to: "/payments", icon: Link2, highlight: true },
      { name: "Checkout Pages", to: "/payments", icon: LayoutPanelTop },
      { name: "Developer API", to: "/payments", icon: Code2 },
    ],
  },
];

const ITEM_BASE =
  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-150";
const ITEM_INACTIVE =
  "font-medium text-muted-foreground hover:bg-muted hover:text-foreground";

export default function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] flex-col border-r border-border bg-card lg:flex">
      <div className="px-6 pb-1 pt-6">
        <Link to="/" aria-label="YieGo — back to Overview" className="inline-block">
          <img src="/yiego-logo.png" alt="YieGo" className="h-8 w-auto" />
        </Link>
      </div>

      <nav className="flex-1 space-y-7 overflow-y-auto px-3 py-6">
        {GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              {group.label}
            </p>
            <div className="space-y-1">
              {group.items.map((item) =>
                item.highlight ? (
                  <NavLink
                    key={item.name}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        ITEM_BASE,
                        isActive
                          ? "bg-primary-soft font-semibold text-primary-strong"
                          : ITEM_INACTIVE,
                      )
                    }
                  >
                    <item.icon className="size-[18px] shrink-0" />
                    {item.name}
                  </NavLink>
                ) : (
                  <Link key={item.name} to={item.to} className={cn(ITEM_BASE, ITEM_INACTIVE)}>
                    <item.icon className="size-[18px] shrink-0" />
                    {item.name}
                  </Link>
                ),
              )}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3">
        <div className="flex items-center gap-3 rounded-2xl border border-border bg-background p-3">
          <span
            aria-hidden
            className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full bg-primary-soft text-[13px] font-bold text-primary-strong"
          >
            {MOCK_USER.initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold">
              {MOCK_USER.firstName} {MOCK_USER.lastName}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              Personal · {MOCK_USER.verified ? "Verified" : "Unverified"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="iconSm"
            aria-label="Settings"
            className="shrink-0 text-muted-foreground hover:text-foreground"
            onClick={() => comingSoonToast("Settings")}
          >
            <Settings />
          </Button>
        </div>
      </div>
    </aside>
  );
}
