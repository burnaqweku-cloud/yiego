import {
  Smartphone,
  Wifi,
  Zap,
  Droplets,
  Tv,
  Globe,
  Link2,
  LayoutPanelTop,
  FileText,
  Code2,
  Banknote,
  Bitcoin,
  ArrowRightLeft,
  CircleDollarSign,
  Gift,
  MonitorPlay,
  ShieldCheck,
  Hash,
  Signal,
  MessageSquareText,
  Repeat2,
  GraduationCap,
  School,
  Ticket,
  type LucideIcon,
} from "lucide-react";

export type CategoryId = "topups" | "business" | "crypto" | "digital" | "education";

export interface ServiceCategory {
  id: CategoryId;
  label: string;
  /** Short label for tight spaces (pills) */
  short: string;
}

export interface Service {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  category: CategoryId;
  badge?: "new" | "popular";
}

export const CATEGORIES: ServiceCategory[] = [
  { id: "topups", label: "Top-ups & Bills", short: "Top-ups" },
  { id: "business", label: "Payments & Business", short: "Business" },
  { id: "crypto", label: "Crypto & Exchange", short: "Crypto" },
  { id: "digital", label: "Digital & Tools", short: "Digital" },
  { id: "education", label: "Education & Exams", short: "Education" },
];

export const SERVICES: Service[] = [
  // ── Top-ups & Bills ──────────────────────────────
  { id: "airtime", name: "Airtime", description: "Instant top-up, all networks", icon: Smartphone, category: "topups", badge: "popular" },
  { id: "data", name: "Data Bundles", description: "Cheap MTN, Telecel & AT data", icon: Wifi, category: "topups", badge: "popular" },
  { id: "electricity", name: "Electricity", description: "ECG prepaid & postpaid", icon: Zap, category: "topups" },
  { id: "water", name: "Water Bills", description: "Ghana Water bill payments", icon: Droplets, category: "topups" },
  { id: "tv", name: "TV Subscriptions", description: "DStv, GOtv & StarTimes", icon: Tv, category: "topups" },
  { id: "internet", name: "Internet Bills", description: "Broadband & router top-ups", icon: Globe, category: "topups" },

  // ── Payments & Business ──────────────────────────
  { id: "payment-links", name: "Payment Links", description: "Get paid with a simple link", icon: Link2, category: "business", badge: "new" },
  { id: "checkout-pages", name: "Checkout Pages", description: "Branded pages that sell", icon: LayoutPanelTop, category: "business" },
  { id: "invoices", name: "Invoices", description: "Bill clients professionally", icon: FileText, category: "business" },
  { id: "developer-api", name: "Developer API", description: "Payments in your own app", icon: Code2, category: "business", badge: "new" },
  { id: "payouts", name: "Payouts", description: "Send money to MoMo & banks", icon: Banknote, category: "business" },

  // ── Crypto & Exchange ────────────────────────────
  { id: "crypto-to-momo", name: "Crypto to MoMo", description: "Cash out BTC & USDT fast", icon: Bitcoin, category: "crypto" },
  { id: "momo-to-crypto", name: "MoMo to Crypto", description: "Buy crypto with mobile money", icon: ArrowRightLeft, category: "crypto" },
  { id: "buy-usdt", name: "Buy USDT", description: "Stablecoins at fair rates", icon: CircleDollarSign, category: "crypto" },

  // ── Digital & Tools ──────────────────────────────
  { id: "gift-cards", name: "Gift Cards", description: "iTunes, Amazon, Steam & more", icon: Gift, category: "digital" },
  { id: "streaming", name: "Streaming Subs", description: "Netflix, Spotify & Prime", icon: MonitorPlay, category: "digital" },
  { id: "vpn", name: "VPN Access", description: "Fast, private browsing", icon: ShieldCheck, category: "digital" },
  { id: "virtual-numbers", name: "Virtual Numbers", description: "Numbers for verifications", icon: Hash, category: "digital" },
  { id: "esim", name: "eSIM Data", description: "Travel data, no SIM swap", icon: Signal, category: "digital" },
  { id: "bulk-sms", name: "Bulk SMS", description: "Reach customers at scale", icon: MessageSquareText, category: "digital" },
  { id: "bet-converter", name: "Bet Code Converter", description: "Convert codes across bookies", icon: Repeat2, category: "digital" },

  // ── Education & Exams ────────────────────────────
  { id: "results-checker", name: "Results Checker", description: "BECE & WASSCE checker cards", icon: GraduationCap, category: "education", badge: "popular" },
  { id: "school-placement", name: "School Placement", description: "SHS placement & forms", icon: School, category: "education" },
  { id: "e-vouchers", name: "E-Vouchers", description: "University & exam vouchers", icon: Ticket, category: "education" },
];

export function servicesByCategory(id: CategoryId): Service[] {
  return SERVICES.filter((s) => s.category === id);
}
