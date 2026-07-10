import { NavLink } from "react-router-dom";
import { NAV_ITEMS } from "./nav";

export default function BottomNav() {
  return (
    <nav className="onyx-bottomnav lg:hidden" aria-label="Primary">
      {NAV_ITEMS.map((n) => (
        <NavLink key={n.to} to={n.to} end={n.end} aria-label={n.label} className="onyx-bn-item">
          {({ isActive }) => (
            <>
              <n.icon
                size={21}
                strokeWidth={isActive ? 2.4 : 2}
                className={`transition-transform duration-300 ${
                  isActive ? "-translate-y-px scale-110 text-primary-glow" : "text-faint-foreground"
                }`}
              />
              <span className={isActive ? "text-foreground" : "text-faint-foreground"}>
                {n.label}
              </span>
              {isActive && <span className="onyx-bn-glow" aria-hidden="true" />}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
