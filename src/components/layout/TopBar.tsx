import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { Bell, Search, ShieldCheck } from "lucide-react";
import Monogram from "@/components/brand/Monogram";
import NotificationsSheet from "@/components/sheets/NotificationsSheet";
import SearchSheet from "@/components/sheets/SearchSheet";
import { useProfile } from "@/store/profile";
import { useNotices } from "@/store/notices";

export default function TopBar() {
  const navigate = useNavigate();
  const { profile, initials } = useProfile();
  const { unreadCount } = useNotices();
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // "/" opens the command palette — unless the user is typing somewhere
  // or a modal is already open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"]')) return;
      e.preventDefault();
      setSearchOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="flex items-center gap-3 sm:gap-4">
      {/* Mobile brand */}
      <NavLink to="/" className="flex items-center gap-2.5 lg:hidden" aria-label="YieGo — Home">
        <Monogram size={38} />
        <div className="leading-tight">
          <p className="font-display text-[16px] font-semibold tracking-tight text-white">YieGo</p>
          <p className="text-[10px] text-faint-foreground">Your everyday digital plug</p>
        </div>
      </NavLink>

      {/* Desktop search — opens the command palette */}
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-label="Search services"
        className="onyx-search ml-auto hidden max-w-[400px] flex-1 items-center gap-2.5 lg:flex"
      >
        <Search size={17} className="text-faint-foreground" />
        <span className="flex-1 text-left text-[14px] text-[#5c6b63]">
          Search services, pay a bill…
        </span>
        <kbd className="onyx-kbd">/</kbd>
      </button>

      {/* Mobile search */}
      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-label="Search services"
        className="onyx-iconbtn ml-auto lg:hidden"
      >
        <Search size={18} />
      </button>

      <button
        type="button"
        onClick={() => setNotifOpen(true)}
        aria-label={unreadCount > 0 ? `Notifications — ${unreadCount} unread` : "Notifications"}
        className="onyx-iconbtn relative"
      >
        <Bell size={18} />
        {unreadCount > 0 && <span className="onyx-bell-dot" aria-hidden="true" />}
      </button>

      <button
        type="button"
        onClick={() => navigate("/account")}
        aria-label={`Account: ${profile.firstName} ${profile.lastName}`}
        className="onyx-userchip"
      >
        <span className="onyx-avatar">{initials}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13px] font-semibold tracking-tight text-foreground">
            {profile.firstName} {profile.lastName}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-primary-glow">
            <ShieldCheck size={11} /> Verified
          </span>
        </span>
      </button>

      <NotificationsSheet open={notifOpen} onClose={() => setNotifOpen(false)} />
      <SearchSheet open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}
