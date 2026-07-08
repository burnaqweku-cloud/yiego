import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { MOCK_TRANSACTIONS_ALL, type MockTransaction, type TxType } from "@/data/mock";

/**
 * The live wallet — real client-side state so flows actually move money.
 * Balance + transactions persist to localStorage, so purchases survive a
 * reload (until a real backend replaces this). Seeded from the mock history.
 */

const STORAGE_KEY = "yiego_wallet_v1";
const INITIAL_BALANCE = 2458.5;
export const CASHBACK = 12.5;

interface TxDraft {
  type: TxType;
  title: string;
  subtitle: string;
}

interface WalletValue {
  balance: number;
  transactions: MockTransaction[];
  /** Add money in (amount is made positive). */
  credit: (amount: number, draft: TxDraft) => void;
  /** Take money out (amount is made negative). */
  debit: (amount: number, draft: TxDraft) => void;
}

interface Persisted {
  balance: number;
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
        // Validate element-wise — one corrupt entry must never crash the app.
        return { balance: parsed.balance, transactions: parsed.transactions.filter(isValidTx) };
      }
    }
  } catch {
    /* ignore corrupt state */
  }
  return { balance: INITIAL_BALANCE, transactions: MOCK_TRANSACTIONS_ALL };
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

  const addTransaction = (signedAmount: number, draft: TxDraft) => {
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
    };
    setState((s) => ({
      balance: round2(s.balance + signedAmount),
      transactions: [tx, ...s.transactions],
    }));
  };

  const value: WalletValue = {
    balance: state.balance,
    // Real transactions re-group by their timestamp as days pass.
    transactions: state.transactions.map((t) =>
      t.ts ? { ...t, group: groupFromTs(t.ts) } : t,
    ),
    credit: (amount, draft) => addTransaction(Math.abs(amount), draft),
    debit: (amount, draft) => addTransaction(-Math.abs(amount), draft),
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
