import { NavLink, useNavigate } from "react-router-dom";
import { LogIn, Menu, UserPlus, UserRound } from "lucide-react";
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
        {isAuthenticated ? (
          <button
            type="button"
            onClick={() => navigate("/account")}
            aria-label={`Account: ${user?.email ?? profile.email}`}
            className="onyx-userchip"
          >
            <span className="onyx-avatar">{initials || <UserRound size={15} />}</span>
            <span className="text-left leading-tight">
              <span className="block text-[13px] font-semibold tracking-tight text-foreground">
                {profile.firstName || "Account"}
              </span>
              <span className="hidden items-center gap-1 text-[11px] text-primary-glow sm:flex">
                <UserRound size={11} /> Account
              </span>
            </span>
          </button>
        ) : (
          <>
            <div className="hidden items-center gap-2 sm:flex">
              <button
                type="button"
                onClick={() => navigate("/auth")}
                className="onyx-btn-ghost h-11 min-h-0 px-4"
              >
                <LogIn size={16} /> Sign in
              </button>
              <button
                type="button"
                onClick={() => navigate("/auth?mode=signup")}
                className="onyx-btn-primary h-11 min-h-0 px-4"
              >
                <UserPlus size={16} /> Create account
              </button>
            </div>
            <button
              type="button"
              onClick={() => navigate("/auth")}
              aria-label="Sign in"
              className="onyx-userchip sm:hidden"
            >
              <LogIn size={16} className="text-primary-glow" />
              <span className="text-[13px] font-semibold tracking-tight text-foreground">Sign in</span>
            </button>
          </>
        )}
        <button type="button" onClick={onOpenMenu} className="onyx-iconbtn lg:hidden" aria-label="Open navigation menu">
          <Menu size={20} />
        </button>
      </div>

    </header>
  );
}
