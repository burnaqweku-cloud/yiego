import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export interface Wallet {
  id: string;
  user_id: string;
  balance_ghs: number;
  updated_at: string;
}

export interface WalletTransaction {
  id: string;
  user_id: string;
  type: 'deposit' | 'debit' | 'refund';
  amount_ghs: number;
  status: 'pending' | 'confirmed' | 'rejected';
  reference: string | null;
  description: string | null;
  created_at: string;
}

export function useWallet() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [txnsFetched, setTxnsFetched] = useState(false);
  const txnsFetchedRef = useRef(false);
  const lastWalletFetchRef = useRef(0);

  // Fetch only the wallet balance initially (fast)
  const refreshWallet = useCallback(async () => {
    if (!user) { setLoading(false); return; }
    lastWalletFetchRef.current = Date.now();

    let { data: w } = await supabase
      .from('wallets')
      .select('id, user_id, balance_ghs, updated_at')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!w) {
      const { data: created } = await supabase
        .from('wallets')
        .insert({ user_id: user.id, balance_ghs: 0 })
        .select()
        .single();
      w = created;
    }

    if (w) setWallet(w as Wallet);
    setLoading(false);
  }, [user]);

  // Fetch transactions separately (only when needed)
  const refreshTransactions = useCallback(async () => {
    if (!user) return;

    const { data: txns } = await supabase
      .from('wallet_transactions')
      .select('id, user_id, type, amount_ghs, status, reference, description, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (txns) setTransactions(txns as WalletTransaction[]);
    txnsFetchedRef.current = true;
    setTxnsFetched(true);
  }, [user]);

  // Combined refresh for backward compat
  const refresh = useCallback(async () => {
    await refreshWallet();
    if (txnsFetchedRef.current) {
      await refreshTransactions();
    }
  }, [refreshWallet, refreshTransactions]);

  useEffect(() => { refreshWallet(); }, [refreshWallet]);

  // ── Realtime: wallet balance + transactions ──
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`user-wallet-${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'wallets', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'DELETE') return;
          setWallet(payload.new as Wallet);
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_transactions', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (!txnsFetchedRef.current) return; // skip until user opens wallet
          if (payload.eventType === 'INSERT') {
            const row = payload.new as WalletTransaction;
            setTransactions(prev => prev.some(t => t.id === row.id) ? prev : [row, ...prev]);
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as WalletTransaction;
            setTransactions(prev => prev.map(t => t.id === row.id ? { ...t, ...row } : t));
          } else if (payload.eventType === 'DELETE') {
            const row = payload.old as { id: string };
            setTransactions(prev => prev.filter(t => t.id !== row.id));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // ── Focus revalidation (lightweight wallet only) ──
  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      if (Date.now() - lastWalletFetchRef.current > 15_000) refreshWallet();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [user, refreshWallet]);

  const requestDeposit = useCallback(async (amount: number): Promise<string | null> => {
    if (!user) return null;
    const reference = `DEP-${Date.now().toString(36).toUpperCase()}`;

    const { error } = await supabase
      .from('wallet_transactions')
      .insert({
        user_id: user.id,
        type: 'deposit',
        amount_ghs: amount,
        status: 'pending',
        reference,
        description: `Wallet deposit of GHS ${amount.toFixed(2)}`,
      });

    if (error) { console.error('Deposit request error:', error); return null; }
    await refresh();
    return reference;
  }, [user, refresh]);

  return { wallet, transactions, loading, refresh, requestDeposit, refreshTransactions };
}
