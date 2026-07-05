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

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Persisted;
      if (typeof parsed.balance === "number" && Array.isArray(parsed.transactions)) {
        return parsed;
      }
    }
  } catch {
    /* ignore corrupt state */
  }
  return { balance: INITIAL_BALANCE, transactions: MOCK_TRANSACTIONS_ALL };
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
    const tx: MockTransaction = {
      id: `u${Date.now().toString(36)}${txSeq++}`,
      type: draft.type,
      title: draft.title,
      subtitle: draft.subtitle,
      amount: signedAmount,
      status: "success",
      group: "Today",
    };
    setState((s) => ({
      balance: round2(s.balance + signedAmount),
      transactions: [tx, ...s.transactions],
    }));
  };

  const value: WalletValue = {
    balance: state.balance,
    transactions: state.transactions,
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

/** "Today, 2:32 PM" — for fresh transaction subtitles. */
export function nowLabel(): string {
  const t = new Date().toLocaleTimeString("en-GH", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `Today, ${t}`;
}
