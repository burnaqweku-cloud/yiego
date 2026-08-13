import {
  BadgeCheck,
  Clock3,
  Headphones,
  Landmark,
  ReceiptText,
  Search,
  ShieldCheck,
  Smartphone,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { NETWORKS, type NetworkId } from "@/data/bundles";

/* ══════════════════════════════════════════════════════════════
   Homepage content. Everything here is either factual about how
   YieGo works today, or clearly marked as replaceable placeholder.
   Keep it honest — this copy is what a first-time visitor judges
   the business on.
   ══════════════════════════════════════════════════════════════ */

/* ── Categories: the networks YieGo actually delivers to ────────── */

export interface Category {
  id: NetworkId;
  name: string;
  color: string;
  blurb: string;
  /** Short marketing line under the name. */
  detail: string;
}

const CATEGORY_COPY: Record<NetworkId, { blurb: string; detail: string }> = {
  mtn: { blurb: "Ghana's widest coverage", detail: "Bundles for everyday browsing, streaming and work." },
  telecel: { blurb: "Strong city coverage", detail: "Reliable data for Accra, Kumasi and the major hubs." },
  at: { blurb: "Value that goes further", detail: "Generous bundles at prices built for students and teams." },
};

export const CATEGORIES: Category[] = NETWORKS.map((n) => ({
  id: n.id,
  name: n.name,
  color: n.color,
  ...CATEGORY_COPY[n.id],
}));

/* ── Why choose YieGo ───────────────────────────────────────────── */

export interface Reason {
  icon: LucideIcon;
  title: string;
  body: string;
  /** Featured reasons render in the large lead cell. */
  featured?: boolean;
}

export const REASONS: Reason[] = [
  {
    icon: ShieldCheck,
    title: "Your money is handled properly",
    body: "Every payment is confirmed with Paystack before an order moves. Your wallet balance can only be changed by the server — never from your phone or browser.",
    featured: true,
  },
  {
    icon: Clock3,
    title: "Delivered in minutes",
    body: "Orders go straight to the network the moment payment clears — no queues, no waiting for an agent to wake up.",
  },
  {
    icon: Landmark,
    title: "Honest prices",
    body: "One clear price per bundle — the same whether it's your first order or your fiftieth.",
  },
  {
    icon: Wallet,
    title: "A wallet that saves you time",
    body: "Top up once, then buy in two taps. Every cedi in and out is on your statement.",
  },
  {
    icon: Search,
    title: "Track every order",
    body: "A YieGo reference on every purchase, so you always know exactly where an order stands.",
  },
  {
    icon: Headphones,
    title: "Support that answers",
    body: "24/7 AI assistance for the quick questions, and a real human on WhatsApp when it matters.",
  },
];

/* ── Trust strip under the hero ─────────────────────────────────── */

export interface TrustPoint {
  icon: LucideIcon;
  label: string;
  detail: string;
}

export const TRUST_POINTS: TrustPoint[] = [
  { icon: Smartphone, label: "All 3 networks", detail: "MTN · Telecel · AirtelTigo" },
  { icon: ShieldCheck, label: "Secure checkout", detail: "Paystack verified" },
  { icon: Clock3, label: "Minutes, not hours", detail: "Automatic delivery" },
  { icon: ReceiptText, label: "Every order tracked", detail: "YieGo reference" },
];

/* ── How it works ───────────────────────────────────────────────── */

export interface Step {
  n: string;
  title: string;
  body: string;
  icon: LucideIcon;
}

export const STEPS: Step[] = [
  {
    n: "01",
    title: "Pick a bundle",
    body: "Choose the network and the bundle you want. Live prices, nothing hidden.",
    icon: Smartphone,
  },
  {
    n: "02",
    title: "Enter the number",
    body: "Type the number receiving the data. Buy for yourself, family or a customer.",
    icon: BadgeCheck,
  },
  {
    n: "03",
    title: "Pay your way",
    body: "Pay from your YieGo wallet, by Mobile Money or card — or send the order to someone else to pay.",
    icon: Wallet,
  },
  {
    n: "04",
    title: "Track it land",
    body: "Follow the order with your YieGo reference until the data is delivered.",
    icon: Search,
  },
];

/* ── Testimonials ───────────────────────────────────────────────────
   ⚠️  PLACEHOLDER CONTENT — REPLACE BEFORE LAUNCH.
   These are written as examples of the tone real reviews should take.
   Do not publish them as genuine customer quotes. Swap in real, opted-in
   testimonials (or delete the section) before the site goes live.
   ───────────────────────────────────────────────────────────────── */

export interface Testimonial {
  quote: string;
  name: string;
  role: string;
  initials: string;
}

export const TESTIMONIALS_ARE_PLACEHOLDER = true;

export const TESTIMONIALS: Testimonial[] = [
  {
    quote:
      "I run a small shop and top up customers all day. Being able to pay from the wallet and get a reference for every order is what keeps my records straight.",
    name: "Placeholder name",
    role: "Shop owner, Kumasi",
    initials: "PN",
  },
  {
    quote:
      "The part I like is that it just arrives. I pay, I get the message, the data is on the phone. No calling anybody to follow up.",
    name: "Placeholder name",
    role: "Student, Legon",
    initials: "PN",
  },
  {
    quote:
      "I send data to my mother every month. I can pay for it from here and she gets it on her line the same minute.",
    name: "Placeholder name",
    role: "Customer, Takoradi",
    initials: "PN",
  },
];
