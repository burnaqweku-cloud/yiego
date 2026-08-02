import { useEffect, useMemo, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  BadgeDollarSign,
  BriefcaseBusiness,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Gauge,
  LogOut,
  Menu,
  Store,
  Tags,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import AuroraBackground from "@/components/fx/AuroraBackground";
import Monogram from "@/components/brand/Monogram";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth-context";
import { useProfile } from "@/store/profile";

interface AdminNavChild {
  label: string;
  to: string;
}

interface AdminNavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
  children?: AdminNavChild[];
}

interface AdminNavSection {
  label: string;
  icon: LucideIcon;
  items: AdminNavItem[];
}

const sections: AdminNavSection[] = [
  {
    label: "Workspace",
    icon: Gauge,
    items: [{ label: "Overview", to: "/admin", icon: Gauge, end: true }],
  },
  {
    label: "Operations",
    icon: ClipboardList,
    items: [
      {
        label: "Orders",
        to: "/admin/orders",
        icon: ClipboardList,
        children: [
          { label: "All orders", to: "/admin/orders" },
          { label: "In progress", to: "/admin/orders?status=pending" },
          { label: "Delivered", to: "/admin/orders?status=delivered" },
          { label: "Failed & review", to: "/admin/orders?status=failed" },
        ],
      },
    ],
  },
  {
    label: "Sales management",
    icon: BadgeDollarSign,
    items: [
      { label: "Data pricing", to: "/admin/sales/pricing", icon: Tags },
    ],
  },
  {
    label: "Business",
    icon: BriefcaseBusiness,
    items: [
      { label: "Suppliers", to: "/admin/suppliers", icon: Store },
      { label: "Wallet activity", to: "/admin/wallet", icon: WalletCards },
    ],
  },
];

const routeTitles: Record<string, string> = {
  "/admin": "Overview",
  "/admin/orders": "Orders",
  "/admin/reviews": "Review queue",
  "/admin/sales/pricing": "Data pricing",
  "/admin/suppliers": "Suppliers",
  "/admin/wallet": "Wallet activity",
};

