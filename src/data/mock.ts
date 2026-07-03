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

export type TxType = "data" | "airtime" | "deposit" | "electricity" | "payment";

export interface MockTransaction {
  id: string;
  type: TxType;
  title: string;
  subtitle: string;
  /** Positive = money in, negative = money out */
  amount: number;
  status: "success" | "pending";
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
