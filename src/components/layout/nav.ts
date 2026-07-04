import {
  Home,
  LayoutGrid,
  ArrowLeftRight,
  Wallet,
  User,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
  end?: boolean;
}

/** Primary navigation — shared by the desktop rail and mobile bottom nav. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Home", to: "/", icon: Home, end: true },
  { label: "Services", to: "/services", icon: LayoutGrid },
  { label: "Payments", to: "/payments", icon: ArrowLeftRight },
  { label: "Wallet", to: "/wallet", icon: Wallet },
  { label: "Account", to: "/account", icon: User },
];
