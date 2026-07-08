import type { TxType } from "@/data/mock";

/**
 * Config-driven service flows — one generic engine (PurchaseFlow) renders
 * all of these: provider → plan/amount → details → review → pay → success.
 * Adding a service to YieGo = adding a config here.
 */

export interface FlowOption {
  id: string;
  name: string;
  detail?: string;
  /** Brand accent for the logo chip */
  color?: string;
  /** Short mark shown in the logo chip (defaults to first 3 letters) */
  abbr?: string;
}

export interface FlowPlan {
  id: string;
  name: string;
  detail?: string;
  price: number;
  tag?: "Popular" | "Best value";
}

export interface FlowField {
  id: string;
  label: string;
  placeholder?: string;
  inputMode?: "numeric" | "text" | "email";
  digitsOnly?: boolean;
  maxLen?: number;
  minLen?: number;
  errorText?: string;
  /** Quick-fill chip, e.g. "Use my number" — resolved from the live profile */
  prefill?: { label: string; source: "phone" | "email" };
  /** How the value shows on review/success (e.g. masked phone) */
  mask?: (value: string) => string;
  monospace?: boolean;
}

export interface AmountSpec {
  label?: string;
  unit: "GHS" | "USDT";
  min: number;
  presets: number[];
}

export interface FlowState {
  provider: FlowOption | null;
  plan: FlowPlan | null;
  amount: number;
  values: Record<string, string>;
}

export interface ServiceFlowConfig {
  serviceId: string;
  sheetTitle: string;
  /** debit (default): pays from wallet. credit: money comes INTO the wallet. */
  direction?: "credit";
  providers?: { title: string; options: FlowOption[] };
  plans?: { title: string; for: (providerId: string | null) => FlowPlan[] };
  amount?: AmountSpec;
  fields?: FlowField[];
  fieldsTitle?: string;
  /** FX-style helper: shows a rate row + a converted "you receive" line. */
  rate?: { detail: string; convertedLabel: string; convert: (amount: number) => string };
  /** credit direction: how much lands in the wallet for the entered amount. */
  creditAmount?: (amount: number) => number;
  successTitle: string;
  successMessage: (s: FlowState, paidLabel: string) => string;
  /** Extra success rows (e.g. generated voucher PIN). */
  successExtras?: (s: FlowState) => { label: string; value: string }[];
  txType: TxType;
  txTitle: (s: FlowState) => string;
  txSubtitle: (s: FlowState) => string;
}

/* ── Small helpers ──────────────────────────────────────────────── */

export function maskPhone(v: string): string {
  const d = v.replace(/\D/g, "");
  return d.length === 10 ? `${d.slice(0, 3)} ••• ${d.slice(7)}` : v;
}

const phoneField: FlowField = {
  id: "phone",
  label: "Phone number",
  placeholder: "024 000 0000",
  inputMode: "numeric",
  digitsOnly: true,
  maxLen: 10,
  minLen: 10,
  errorText: "Enter a valid 10-digit Ghana number.",
  prefill: { label: "Use my number", source: "phone" },
  mask: maskPhone,
};

const emailField: FlowField = {
  id: "email",
  label: "Delivery email",
  placeholder: "you@example.com",
  inputMode: "email",
  minLen: 6,
  errorText: "Enter the email to deliver to.",
  prefill: { label: "Use my email", source: "email" },
};

/** Deterministic pseudo-serial from a seed — for demo voucher PINs. */
export function demoPin(seed: string, len = 10): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let out = "";
  for (let i = 0; i < len; i++) {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    out += Math.abs(h % 10);
  }
  return out;
}

const GHS_PER_USDT_SELL = 12.4; // crypto → wallet
const GHS_PER_USDT_BUY = 12.55; // wallet → crypto

/* ── The catalog of working flows ───────────────────────────────── */

