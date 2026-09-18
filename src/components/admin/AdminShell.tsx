import { useEffect, useRef, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Menu, Moon, Sun } from "lucide-react";
import { useTheme } from "@/store/theme";
import AuroraBackground from "@/components/fx/AuroraBackground";
import Wordmark from "@/components/brand/Wordmark";
import AdminSidebar from "@/components/admin/AdminSidebar";
import { groupForPath, pageForPath } from "@/lib/admin-nav";

/* The admin frame: a fixed 264px sidebar on desktop, a slide-in drawer on
   mobile, and a compact 56px top bar that names the page. All navigation
   lives in AdminSidebar; all page data lives in the routed page. */
export default function AdminShell() {
  const [menuOpen, setMenuOpen] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const page = pageForPath(location.pathname);
  const group = groupForPath(location.pathname);
  const { resolved, setMode } = useTheme();

  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const close = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", close);
    return () => { document.body.style.overflow = previous; window.removeEventListener("keydown", close); };
  }, [menuOpen]);

  return (
    <div className="onyx-canvas admin-dense min-h-dvh">
      <AuroraBackground />
      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[1600px]">
        <aside className="sticky top-0 hidden h-dvh w-[216px] shrink-0 border-r border-white/[0.06] bg-black/20 backdrop-blur-xl lg:block">
          <AdminSidebar />
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-11 items-center gap-2.5 border-b border-white/[0.06] bg-background/80 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
            <button type="button" onClick={() => setMenuOpen(true)} className="onyx-iconbtn -ml-1 lg:hidden" aria-label="Open menu"><Menu size={20} /></button>
            <Wordmark className="h-[18px] lg:hidden" />
            <div className="min-w-0 flex items-baseline gap-2 text-[13px]">
              {group && group.pages.length > 1 && <span className="hidden text-faint-foreground sm:inline">{group.label} /</span>}
              <span className="truncate font-semibold text-foreground">{page?.label ?? "Admin"}</span>
            </div>
            <button type="button" onClick={() => setMode(resolved === "light" ? "dark" : "light")} className="onyx-iconbtn ml-auto" aria-label={resolved === "light" ? "Switch to dark mode" : "Switch to light mode"}>{resolved === "light" ? <Moon size={18} /> : <Sun size={18} />}</button>
          </header>
          <main className="px-3.5 pb-14 pt-4 sm:px-5 lg:px-6 lg:pt-5"><Outlet /></main>
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-[90] lg:hidden">
          <button className="absolute inset-0 bg-black/60" onClick={() => setMenuOpen(false)} aria-label="Close menu" />
          <aside ref={panelRef} tabIndex={-1} className="onyx-panel absolute inset-y-0 left-0 w-[min(78vw,280px)] rounded-none p-0">
            <AdminSidebar onNavigate={() => setMenuOpen(false)} onClose={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}
    </div>
  );
}