function AdminNavigation({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const activeSection = location.pathname === "/admin"
    ? "Workspace"
    : location.pathname.startsWith("/admin/orders") || location.pathname.startsWith("/admin/reviews")
      ? "Operations"
      : location.pathname.startsWith("/admin/sales")
        ? "Sales management"
        : "Business";
  const [openSection, setOpenSection] = useState(activeSection);
  const [ordersOpen, setOrdersOpen] = useState(location.pathname.startsWith("/admin/orders"));

  useEffect(() => {
    setOpenSection(activeSection);
    if (location.pathname.startsWith("/admin/orders")) setOrdersOpen(true);
  }, [activeSection, location.pathname]);

  const isChildActive = (to: string) => {
    const [pathname, search = ""] = to.split("?");
    if (location.pathname !== pathname) return false;
    if (!search) return !location.search || location.search === "?status=all";
    return location.search === `?${search}`;
  };

  return (
    <nav className="mt-8 space-y-2" aria-label="Admin navigation">
      {sections.map((section, index) => (
        <div key={section.label} className="rounded-2xl border border-white/[0.055] bg-white/[0.018] p-1.5">
          <button
            type="button"
            onClick={() => setOpenSection((current) => current === section.label ? "" : section.label)}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold transition-colors",
              openSection === section.label ? "bg-white/[0.045] text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
            aria-expanded={openSection === section.label}
          >
            <span className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.08] bg-black/10 text-[10px] text-faint-foreground">{index + 1}</span>
            <section.icon size={17} className={openSection === section.label ? "text-primary-glow" : ""} />
            <span className="min-w-0 flex-1 truncate">{section.label}</span>
            <ChevronDown size={15} className={cn("transition-transform", openSection === section.label && "rotate-180")} />
          </button>

          {openSection === section.label && (
            <div className="mt-1 space-y-1 px-1 pb-1">
              {section.items.map((item) => item.children ? (
                <div key={item.to}>
                  <button
                    type="button"
                    onClick={() => setOrdersOpen((current) => !current)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                      location.pathname.startsWith(item.to) ? "text-primary-glow" : "text-muted-foreground hover:bg-white/[0.035] hover:text-foreground",
                    )}
                    aria-expanded={ordersOpen}
                  >
                    <item.icon size={17} />
                    <span>{item.label}</span>
                    <ChevronDown size={14} className={cn("ml-auto transition-transform", ordersOpen && "rotate-180")} />
                  </button>
                  {ordersOpen && (
                    <div className="ml-5 mt-1 space-y-1 border-l border-white/[0.09] pl-3">
                      {item.children.map((child) => (
                        <NavLink
                          key={child.to}
                          to={child.to}
                          onClick={onNavigate}
                          className={cn(
                            "flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors",
                            isChildActive(child.to) ? "bg-primary/[0.1] text-primary-glow" : "text-faint-foreground hover:bg-white/[0.035] hover:text-foreground",
                          )}
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                          {child.label}
                        </NavLink>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={onNavigate}
                  className={({ isActive }) => cn(
                    "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
                    isActive ? "bg-primary/[0.1] text-primary-glow" : "text-muted-foreground hover:bg-white/[0.035] hover:text-foreground",
                  )}
                >
                  <item.icon size={17} />
                  <span>{item.label}</span>
                  <ChevronRight className="ml-auto opacity-0 transition-opacity group-hover:opacity-60" size={14} />
                </NavLink>
              ))}
            </div>
          )}
        </div>
      ))}
    </nav>
  );
}

function AdminBrand() {
  return (
    <NavLink to="/admin" className="flex items-center gap-3" aria-label="YieGo Admin overview">
      <Monogram size={42} />
      <div className="leading-tight">
        <p className="font-display text-[17px] font-semibold text-white">YieGo Admin</p>
        <p className="mt-0.5 text-[11px] text-faint-foreground">Phase 1 operations</p>
      </div>
    </NavLink>
  );
}

export default function AdminShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const { profile, initials } = useProfile();
  const pageTitle = useMemo(() => routeTitles[location.pathname] ?? "Admin", [location.pathname]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const close = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", close);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", close);
    };
  }, [menuOpen]);

  const doSignOut = async () => {
    try {
      await signOut();
      navigate("/", { replace: true });
    } catch {
      toast.error("We couldn't sign you out. Please try again.");
    }
  };

  return (
    <div className="onyx-canvas min-h-dvh">
      <AuroraBackground />
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1600px]">
        <aside className="sticky top-0 hidden h-dvh w-[280px] shrink-0 flex-col border-r border-white/[0.07] bg-black/15 px-5 py-7 backdrop-blur-xl lg:flex">
          <AdminBrand />
          <AdminNavigation />
          <div className="mt-auto space-y-3">
            <NavLink to="/" className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
              <ArrowLeft size={17} /> Return to YieGo
            </NavLink>
            <button type="button" onClick={doSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-faint-foreground hover:bg-white/[0.04] hover:text-danger">
              <LogOut size={17} /> Sign out
            </button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-[72px] items-center border-b border-white/[0.07] bg-background/80 px-5 backdrop-blur-xl sm:px-8 lg:px-10">
            <div className="lg:hidden"><AdminBrand /></div>
            <div className="hidden items-center gap-2 text-sm lg:flex">
              <span className="text-faint-foreground">Admin</span><ChevronRight size={14} className="text-faint-foreground" /><span className="font-semibold text-foreground">{pageTitle}</span>
            </div>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <div className="hidden items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-3 py-2 sm:flex">
                <span className="onyx-avatar h-8 w-8 text-xs">{initials}</span>
                <div className="max-w-44 leading-tight">
                  <p className="truncate text-xs font-semibold text-foreground">{profile.firstName} {profile.lastName}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-primary-glow">Administrator</p>
                </div>
              </div>
              <button type="button" onClick={() => setMenuOpen(true)} className="onyx-iconbtn lg:hidden" aria-label="Open admin navigation"><Menu size={20} /></button>
            </div>
          </header>

          <main className="px-5 pb-16 pt-7 sm:px-8 lg:pt-9">
            <Outlet />
          </main>
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-[90] lg:hidden" role="dialog" aria-modal="true" aria-label="Admin navigation">
          <button type="button" className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setMenuOpen(false)} aria-label="Close admin navigation" />
          <aside ref={panelRef} tabIndex={-1} className="onyx-panel absolute inset-y-0 left-0 flex w-[min(88vw,350px)] flex-col rounded-none border-y-0 border-l-0 p-5 shadow-2xl">
            <div className="flex items-center justify-between gap-3"><AdminBrand /><button type="button" className="onyx-iconbtn" onClick={() => setMenuOpen(false)} aria-label="Close admin navigation"><X size={20} /></button></div>
            <div className="mt-6 flex items-center gap-3 rounded-2xl border border-primary-glow/15 bg-primary/[0.06] p-4">
              <span className="onyx-avatar h-10 w-10">{initials}</span>
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{profile.firstName} {profile.lastName}</p><p className="text-xs text-primary-glow">Administrator</p></div>
            </div>
            <AdminNavigation onNavigate={() => setMenuOpen(false)} />
            <div className="mt-auto space-y-2 pt-6">
              <NavLink to="/" className="flex items-center gap-3 rounded-xl border border-white/10 px-3 py-3 text-sm font-semibold text-muted-foreground"><ArrowLeft size={17} /> Return to YieGo</NavLink>
              <button type="button" onClick={doSignOut} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold text-danger"><LogOut size={17} /> Sign out</button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
