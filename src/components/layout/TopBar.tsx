import { NavLink } from "react-router-dom";
import { Bell, Search, ShieldCheck } from "lucide-react";
import Monogram from "@/components/brand/Monogram";
import { MOCK_USER } from "@/data/mock";
import { comingSoonToast } from "@/lib/toasts";

export default function TopBar() {
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

      {/* Desktop search (decorative) */}
      <button
        type="button"
        onClick={() => comingSoonToast("Search")}
        aria-label="Search services"
        className="onyx-search ml-auto hidden max-w-[400px] flex-1 items-center gap-2.5 lg:flex"
      >
        <Search size={17} className="text-faint-foreground" />
        <span className="flex-1 text-left text-[14px] text-[#5c6b63]">
          Search services, pay a bill…
        </span>
        <kbd className="onyx-kbd">/</kbd>
      </button>

      <button
        type="button"
        onClick={() => comingSoonToast("Notifications")}
        aria-label="Notifications"
        className="onyx-iconbtn relative ml-auto lg:ml-0"
      >
        <Bell size={18} />
        <span className="onyx-bell-dot" aria-hidden="true" />
      </button>

      <button
        type="button"
        onClick={() => comingSoonToast("Account")}
        aria-label={`Account: ${MOCK_USER.firstName} ${MOCK_USER.lastName}`}
        className="onyx-userchip"
      >
        <span className="onyx-avatar">{MOCK_USER.initials}</span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13px] font-semibold tracking-tight text-foreground">
            {MOCK_USER.firstName} {MOCK_USER.lastName}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-primary-glow">
            <ShieldCheck size={11} /> Verified
          </span>
        </span>
      </button>
    </header>
  );
}
