import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ArrowRight, Menu, X } from "lucide-react";
import Monogram from "@/components/brand/Monogram";
import { useAuth } from "@/store/auth-context";
import { cn } from "@/lib/utils";

/** Public site navigation — sticky, quiet at the top, solid once scrolled. */

const LINKS: { label: string; to: string }[] = [
  { label: "Home", to: "/" },
  { label: "Shop", to: "/shop" },
  { label: "About", to: "/about" },
  { label: "FAQ", to: "/faq" },
  { label: "Support", to: "/support" },
];

const CLOSE_MS = 200;

export default function PublicNav() {
  const { isAuthenticated } = useAuth();
  const { pathname } = useLocation();
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Solidify the bar only once the page has actually moved.
  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const close = () => {
    setClosing(true);
    window.setTimeout(() => {
      setOpen(false);
      setClosing(false);
    }, CLOSE_MS);
  };

  // Close on route change.
  useEffect(() => {
    setOpen(false);
    setClosing(false);
  }, [pathname]);

  // Lock scroll + Escape + focus while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const accountLink = isAuthenticated
    ? { to: "/account", label: "My account" }
    : { to: "/auth", label: "Sign in" };

  return (
    <>
      <header className="mk-nav" data-stuck={stuck}>
        <div className="mk-wrap flex h-[68px] items-center gap-6 sm:h-[76px]">
          <Link to="/" className="flex shrink-0 items-center gap-2.5" aria-label="YieGo — home">
            <Monogram size={38} />
            <span className="font-display text-[17px] font-semibold tracking-tight text-foreground">
              YieGo
            </span>
          </Link>

          <nav className="ml-4 hidden items-center gap-7 lg:flex" aria-label="Main">
            {LINKS.map((l) => (
              <NavLink
                key={l.to}
                to={l.to}
                end={l.to === "/"}
                className={({ isActive }) => cn("mk-navlink", isActive && "is-active")}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <Link
              to={accountLink.to}
              className="hidden text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              {accountLink.label}
            </Link>
            <Link
              to={isAuthenticated ? "/shop" : "/auth?mode=signup"}
              className="mk-btn mk-btn-primary group hidden !min-h-[44px] !px-5 !text-[14px] sm:inline-flex"
            >
              {isAuthenticated ? "Start shopping" : "Create account"}
              <ArrowRight size={15} className="mk-arrow" />
            </Link>
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label="Open menu"
              aria-expanded={open}
              className="onyx-iconbtn lg:hidden"
            >
              <Menu size={20} />
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          className={cn("mk-menu lg:hidden", closing && "is-closing")}
        >
          <div className="mk-wrap flex h-[68px] shrink-0 items-center">
            <Link to="/" onClick={close} className="flex items-center gap-2.5" aria-label="YieGo — home">
              <Monogram size={38} />
              <span className="font-display text-[17px] font-semibold tracking-tight text-foreground">
                YieGo
              </span>
            </Link>
            <button
              type="button"
              onClick={close}
              aria-label="Close menu"
              className="onyx-iconbtn ml-auto"
            >
              <X size={20} />
            </button>
          </div>

          <div className="mk-wrap flex min-h-0 flex-1 flex-col overflow-y-auto pb-8 pt-3">
            <nav aria-label="Main">
              {LINKS.map((l, i) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.to === "/"}
                  onClick={close}
                  style={{ "--d": `${40 + i * 45}ms` } as React.CSSProperties}
                  className={({ isActive }) =>
                    cn("mk-menu-item", isActive && "text-primary-glow")
                  }
                >
                  {l.label}
                  <ArrowRight size={17} className="ml-auto opacity-40" />
                </NavLink>
              ))}
            </nav>

            <div
              className="mt-8 flex flex-col gap-3"
              style={{ "--d": "280ms" } as React.CSSProperties}
            >
              <Link to="/shop" onClick={close} className="mk-btn mk-btn-primary group w-full">
                Start shopping
                <ArrowRight size={16} className="mk-arrow" />
              </Link>
              {isAuthenticated ? (
                <Link to="/account" onClick={close} className="mk-btn mk-btn-ghost w-full">
                  My account
                </Link>
              ) : (
                <>
                  <Link to="/auth?mode=signup" onClick={close} className="mk-btn mk-btn-ghost w-full">
                    Create account
                  </Link>
                  <Link
                    to="/auth"
                    onClick={close}
                    className="py-2 text-center text-[14px] font-medium text-muted-foreground"
                  >
                    Already have an account? Sign in
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
