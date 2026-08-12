import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/store/auth-context";
import type { WalletTransaction, WalletTransactionType } from "@/types/wallet";

interface WalletValue {
  balance: number;
  transactions: WalletTransaction[];
  loading: boolean;
  isRealWallet: boolean;
  hasWallet: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

interface DbError { message: string }
interface QueryChain<T> extends PromiseLike<{ data: T; error: DbError | null }> {
  select: (columns?: string) => QueryChain<T>;
  eq: (column: string, value: unknown) => QueryChain<T>;
  order: (column: string, options?: { ascending?: boolean }) => QueryChain<T>;
  limit: (count: number) => QueryChain<T>;
  maybeSingle: () => Promise<{ data: T | null; error: DbError | null }>;
}
interface Phase1Client { from: <T>(table: string) => QueryChain<T> }
interface WalletRow { id: string; balance: number | string }
interface LedgerRow {
  id: string;
  direction: "credit" | "debit";
  type: "deposit" | "purchase" | "refund" | "adjustment";
  amount: number | string;
  reference: string;
  status: "pending" | "posted" | "failed" | "reversed";
  note: string | null;
  created_at: string;
  order_id: string | null;
  orders: { order_reference: string } | null;
}

const EMPTY = { balance: 0, transactions: [] as WalletTransaction[] };
const WalletContext = createContext<WalletValue | null>(null);

function phase1() {
  return (supabase as unknown as { schema: (schema: string) => Phase1Client }).schema("phase1");
}

function groupFromTs(ts: number): WalletTransaction["group"] {
  const day = (value: number) => new Date(new Date(value).getFullYear(), new Date(value).getMonth(), new Date(value).getDate()).getTime();
  const age = Math.round((day(Date.now()) - day(ts)) / 86_400_000);
  if (age <= 0) return "Today";
  if (age === 1) return "Yesterday";
  if (age < 7) return "This week";
  return "Earlier";
}

function transactionType(type: LedgerRow["type"]): WalletTransactionType {
  return type === "purchase" ? "data" : type === "deposit" || type === "refund" ? "deposit" : "payment";
}

function transactionTitle(type: LedgerRow["type"]) {
  if (type === "deposit") return "Wallet top-up";
  if (type === "purchase") return "Data purchase";
  if (type === "refund") return "Refund";
  return "Wallet adjustment";
}

function toTransaction(row: LedgerRow): WalletTransaction {
  const amount = Math.abs(Number(row.amount));
  const ts = new Date(row.created_at).getTime();
  return {
    id: row.id,
    type: transactionType(row.type),
    title: transactionTitle(row.type),
    subtitle: row.note ?? new Date(row.created_at).toLocaleString("en-GH"),
    amount: row.direction === "credit" ? amount : -amount,
    status: row.status === "posted" ? "success" : "pending",
    group: Number.isFinite(ts) ? groupFromTs(ts) : "Earlier",
    ts,
    ref: row.reference,
    orderId: row.order_id ?? undefined,
    orderReference: row.orders?.order_reference ?? undefined,
  };
}

export function txRef(transaction: WalletTransaction): string {
  return transaction.ref ?? transaction.id;
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, loading: authLoading } = useAuth();
  const [state, setState] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasWallet, setHasWallet] = useState(false);

  const refresh = async () => {
    if (!user) {
      setState(EMPTY);
      setHasWallet(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    const { data: wallet, error: walletError } = await phase1()
      .from<WalletRow>("wallets")
      .select("id, balance")
      .eq("user_id", user.id)
      .maybeSingle();

    if (walletError || !wallet) {
      setState(EMPTY);
      setHasWallet(false);
      setError(walletError ? "We couldn't load your wallet. Please try again." : "Your wallet is not ready yet.");
      setLoading(false);
      return;
    }

    setHasWallet(true);

    const { data: ledger, error: ledgerError } = await phase1()
      .from<LedgerRow[]>("wallet_ledger_entries")
      // orders is reachable through two FKs since the shared-payments migration
      // (ledger.order_id -> orders.id AND orders.wallet_ledger_entry_id ->
      // ledger.id); name the one we mean or PostgREST refuses with HTTP 300.
      .select("id, direction, type, amount, reference, status, note, created_at, order_id, orders!wallet_ledger_entries_order_id_fkey(order_reference)")
      .eq("wallet_id", wallet.id)
      .order("created_at", { ascending: false })
      .limit(100);

    setState({ balance: Number(wallet.balance), transactions: ledgerError ? [] : (ledger ?? []).map(toTransaction) });
    if (ledgerError) setError("Your balance loaded, but recent activity is temporarily unavailable.");
    setLoading(false);
  };

  useEffect(() => {
    if (authLoading) return;
    if (isAuthenticated) void refresh();
    else {
      setState(EMPTY);
      setHasWallet(false);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, user?.id]);

  return (
    <WalletContext.Provider value={{
      balance: state.balance,
      transactions: state.transactions,
      loading,
      isRealWallet: hasWallet,
      hasWallet,
      error,
      refresh,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) throw new Error("useWallet must be used within a WalletProvider");
  return value;
}
