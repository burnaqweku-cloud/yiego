import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { ArrowRight, ChevronDown, LogOut, Menu, Search, ShieldCheck, UserRound, X } from "lucide-react";
import { toast } from "sonner";
import Wordmark from "@/components/brand/Wordmark";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useAuth } from "@/store/auth-context";
import { useProfile } from "@/store/profile";
import { cn } from "@/lib/utils";

/**
 * The one header for the whole site — marketing pages, the shop and the
 * account area alike. Sticky, quiet at the top, solid once scrolled.
 *
 * Signed in, the primary links swap the "learn about us" pages for the two
 * places members actually go (wallet, orders) and the right-hand side becomes
 * an account menu. There is no second navigation anywhere: one list of links,
 * one place to change them.
 */

interface NavLinkItem {
  label: string;
  to: string;
}

const GUEST_LINKS: NavLinkItem[] = [
  { label: "Home", to: "/" },
  { label: "Shop", to: "/shop" },
  { label: "About", to: "/about" },
  { label: "FAQ", to: "/faq" },
  { label: "Support", to: "/support" },
];

const MEMBER_LINKS: NavLinkItem[] = [
  { label: "Home", to: "/" },
  { label: "Shop", to: "/shop" },
  { label: "Wallet", to: "/wallet" },
  { label: "Orders", to: "/orders" },
  { label: "Support", to: "/support" },
];

const CLOSE_MS = 200;

