import { CreditCard, Smartphone, type LucideIcon } from "lucide-react";

export type NetworkId = "mtn" | "telecel" | "at";

export interface Network {
  id: NetworkId;
  name: string;
  /** Brand colour — used only as a small accent dot/ring on its card. */
  color: string;
}

export const NETWORKS: Network[] = [
  { id: "mtn", name: "MTN", color: "#FFCB05" },
  { id: "telecel", name: "Telecel", color: "#E4002B" },
  { id: "at", name: "AirtelTigo", color: "#0A72BD" },
];

export interface Bundle {
  id: string;
  size: string;
  validity: string;
  price: number;
  tag?: "Popular" | "Best value";
}

export const BUNDLES: Record<NetworkId, Bundle[]> = {
  mtn: [
    { id: "mtn-1", size: "1GB", validity: "30 days", price: 6 },
    { id: "mtn-2", size: "2GB", validity: "30 days", price: 11, tag: "Popular" },
    { id: "mtn-5", size: "5GB", validity: "30 days", price: 26 },
    { id: "mtn-10", size: "10GB", validity: "30 days", price: 48, tag: "Best value" },
    { id: "mtn-20", size: "20GB", validity: "30 days", price: 90 },
    { id: "mtn-50", size: "50GB", validity: "90 days", price: 200 },
  ],
  telecel: [
    { id: "tel-1", size: "1GB", validity: "30 days", price: 5 },
    { id: "tel-3", size: "3GB", validity: "30 days", price: 14, tag: "Popular" },
    { id: "tel-6", size: "6GB", validity: "30 days", price: 27 },
    { id: "tel-12", size: "12GB", validity: "30 days", price: 50, tag: "Best value" },
    { id: "tel-25", size: "25GB", validity: "60 days", price: 100 },
  ],
  at: [
    { id: "at-1", size: "1GB", validity: "30 days", price: 5 },
    { id: "at-2", size: "2GB", validity: "30 days", price: 9, tag: "Popular" },
    { id: "at-5", size: "5GB", validity: "30 days", price: 22 },
    { id: "at-10", size: "10GB", validity: "30 days", price: 42, tag: "Best value" },
    { id: "at-30", size: "30GB", validity: "60 days", price: 110 },
  ],
};

/** Pre-fills the recipient field so the demo flows quickly. */
export const MY_NUMBER = "0244001122";

export interface PaymentMethod {
  id: string;
  name: string;
  detail: string;
  icon: LucideIcon;
}

export const PAYMENT_METHODS: PaymentMethod[] = [
  { id: "momo", name: "Mobile Money", detail: "024 ••• 221", icon: Smartphone },
  { id: "card", name: "Debit card", detail: "Visa •••• 4429", icon: CreditCard },
];

export const TOPUP_AMOUNTS = [20, 50, 100, 200, 500];
