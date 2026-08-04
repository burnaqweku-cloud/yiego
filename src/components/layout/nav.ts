import {
  Bot,
  Home,
  ReceiptText,
  Search,
  ShieldCheck,
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

export const GUEST_NAV_ITEMS: NavItem[] = [
  { label: "Buy Data", to: "/shop", icon: Home, end: true },
  { label: "Track Order", to: "/track-order", icon: Search },
  { label: "AI Support", to: "/support/ai", icon: Bot },
];

export const MEMBER_NAV_ITEMS: NavItem[] = [
  { label: "Buy Data", to: "/", icon: Home, end: true },
  { label: "Wallet", to: "/wallet", icon: Wallet },
  { label: "Track Order", to: "/track-order", icon: Search },
  { label: "Orders", to: "/orders", icon: ReceiptText },
  { label: "AI Support", to: "/support/ai", icon: Bot },
  { label: "Account", to: "/account", icon: User },
];

export const ADMIN_NAV_ITEM: NavItem = {
  label: "Admin Panel",
  to: "/admin",
  icon: ShieldCheck,
};
