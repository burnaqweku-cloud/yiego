import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { MOCK_TRANSACTIONS_ALL, type MockTransaction, type TxType } from "@/data/mock";

/**
 * The live wallet — real client-side state so flows actually move money.
 * Balance, cashback and transactions persist to localStorage, so purchases
 * survive a reload (until a real backend replaces this).
 *
 * Cashback is real here: every debit accrues 1% into a cashback pot, which
 * can be redeemed back into the balance from the Wallet page.
 */

const STORAGE_KEY = "yiego_wallet_v1";
const INITIAL_BALANCE = 2458.5;
const INITIAL_CASHBACK = 12.5;
export const CASHBACK_RATE = 0.01;
export const CASHBACK_MIN_REDEEM = 1;

interface TxDraft {
  type: TxType;
  title: string;
  subtitle: string;
}

interface WalletValue {
  balance: number;
  /** Cashback pot — grows 1% per purchase, redeemable into the balance. */
  cashback: number;
  transactions: MockTransaction[];
  /** Add money in (amount is made positive). Returns the created receipt. */
  credit: (amount: number, draft: TxDraft) => MockTransaction;
  /** Take money out (amount is made negative). Returns the created receipt. */
  debit: (amount: number, draft: TxDraft) => MockTransaction;
  /** Move the cashback pot into the balance. Returns the amount redeemed. */
  redeemCashback: () => number;
}

interface Persisted {
  balance: number;
  cashback: number;
  transactions: MockTransaction[];
}

const WalletContext = createContext<WalletValue | null>(null);

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const TX_TYPES: TxType[] = [
  "data", "airtime", "deposit", "electricity", "payment", "tv",
  "withdrawal", "giftcard", "crypto", "bill", "digital", "education",
];

function isValidTx(t: unknown): t is MockTransaction {
  const x = t as MockTransaction;
  return (
    !!x &&
    typeof x.id === "string" &&
    typeof x.title === "string" &&
    typeof x.subtitle === "string" &&
    Number.isFinite(x.amount) &&
    (TX_TYPES as string[]).includes(x.type as string)
  );
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Persisted;
      if (Number.isFinite(parsed?.balance) && Array.isArray(parsed?.transactions)) {
        return {
          balance: parsed.balance,
          // Older saves predate the cashback pot — seed it.
          cashback: Number.isFinite(parsed.cashback) ? parsed.cashback : INITIAL_CASHBACK,
          // Validate element-wise — one corrupt entry must never crash the app.
          transactions: parsed.transactions.filter(isValidTx),
        };
      }
    }
  } catch {
    /* ignore corrupt state */
  }
  return {
    balance: INITIAL_BALANCE,
    cashback: INITIAL_CASHBACK,
    transactions: MOCK_TRANSACTIONS_ALL,
  };
}

/** Recency group derived from a real timestamp (seeded rows keep theirs). */
function groupFromTs(ts: number): MockTransaction["group"] {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(ts))) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  return "Earlier";
}

/** "YG-8F2K4Q" — receipt reference shown on success screens and receipts. */
function makeRef(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return `YG-${s}`;
}

/** Reference for any transaction — falls back to a stable derivation for
 *  seeded rows that predate real refs. */
export function txRef(t: MockTransaction): string {
  return t.ref ?? `YG-${t.id.slice(-6).toUpperCase().replace(/[^A-Z0-9]/g, "7")}`;
}

let txSeq = 0;

export function WalletProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* storage may be unavailable — non-fatal */
    }
  }, [state]);

  const addTransaction = (signedAmount: number, draft: TxDraft): MockTransaction => {
    const now = Date.now();
    const tx: MockTransaction = {
      id: `u${now.toString(36)}${txSeq++}`,
      type: draft.type,
      title: draft.title,
      subtitle: draft.subtitle,
      amount: signedAmount,
      status: "success",
      group: "Today",
      ts: now,
      ref: makeRef(),
    };
    setState((s) => ({
      balance: round2(s.balance + signedAmount),
      // Purchases earn 1% back (top-ups/withdrawals don't earn on themselves
      // being credits; only money OUT accrues).
      cashback:
        signedAmount < 0 && draft.type !== "withdrawal"
          ? round2(s.cashback + Math.abs(signedAmount) * CASHBACK_RATE)
          : s.cashback,
      transactions: [tx, ...s.transactions],
    }));
    return tx;
  };

  const redeemCashback = (): number => {
    const amt = round2(state.cashback);
    if (amt < CASHBACK_MIN_REDEEM) return 0;
    const now = Date.now();
    const tx: MockTransaction = {
      id: `u${now.toString(36)}${txSeq++}`,
      type: "deposit",
      title: "Cashback Redeemed",
      subtitle: `1% back on purchases · ${nowLabel()}`,
      amount: amt,
      status: "success",
      group: "Today",
      ts: now,
      ref: makeRef(),
    };
    setState((s) => ({
      balance: round2(s.balance + amt),
      cashback: 0,
      transactions: [tx, ...s.transactions],
    }));
    return amt;
  };

  const value: WalletValue = {
    balance: state.balance,
    cashback: round2(state.cashback),
    // Real transactions re-group by their timestamp as days pass.
    transactions: state.transactions.map((t) =>
      t.ts ? { ...t, group: groupFromTs(t.ts) } : t,
    ),
    credit: (amount, draft) => addTransaction(Math.abs(amount), draft),
    debit: (amount, draft) => addTransaction(-Math.abs(amount), draft),
    redeemCashback,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within a WalletProvider");
  return ctx;
}

/** "2:32 PM" — the group header (Today/Yesterday/…) supplies the day, so
 *  subtitles stay truthful as time passes. */
export function nowLabel(): string {
  return new Date().toLocaleTimeString("en-GH", {
    hour: "numeric",
    minute: "2-digit",
  });
}
