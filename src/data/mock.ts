/**
 * Sample data for the dashboard preview.
 * Everything on screen comes from here until the real backend is built —
 * swap these for live data later without touching the UI.
 */

export interface MockUser {
  firstName: string;
  lastName: string;
  initials: string;
  verified: boolean;
}

export interface MockWallet {
  balance: number;
  currency: "GHS";
  cashback: number;
}

export type TxType =
  | "data"
  | "airtime"
  | "deposit"
  | "electricity"
  | "payment"
  | "tv"
  | "withdrawal"
  | "giftcard"
  | "crypto"
  | "bill"
  | "digital"
  | "education";

export type TxGroup = "Today" | "Yesterday" | "This week" | "Earlier";

export interface MockTransaction {
  id: string;
  type: TxType;
  title: string;
  subtitle: string;
  /** Positive = money in, negative = money out */
  amount: number;
  status: "success" | "pending";
  /** Used by the Wallet page to group history by recency */
  group?: TxGroup;
}

export const MOCK_USER: MockUser = {
  firstName: "Kwame",
  lastName: "Mensah",
  initials: "KM",
  verified: true,
};

export const MOCK_WALLET: MockWallet = {
  balance: 2458.5,
  currency: "GHS",
  cashback: 12.5,
};

export const MOCK_TRANSACTIONS: MockTransaction[] = [
  {
    id: "tx_01",
    type: "data",
    title: "MTN Data — 5GB",
    subtitle: "024 ••• 221 · Today, 2:32 PM",
    amount: -28.0,
    status: "success",
  },
  {
    id: "tx_02",
    type: "deposit",
    title: "Wallet Top-up",
    subtitle: "Mobile Money · Today, 9:15 AM",
    amount: 200.0,
    status: "success",
  },
  {
    id: "tx_03",
    type: "payment",
    title: "Payment Received",
    subtitle: "Payment link · Yesterday, 6:40 PM",
    amount: 150.0,
    status: "success",
  },
  {
    id: "tx_04",
    type: "electricity",
    title: "ECG Prepaid",
    subtitle: "Meter 4521 ••• · Yesterday, 11:05 AM",
    amount: -120.0,
    status: "pending",
  },
  {
    id: "tx_05",
    type: "airtime",
    title: "Telecel Airtime",
    subtitle: "020 ••• 118 · Mon, 6:12 PM",
    amount: -10.0,
    status: "success",
  },
];

/** Fuller history for the Wallet page — grouped by recency. */
export const MOCK_TRANSACTIONS_ALL: MockTransaction[] = [
  { id: "t01", type: "data", title: "MTN Data — 5GB", subtitle: "024 ••• 221 · Today, 2:32 PM", amount: -28.0, status: "success", group: "Today" },
  { id: "t02", type: "deposit", title: "Wallet Top-up", subtitle: "Mobile Money · Today, 9:15 AM", amount: 200.0, status: "success", group: "Today" },
  { id: "t03", type: "payment", title: "Payment Received", subtitle: "Payment link · Yesterday, 6:40 PM", amount: 150.0, status: "success", group: "Yesterday" },
  { id: "t04", type: "electricity", title: "ECG Prepaid", subtitle: "Meter 4521 ••• · Yesterday, 11:05 AM", amount: -120.0, status: "pending", group: "Yesterday" },
  { id: "t05", type: "tv", title: "DStv Compact", subtitle: "Smartcard 7789 ••• · Yesterday, 8:20 AM", amount: -145.0, status: "success", group: "Yesterday" },
  { id: "t06", type: "airtime", title: "Telecel Airtime", subtitle: "020 ••• 118 · Mon, 6:12 PM", amount: -10.0, status: "success", group: "This week" },
  { id: "t07", type: "crypto", title: "Crypto to MoMo", subtitle: "USDT → MoMo · Mon, 1:04 PM", amount: 480.0, status: "success", group: "This week" },
  { id: "t08", type: "giftcard", title: "Amazon Gift Card", subtitle: "$25 · Sun, 4:47 PM", amount: -172.0, status: "success", group: "This week" },
  { id: "t09", type: "withdrawal", title: "Withdrawal", subtitle: "To MoMo 024 ••• 221 · Sun, 10:30 AM", amount: -300.0, status: "success", group: "This week" },
  { id: "t10", type: "payment", title: "Payment Received", subtitle: "Checkout page · Sat, 7:55 PM", amount: 90.0, status: "success", group: "Earlier" },
  { id: "t11", type: "data", title: "AirtelTigo Data — 2GB", subtitle: "027 ••• 640 · Sat, 12:11 PM", amount: -14.0, status: "success", group: "Earlier" },
  { id: "t12", type: "deposit", title: "Wallet Top-up", subtitle: "Visa •••• 4429 · Fri, 3:22 PM", amount: 500.0, status: "success", group: "Earlier" },
  { id: "t13", type: "electricity", title: "Ghana Water", subtitle: "Acct 90223 ••• · Fri, 9:40 AM", amount: -60.0, status: "success", group: "Earlier" },
];
