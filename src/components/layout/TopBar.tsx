import { NavLink, useNavigate } from "react-router-dom";
import { LogIn, Menu, UserRound } from "lucide-react";
import Monogram from "@/components/brand/Monogram";
import { useProfile } from "@/store/profile";
import { useAuth } from "@/store/auth-context";

export default function TopBar({ onOpenMenu }: { onOpenMenu: () => void }) {
  const navigate = useNavigate();
  const { profile, initials } = useProfile();
  const { user, isAuthenticated } = useAuth();

  return (
    <header className="flex items-center gap-3 sm:gap-4">
      {/* Mobile brand */}
      <NavLink to="/" className="flex items-center gap-2.5 lg:hidden" aria-label="YieGo — Home">
        <Monogram size={38} />
        <div className="leading-tight">
          <p className="font-display text-[16px] font-semibold tracking-tight text-white">YieGo</p>
          <p className="text-[10px] text-faint-foreground">Ghana data, delivered</p>
        </div>
      </NavLink>

      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate(isAuthenticated ? "/account" : "/auth")}
          aria-label={isAuthenticated ? `Account: ${user?.email ?? profile.email}` : "Sign in"}
          className="onyx-userchip"
        >
          {isAuthenticated ? (
            <span className="onyx-avatar">{initials || <UserRound size={15} />}</span>
          ) : (
            <LogIn size={16} className="text-primary-glow" />
          )}
          <span className="text-left leading-tight">
            <span className="block text-[13px] font-semibold tracking-tight text-foreground">
              {isAuthenticated ? profile.firstName || "Account" : "Sign in"}
            </span>
            <span className="hidden items-center gap-1 text-[11px] text-primary-glow sm:flex">
              <UserRound size={11} /> {isAuthenticated ? "Account" : "Create account"}
            </span>
          </span>
        </button>
        <button type="button" onClick={onOpenMenu} className="onyx-iconbtn lg:hidden" aria-label="Open navigation menu">
          <Menu size={20} />
        </button>
      </div>

    </header>
  );
}