export default function PublicNav() {
  const { isAuthenticated, signOut, user } = useAuth();
  const { profile, initials } = useProfile();
  const { isAdmin } = useAdminAccess();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [stuck, setStuck] = useState(false);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const links = isAuthenticated ? MEMBER_LINKS : GUEST_LINKS;

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

  // Close everything on route change.
  useEffect(() => {
    setOpen(false);
    setClosing(false);
    setMenuOpen(false);
  }, [pathname]);

  // Lock scroll, trap focus and handle Escape while the sheet is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    const returnTo = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab") return;
      // The sheet claims aria-modal, so focus must not escape to the
      // content it covers.
      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])")].filter(
        (el) => el.offsetParent !== null,
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
      returnTo?.focus?.();
    };
  }, [open]);

  // Dismiss the account menu on an outside press or Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  const handleSignOut = async () => {
    try {
      await signOut();
      setMenuOpen(false);
      setOpen(false);
      navigate("/", { replace: true });
    } catch {
      toast.error("We couldn't sign you out. Please try again.");
    }
  };

  const accountItems = (
    <>
      <MenuItem to="/account" icon={UserRound} label="Account settings" />
      <MenuItem to="/track-order" icon={Search} label="Track an order" />
      {isAdmin && <MenuItem to="/admin" icon={ShieldCheck} label="Admin panel" />}
    </>
  );

  return (
    <>
      <header className="mk-nav" data-stuck={stuck}>
        <div className="mk-wrap flex h-[68px] items-center gap-6 sm:h-[76px]">
          <Link to="/" className="flex shrink-0 items-center" aria-label="YieGo — home">
            <Wordmark className="h-[25px] sm:h-[28px]" />
          </Link>

          <nav className="ml-4 hidden items-center gap-7 lg:flex" aria-label="Main">
            {links.map((l) => (
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
            {isAuthenticated ? (
              <div className="relative hidden sm:block" ref={menuRef}>
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  aria-label={`Account menu for ${user?.email ?? profile.email}`}
                  className="onyx-userchip"
                >
                  <span className="onyx-avatar">{initials || <UserRound size={15} />}</span>
                  <span className="hidden text-[13px] font-semibold tracking-tight text-foreground md:block">
                    {profile.firstName || "Account"}
                  </span>
                  <ChevronDown
                    size={15}
                    className={cn("text-faint-foreground transition-transform", menuOpen && "rotate-180")}
                    aria-hidden="true"
                  />
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    aria-label="Account"
                    className="onyx-panel absolute right-0 top-[calc(100%+10px)] w-[248px] overflow-hidden rounded-2xl p-1.5"
                  >
                    <div className="border-b border-white/[0.07] px-3 pb-3 pt-2">
                      <p className="truncate text-[13.5px] font-semibold tracking-tight text-foreground">
                        {profile.firstName} {profile.lastName}
                      </p>
                      <p className="truncate text-[12px] text-faint-foreground">
                        {user?.email ?? profile.email}
                      </p>
                    </div>
                    <div className="pt-1.5">{accountItems}</div>
                    <button
                      type="button"
                      onClick={() => void handleSignOut()}
                      role="menuitem"
                      className="mt-1.5 flex w-full items-center gap-3 rounded-xl border-t border-white/[0.07] px-3 py-2.5 text-[13.5px] font-semibold text-danger transition-colors hover:bg-danger/[0.08]"
                    >
                      <LogOut size={16} aria-hidden="true" />
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link
                  to="/auth"
                  className="hidden text-[14px] font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
                >
                  Sign in
                </Link>
                <Link
                  to="/auth?mode=signup"
                  className="mk-btn mk-btn-primary group hidden !min-h-[44px] !px-5 !text-[14px] sm:inline-flex"
                >
                  Create account
                  <ArrowRight size={15} className="mk-arrow" />
                </Link>
              </>
            )}

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
            <Link to="/" onClick={close} className="flex items-center" aria-label="YieGo — home">
              <Wordmark className="h-[26px]" />
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
            {isAuthenticated && (
              <div
                className="mb-4 flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"
                style={{ "--d": "20ms" } as CSSProperties}
              >
                <span className="onyx-avatar h-10 w-10 shrink-0">
                  {initials || <UserRound size={16} />}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold tracking-tight text-foreground">
                    {profile.firstName} {profile.lastName}
                  </p>
                  <p className="truncate text-[12px] text-faint-foreground">
                    {user?.email ?? profile.email}
                  </p>
                </div>
              </div>
            )}

            <nav aria-label="Main">
              {links.map((l, i) => (
                <NavLink
                  key={l.to}
                  to={l.to}
                  end={l.to === "/"}
                  onClick={close}
                  style={{ "--d": `${40 + i * 45}ms` } as CSSProperties}
                  className={({ isActive }) => cn("mk-menu-item", isActive && "text-primary-glow")}
                >
                  {l.label}
                  <ArrowRight size={17} className="ml-auto opacity-40" />
                </NavLink>
              ))}
            </nav>

            {isAuthenticated ? (
              <div className="mt-6 flex flex-col gap-1 border-t border-white/[0.07] pt-4">
                <SheetLink to="/account" icon={UserRound} label="Account settings" onClick={close} />
                <SheetLink to="/track-order" icon={Search} label="Track an order" onClick={close} />
                {isAdmin && <SheetLink to="/admin" icon={ShieldCheck} label="Admin panel" onClick={close} />}
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  className="mt-2 flex items-center gap-3 rounded-xl px-3 py-3 text-[14.5px] font-semibold text-danger transition-colors hover:bg-danger/[0.08]"
                >
                  <LogOut size={18} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            ) : (
              <>
                <div className="mt-6 flex flex-col gap-1 border-t border-white/[0.07] pt-4">
                  <SheetLink to="/track-order" icon={Search} label="Track an order" onClick={close} />
                </div>
                <div className="mt-6 flex flex-col gap-3" style={{ "--d": "280ms" } as CSSProperties}>
                  <Link to="/shop" onClick={close} className="mk-btn mk-btn-primary group w-full">
                    Buy data
                    <ArrowRight size={16} className="mk-arrow" />
                  </Link>
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
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ── Bits ────────────────────────────────────────────────────────── */

function MenuItem({ to, icon: Icon, label }: { to: string; icon: typeof UserRound; label: string }) {
  return (
    <Link
      to={to}
      role="menuitem"
      className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
    >
      <Icon size={16} aria-hidden="true" />
      {label}
    </Link>
  );
}

function SheetLink({
  to,
  icon: Icon,
  label,
  onClick,
}: {
  to: string;
  icon: typeof UserRound;
  label: string;
  onClick: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className="flex items-center gap-3 rounded-xl px-3 py-3 text-[14.5px] font-medium text-muted-foreground transition-colors hover:bg-white/[0.04] hover:text-foreground"
    >
      <Icon size={18} aria-hidden="true" />
      {label}
    </Link>
  );
}
