import { useEffect, useRef } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { LogIn, LogOut, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import Monogram from "@/components/brand/Monogram";
import { ADMIN_NAV_ITEM, GUEST_NAV_ITEMS, MEMBER_NAV_ITEMS } from "./nav";
import { cn } from "@/lib/utils";
import { useAuth } from "@/store/auth-context";
import { useProfile } from "@/store/profile";
import { useAdminAccess } from "@/hooks/useAdminAccess";

export default function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const panelRef = useRef<HTMLElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, signOut } = useAuth();
  const { profile, initials } = useProfile();
  const { isAdmin } = useAdminAccess();
  const items = isAuthenticated
    ? [...MEMBER_NAV_ITEMS, ...(isAdmin ? [ADMIN_NAV_ITEM] : [])]
    : GUEST_NAV_ITEMS;

  useEffect(() => {
    onClose();
    // The location change is the close signal; onClose is intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    document.body.style.overflow = "hidden";
    const focusable = () => Array.from(panelRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []);
    window.setTimeout(() => focusable()[0]?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  const doSignOut = async () => {
    try {
      await signOut();
      onClose();
      navigate("/", { replace: true });
    } catch {
      toast.error("We couldn't sign you out. Please try again.");
    }
  };

  return (
    <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
      <button type="button" className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={onClose} aria-label="Close navigation menu" />
      <aside ref={panelRef} className="onyx-panel absolute inset-y-0 left-0 flex w-[min(86vw,330px)] flex-col rounded-none border-y-0 border-l-0 p-5 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <NavLink to="/shop" className="flex items-center gap-3" aria-label="YieGo home">
            <Monogram size={42} />
            <div>
              <p className="font-display text-lg font-semibold text-white">YieGo</p>
              <p className="text-xs text-faint-foreground">Ghana data, delivered</p>
            </div>
          </NavLink>
          <button type="button" className="onyx-iconbtn" onClick={onClose} aria-label="Close navigation menu"><X size={20} /></button>
        </div>

        {isAuthenticated ? (
          <div className="mt-7 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <span className="onyx-avatar h-10 w-10">{initials}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{profile.firstName} {profile.lastName}</p>
              <p className="truncate text-xs text-faint-foreground">{profile.email}</p>
            </div>
          </div>
        ) : (
          <div className="mt-7 rounded-2xl border border-primary-glow/15 bg-primary/[0.06] p-4">
            <p className="font-display text-base font-semibold text-white">Welcome to YieGo</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">Sign in to use your wallet and keep your order history.</p>
          </div>
        )}

        <nav className="mt-6 flex flex-col gap-1" aria-label="Mobile primary navigation">
          {items.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => cn("onyx-navitem flex items-center gap-3 rounded-xl px-3.5 py-3 text-sm font-semibold", isActive ? "onyx-navitem-on" : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground")}>
              <item.icon size={19} />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-3 pb-[max(4px,env(safe-area-inset-bottom))] pt-6">
          {isAuthenticated ? (
            <button type="button" onClick={doSignOut} className="onyx-btn-ghost flex w-full items-center justify-center gap-2 text-danger"><LogOut size={17} /> Sign out</button>
          ) : (
            <>
              <button type="button" onClick={() => navigate("/auth")} className="onyx-btn-primary flex w-full items-center justify-center gap-2"><LogIn size={17} /> Sign in</button>
              <button type="button" onClick={() => navigate("/auth?mode=signup")} className="onyx-btn-ghost flex w-full items-center justify-center gap-2"><UserPlus size={17} /> Create account</button>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