export const SERVICE_FLOWS: ServiceFlowConfig[] = [
  /* ── Top-ups & bills ── */
  {
    serviceId: "airtime",
    sheetTitle: "Buy airtime",
    providers: {
      title: "Choose a network",
      options: [
        { id: "mtn", name: "MTN", detail: "Airtime top-up", color: "#FFCB05" },
        { id: "telecel", name: "Telecel", detail: "Airtime top-up", color: "#E4002B", abbr: "TEL" },
        { id: "at", name: "AirtelTigo", detail: "Airtime top-up", color: "#0A72BD", abbr: "AT" },
      ],
    },
    amount: { label: "Airtime amount", unit: "GHS", min: 1, presets: [5, 10, 20, 50, 100] },
    fields: [phoneField],
    successTitle: "Airtime sent!",
    successMessage: (s, paid) =>
      `${paid} ${s.provider?.name ?? ""} airtime is on ${maskPhone(s.values.phone ?? "")}.`,
    txType: "airtime",
    txTitle: (s) => `${s.provider?.name ?? ""} Airtime`,
    txSubtitle: (s) => maskPhone(s.values.phone ?? ""),
  },
  {
    serviceId: "electricity",
    sheetTitle: "ECG prepaid",
    amount: { label: "Top-up amount", unit: "GHS", min: 10, presets: [50, 100, 200, 500] },
    fields: [
      {
        id: "meter",
        label: "Meter number",
        placeholder: "e.g. 45213308",
        inputMode: "numeric",
        digitsOnly: true,
        maxLen: 13,
        minLen: 6,
        errorText: "Enter your ECG meter number.",
        monospace: true,
      },
    ],
    successTitle: "Power sorted!",
    successMessage: (s, paid) => `${paid} of ECG credit is loading onto meter ${s.values.meter}.`,
    successExtras: (s) => [
      { label: "Token", value: demoPin(`ecg-${s.values.meter}-${s.amount}`, 16).replace(/(\d{4})(?=\d)/g, "$1-") },
    ],
    txType: "electricity",
    txTitle: () => "ECG Prepaid",
    txSubtitle: (s) => `Meter ${s.values.meter}`,
  },
  {
    serviceId: "water",
    sheetTitle: "Water bill",
    amount: { label: "Payment amount", unit: "GHS", min: 5, presets: [30, 60, 120, 300] },
    fields: [
      {
        id: "account",
        label: "GWCL account number",
        placeholder: "e.g. 90223481",
        inputMode: "numeric",
        digitsOnly: true,
        maxLen: 12,
        minLen: 6,
        errorText: "Enter your Ghana Water account number.",
        monospace: true,
      },
    ],
    successTitle: "Bill paid!",
    successMessage: (s, paid) => `${paid} paid to Ghana Water for account ${s.values.account}.`,
    txType: "bill",
    txTitle: () => "Ghana Water",
    txSubtitle: (s) => `Acct ${s.values.account}`,
  },
  {
    serviceId: "tv",
    sheetTitle: "TV subscription",
    providers: {
      title: "Choose a provider",
      options: [
        { id: "dstv", name: "DStv", detail: "Monthly packages", color: "#2B9CDA", abbr: "DS" },
        { id: "gotv", name: "GOtv", detail: "Monthly packages", color: "#7AB800", abbr: "GO" },
        { id: "startimes", name: "StarTimes", detail: "Monthly packages", color: "#E8442E", abbr: "ST" },
      ],
    },
    plans: {
      title: "Pick a package",
      for: (p) =>
        p === "dstv"
          ? [
              { id: "ds1", name: "Padi", detail: "1 month", price: 59 },
              { id: "ds2", name: "Access", detail: "1 month", price: 119, tag: "Popular" },
              { id: "ds3", name: "Compact", detail: "1 month", price: 289 },
              { id: "ds4", name: "Compact Plus", detail: "1 month", price: 455 },
            ]
          : p === "gotv"
            ? [
                { id: "go1", name: "Lite", detail: "1 month", price: 29 },
                { id: "go2", name: "Jinja", detail: "1 month", price: 69, tag: "Popular" },
                { id: "go3", name: "Jolli", detail: "1 month", price: 99 },
                { id: "go4", name: "Max", detail: "1 month", price: 145 },
              ]
            : [
                { id: "st1", name: "Nova", detail: "1 month", price: 25 },
                { id: "st2", name: "Basic", detail: "1 month", price: 49, tag: "Popular" },
                { id: "st3", name: "Classic", detail: "1 month", price: 85 },
              ],
    },
    fields: [
      {
        id: "card",
        label: "Smartcard / IUC number",
        placeholder: "e.g. 7789102234",
        inputMode: "numeric",
        digitsOnly: true,
        maxLen: 12,
        minLen: 8,
        errorText: "Enter the smartcard number on your decoder.",
        monospace: true,
      },
    ],
    successTitle: "Subscription active!",
    successMessage: (s) =>
      `${s.provider?.name} ${s.plan?.name} is renewed on smartcard ${s.values.card}.`,
    txType: "tv",
    txTitle: (s) => `${s.provider?.name} ${s.plan?.name}`,
    txSubtitle: (s) => `Smartcard ${s.values.card}`,
  },
  {
    serviceId: "internet",
    sheetTitle: "Internet bill",
    providers: {
      title: "Choose a provider",
      options: [
        { id: "mtnf", name: "MTN Fibre", detail: "Broadband", color: "#FFCB05", abbr: "MF" },
        { id: "telb", name: "Telecel Broadband", detail: "Broadband", color: "#E4002B", abbr: "TB" },
        { id: "surf", name: "Surfline", detail: "4G LTE", color: "#00B5E2", abbr: "SF" },
        { id: "busy", name: "Busy", detail: "4G LTE", color: "#8DC63F", abbr: "BU" },
      ],
    },
    amount: { label: "Payment amount", unit: "GHS", min: 10, presets: [50, 100, 200, 400] },
    fields: [
      {
        id: "account",
        label: "Account / router number",
        placeholder: "e.g. 233501234",
        inputMode: "numeric",
        digitsOnly: true,
        maxLen: 12,
        minLen: 6,
        errorText: "Enter your account or router number.",
        monospace: true,
      },
    ],
    successTitle: "Internet paid!",
    successMessage: (s, paid) => `${paid} paid to ${s.provider?.name} for ${s.values.account}.`,
    txType: "bill",
    txTitle: (s) => `${s.provider?.name} Internet`,
    txSubtitle: (s) => `Acct ${s.values.account}`,
  },

  /* ── Crypto & exchange ── */
  {
    serviceId: "crypto-to-momo",
    sheetTitle: "Crypto to MoMo",
    direction: "credit",
    amount: { label: "You send (USDT)", unit: "USDT", min: 5, presets: [10, 50, 100, 500] },
    rate: {
      detail: `1 USDT = GH₵ ${GHS_PER_USDT_SELL.toFixed(2)}`,
      convertedLabel: "You receive",
      convert: (a) => `GH₵ ${(a * GHS_PER_USDT_SELL).toFixed(2)}`,
    },
    creditAmount: (a) => Math.round(a * GHS_PER_USDT_SELL * 100) / 100,
    successTitle: "Cashed out!",
    successMessage: (s) =>
      `${s.amount} USDT received — GH₵ ${(s.amount * GHS_PER_USDT_SELL).toFixed(2)} is now in your wallet.`,
    txType: "crypto",
    txTitle: () => "Crypto to MoMo",
    txSubtitle: (s) => `${s.amount} USDT → wallet`,
  },
  {
    serviceId: "momo-to-crypto",
    sheetTitle: "MoMo to Crypto",
    amount: { label: "You pay", unit: "GHS", min: 20, presets: [50, 100, 500, 1000] },
    rate: {
      detail: `1 USDT = GH₵ ${GHS_PER_USDT_BUY.toFixed(2)}`,
      convertedLabel: "You receive",
      convert: (a) => `≈ ${(a / GHS_PER_USDT_BUY).toFixed(2)} USDT`,
    },
    fields: [
      {
        id: "address",
        label: "USDT wallet address (TRC-20)",
        placeholder: "T…",
        minLen: 20,
        errorText: "Paste a valid wallet address.",
        monospace: true,
        mask: (v) => `${v.slice(0, 6)}…${v.slice(-4)}`,
      },
    ],
    successTitle: "Crypto sent!",
    successMessage: (s, paid) =>
      `${paid} converted — ≈ ${(s.amount / GHS_PER_USDT_BUY).toFixed(2)} USDT is on its way to your wallet.`,
    txType: "crypto",
    txTitle: () => "USDT Purchase",
    txSubtitle: (s) => `${(s.amount / GHS_PER_USDT_BUY).toFixed(2)} USDT`,
  },
  {
    serviceId: "buy-usdt",
    sheetTitle: "Buy USDT",
    amount: { label: "You pay", unit: "GHS", min: 20, presets: [100, 200, 500, 2000] },
    rate: {
      detail: `1 USDT = GH₵ ${GHS_PER_USDT_BUY.toFixed(2)}`,
      convertedLabel: "You receive",
      convert: (a) => `≈ ${(a / GHS_PER_USDT_BUY).toFixed(2)} USDT`,
    },
    fields: [
      {
        id: "address",
        label: "USDT wallet address (TRC-20)",
        placeholder: "T…",
        minLen: 20,
        errorText: "Paste a valid wallet address.",
        monospace: true,
        mask: (v) => `${v.slice(0, 6)}…${v.slice(-4)}`,
      },
    ],
    successTitle: "USDT on its way!",
    successMessage: (s, paid) =>
      `${paid} exchanged at a fair rate — ≈ ${(s.amount / GHS_PER_USDT_BUY).toFixed(2)} USDT incoming.`,
    txType: "crypto",
    txTitle: () => "Buy USDT",
    txSubtitle: (s) => `${(s.amount / GHS_PER_USDT_BUY).toFixed(2)} USDT`,
  },

  /* ── Digital & tools ── */
  {
    serviceId: "gift-cards",
    sheetTitle: "Gift cards",
    providers: {
      title: "Pick a brand",
      options: [
        { id: "amazon", name: "Amazon", detail: "US gift cards", color: "#FF9900", abbr: "AZ" },
        { id: "itunes", name: "Apple / iTunes", detail: "US gift cards", color: "#FA57C1", abbr: "AP" },
        { id: "gplay", name: "Google Play", detail: "US gift cards", color: "#34A853", abbr: "GP" },
        { id: "steam", name: "Steam", detail: "US gift cards", color: "#66C0F4", abbr: "SM" },
      ],
    },
    plans: {
      title: "Choose a value",
      for: () => [
        { id: "g10", name: "$10 card", detail: "Digital code", price: 69 },
        { id: "g25", name: "$25 card", detail: "Digital code", price: 172, tag: "Popular" },
        { id: "g50", name: "$50 card", detail: "Digital code", price: 344 },
        { id: "g100", name: "$100 card", detail: "Digital code", price: 688, tag: "Best value" },
      ],
    },
    fields: [emailField],
    successTitle: "Gift card delivered!",
    successMessage: (s) =>
      `Your ${s.provider?.name} ${s.plan?.name} code was sent to ${s.values.email}.`,
    successExtras: (s) => [
      {
        label: "Code",
        value: demoPin(`gc-${s.provider?.id}-${s.plan?.id}-${s.values.email}`, 12)
          .replace(/(\d{4})(?=\d)/g, "$1-"),
      },
    ],
    txType: "giftcard",
    txTitle: (s) => `${s.provider?.name} Gift Card ${s.plan?.name.replace(" card", "")}`,
    txSubtitle: (s) => s.values.email ?? "",
  },
  {
    serviceId: "streaming",
    sheetTitle: "Streaming subs",
    providers: {
      title: "Pick a service",
      options: [
        { id: "netflix", name: "Netflix", detail: "Renew monthly", color: "#E50914", abbr: "NF" },
        { id: "spotify", name: "Spotify", detail: "Renew monthly", color: "#1DB954", abbr: "SP" },
        { id: "prime", name: "Prime Video", detail: "Renew monthly", color: "#00A8E1", abbr: "PV" },
        { id: "ytp", name: "YouTube Premium", detail: "Renew monthly", color: "#FF0000", abbr: "YT" },
      ],
    },
    plans: {
      title: "Choose a plan",
      for: (p) =>
        p === "netflix"
          ? [
              { id: "n1", name: "Basic", detail: "1 month", price: 65 },
              { id: "n2", name: "Standard", detail: "1 month", price: 120, tag: "Popular" },
              { id: "n3", name: "Premium 4K", detail: "1 month", price: 165 },
            ]
          : p === "spotify"
            ? [
                { id: "s1", name: "Individual", detail: "1 month", price: 35, tag: "Popular" },
                { id: "s2", name: "Duo", detail: "1 month", price: 55 },
                { id: "s3", name: "Family", detail: "1 month", price: 70, tag: "Best value" },
              ]
            : [
                { id: "p1", name: "Monthly", detail: "1 month", price: 55, tag: "Popular" },
                { id: "p2", name: "Annual", detail: "12 months", price: 490, tag: "Best value" },
              ],
    },
    fields: [{ ...emailField, label: "Account email" }],
    successTitle: "Subscription renewed!",
    successMessage: (s) => `${s.provider?.name} ${s.plan?.name} is active on ${s.values.email}.`,
    txType: "digital",
    txTitle: (s) => `${s.provider?.name} ${s.plan?.name}`,
    txSubtitle: (s) => s.values.email ?? "",
  },
  {
    serviceId: "vpn",
    sheetTitle: "VPN access",
    plans: {
      title: "Choose a plan",
      for: () => [
        { id: "v1", name: "1 month", detail: "Unlimited devices", price: 25 },
        { id: "v2", name: "6 months", detail: "Unlimited devices", price: 120, tag: "Popular" },
        { id: "v3", name: "12 months", detail: "Unlimited devices", price: 200, tag: "Best value" },
      ],
    },
    fields: [emailField],
    successTitle: "VPN activated!",
    successMessage: (s) => `Your ${s.plan?.name} VPN pass was sent to ${s.values.email}.`,
    successExtras: (s) => [
      { label: "Activation key", value: demoPin(`vpn-${s.plan?.id}-${s.values.email}`, 12).replace(/(\d{4})(?=\d)/g, "$1-") },
    ],
    txType: "digital",
    txTitle: (s) => `VPN Access — ${s.plan?.name}`,
    txSubtitle: (s) => s.values.email ?? "",
  },
  {
    serviceId: "virtual-numbers",
    sheetTitle: "Virtual numbers",
    providers: {
      title: "Choose a country",
      options: [
        { id: "us", name: "United States", detail: "+1 numbers", color: "#4F86F7", abbr: "US" },
        { id: "uk", name: "United Kingdom", detail: "+44 numbers", color: "#C8102E", abbr: "UK" },
        { id: "ca", name: "Canada", detail: "+1 numbers", color: "#D80621", abbr: "CA" },
        { id: "de", name: "Germany", detail: "+49 numbers", color: "#FFCE00", abbr: "DE" },
      ],
    },
    plans: {
      title: "What's it for?",
      for: () => [
        { id: "vn1", name: "WhatsApp verification", detail: "One-time code", price: 18, tag: "Popular" },
        { id: "vn2", name: "Telegram verification", detail: "One-time code", price: 15 },
        { id: "vn3", name: "Any service · 30 days", detail: "Keep the number a month", price: 85, tag: "Best value" },
      ],
    },
    successTitle: "Number assigned!",
    successMessage: (s) => `Your ${s.provider?.name} number is live for ${s.plan?.name.toLowerCase()}.`,
    successExtras: (s) => [
      {
        label: "Your number",
        value: `+${s.provider?.id === "uk" ? "44" : s.provider?.id === "de" ? "49" : "1"} ${demoPin(`vn-${s.provider?.id}-${s.plan?.id}`, 10).replace(/(\d{3})(\d{3})(\d{4})/, "$1 $2 $3")}`,
      },
    ],
    txType: "digital",
    txTitle: (s) => `Virtual Number — ${s.provider?.name}`,
    txSubtitle: (s) => s.plan?.name ?? "",
  },
  {
    serviceId: "esim",
    sheetTitle: "eSIM data",
    providers: {
      title: "Where are you travelling?",
      options: [
        { id: "wa", name: "West Africa", detail: "15 countries", color: "#22C387", abbr: "WA" },
        { id: "eu", name: "Europe", detail: "39 countries", color: "#4F86F7", abbr: "EU" },
        { id: "us", name: "USA", detail: "USA only", color: "#C8102E", abbr: "US" },
        { id: "gl", name: "Global", detail: "130+ countries", color: "#F5B544", abbr: "GL" },
      ],
    },
    plans: {
      title: "Pick a data pack",
      for: (p) => {
        const base = p === "wa" ? 1 : p === "eu" ? 1.6 : p === "us" ? 1.8 : 2.2;
        const r = (n: number) => Math.round(n * base);
        return [
          { id: "e1", name: "1GB · 7 days", detail: "Instant QR install", price: r(35) },
          { id: "e2", name: "3GB · 30 days", detail: "Instant QR install", price: r(85), tag: "Popular" },
          { id: "e3", name: "10GB · 30 days", detail: "Instant QR install", price: r(210), tag: "Best value" },
        ];
      },
    },
    fields: [emailField],
    successTitle: "eSIM ready!",
    successMessage: (s) =>
      `Your ${s.provider?.name} ${s.plan?.name} eSIM QR code was sent to ${s.values.email}.`,
    txType: "digital",
    txTitle: (s) => `eSIM — ${s.provider?.name} ${s.plan?.name.split(" ·")[0]}`,
    txSubtitle: (s) => s.values.email ?? "",
  },
  {
    serviceId: "bulk-sms",
    sheetTitle: "Bulk SMS",
    plans: {
      title: "Choose a credit pack",
      for: () => [
        { id: "b1", name: "100 SMS", detail: "Never expires", price: 8 },
        { id: "b2", name: "500 SMS", detail: "Never expires", price: 35, tag: "Popular" },
        { id: "b3", name: "1,000 SMS", detail: "Never expires", price: 65 },
        { id: "b4", name: "5,000 SMS", detail: "Never expires", price: 290, tag: "Best value" },
      ],
    },
    fields: [
      {
        id: "sender",
        label: "Sender ID",
        placeholder: "e.g. MYSHOP",
        minLen: 3,
        maxLen: 11,
        errorText: "3–11 characters, shown as the SMS sender.",
      },
    ],
    successTitle: "Credits loaded!",
    successMessage: (s) => `${s.plan?.name} credits added under sender ID “${s.values.sender}”.`,
    txType: "digital",
    txTitle: (s) => `Bulk SMS — ${s.plan?.name}`,
    txSubtitle: (s) => `Sender ${s.values.sender}`,
  },

  /* ── Education & exams ── */
  {
    serviceId: "results-checker",
    sheetTitle: "Results checker",
    plans: {
      title: "Which exam?",
      for: () => [
        { id: "r1", name: "WASSCE checker", detail: "Serial + PIN", price: 25, tag: "Popular" },
        { id: "r2", name: "BECE checker", detail: "Serial + PIN", price: 25 },
        { id: "r3", name: "NovDec checker", detail: "Serial + PIN", price: 25 },
      ],
    },
    fields: [{ ...phoneField, label: "Send PIN to (phone)" }],
    successTitle: "Checker delivered!",
    successMessage: (s) =>
      `Your ${s.plan?.name} was sent by SMS to ${maskPhone(s.values.phone ?? "")}.`,
    successExtras: (s) => [
      { label: "Serial", value: `WGH${demoPin(`rc-s-${s.plan?.id}-${s.values.phone}`, 7)}` },
      { label: "PIN", value: demoPin(`rc-p-${s.plan?.id}-${s.values.phone}`, 10) },
    ],
    txType: "education",
    txTitle: (s) => s.plan?.name ?? "Results checker",
    txSubtitle: (s) => maskPhone(s.values.phone ?? ""),
  },
  {
    serviceId: "school-placement",
    sheetTitle: "School placement",
    plans: {
      title: "What do you need?",
      for: () => [
        { id: "sp1", name: "Placement checker", detail: "CSSPS results", price: 20, tag: "Popular" },
        { id: "sp2", name: "Self-placement form", detail: "School selection", price: 45 },
      ],
    },
    fields: [{ ...phoneField, label: "Send PIN to (phone)" }],
    successTitle: "PIN delivered!",
    successMessage: (s) =>
      `Your ${s.plan?.name.toLowerCase()} PIN was sent to ${maskPhone(s.values.phone ?? "")}.`,
    successExtras: (s) => [
      { label: "PIN", value: demoPin(`sp-${s.plan?.id}-${s.values.phone}`, 10) },
    ],
    txType: "education",
    txTitle: (s) => `CSSPS ${s.plan?.name}`,
    txSubtitle: (s) => maskPhone(s.values.phone ?? ""),
  },
  {
    serviceId: "e-vouchers",
    sheetTitle: "E-vouchers",
    plans: {
      title: "Choose a voucher",
      for: () => [
        { id: "ev1", name: "UG application form", detail: "University of Ghana", price: 220 },
        { id: "ev2", name: "KNUST application form", detail: "KNUST", price: 210, tag: "Popular" },
        { id: "ev3", name: "UCC application form", detail: "Cape Coast", price: 200 },
        { id: "ev4", name: "Nursing training form", detail: "MoH", price: 150 },
      ],
    },
    fields: [emailField],
    successTitle: "Voucher delivered!",
    successMessage: (s) => `Your ${s.plan?.name} voucher was sent to ${s.values.email}.`,
    successExtras: (s) => [
      { label: "Serial", value: `EV${demoPin(`ev-s-${s.plan?.id}`, 8)}` },
      { label: "PIN", value: demoPin(`ev-p-${s.plan?.id}-${s.values.email}`, 10) },
    ],
    txType: "education",
    txTitle: (s) => s.plan?.name ?? "E-voucher",
    txSubtitle: (s) => s.values.email ?? "",
  },
];

export function flowFor(serviceId: string): ServiceFlowConfig | undefined {
  return SERVICE_FLOWS.find((f) => f.serviceId === serviceId);
}
