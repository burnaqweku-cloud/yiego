import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export interface Agent {
  id: string;
  user_id: string;
  application_id: string | null;
  store_name: string;
  store_slug: string;
  store_description: string;
  store_logo_url: string | null;
  whatsapp_number: string;
  store_email: string;
  region: string;
  status: string;
  activation_paid: boolean;
  activation_paid_at: string | null;
  activation_reference: string | null;
  created_at: string;
  updated_at: string;
}

export interface AgentWallet {
  id: string;
  agent_id: string;
  available_balance: number;
  pending_balance: number;
  total_earned: number;
  total_withdrawn: number;
  updated_at: string;
}

export interface AgentApplication {
  id: string;
  user_id: string;
  store_name: string;
  status: string;
  created_at: string;
  admin_notes: string | null;
}

export const useAgent = () => {
  const { user } = useAuth();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [wallet, setWallet] = useState<AgentWallet | null>(null);
  const [application, setApplication] = useState<AgentApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const lastFetchRef = useRef(0);

  const fetchAgentData = useCallback(async () => {
    if (!user) {
      setAgent(null);
      setWallet(null);
      setApplication(null);
      setLoading(false);
      return;
    }
    lastFetchRef.current = Date.now();
    try {
      const [agentRes, appRes] = await Promise.all([
        supabase.from('agents' as any).select('*').eq('user_id', user.id).neq('status', 'deleted').maybeSingle(),
        supabase.from('agent_applications' as any).select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      ]);
      const agentData = (agentRes.data as unknown) as Agent | null;
      setAgent(agentData);
      setApplication((appRes.data as unknown) as AgentApplication | null);

      if (agentData) {
        const { data: walletData } = await supabase
          .from('agent_wallets' as any)
          .select('*')
          .eq('agent_id', agentData.id)
          .maybeSingle();
        setWallet((walletData as unknown) as AgentWallet | null);
      }
    } catch (err) {
      console.error('Error fetching agent data:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchAgentData(); }, [fetchAgentData]);

  // ── Realtime: agent record + agent wallet ──
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`user-agent-${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'agents', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            setAgent(null);
            setWallet(null);
            return;
          }
          setAgent(payload.new as Agent);
        }
      )
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'agent_applications', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.eventType !== 'DELETE') {
            setApplication(payload.new as AgentApplication);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Subscribe to agent wallet changes (depends on agent.id which can change)
  useEffect(() => {
    if (!agent?.id) return;
    const channel = supabase
      .channel(`agent-wallet-${agent.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'agent_wallets', filter: `agent_id=eq.${agent.id}` },
        (payload) => {
          if (payload.eventType !== 'DELETE') {
            setWallet(payload.new as AgentWallet);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [agent?.id]);

  // ── Focus revalidation ──
  useEffect(() => {
    if (!user) return;
    const onFocus = () => {
      if (Date.now() - lastFetchRef.current > 30_000) fetchAgentData();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [user, fetchAgentData]);

  const isPending = agent?.status === 'pending_review';
  const isAwaitingPayment = agent?.status === 'approved';
  const isActive = agent?.status === 'active';
  const isSuspended = agent?.status === 'suspended';
  const isRejected = agent?.status === 'rejected';

  return {
    agent,
    wallet,
    application,
    loading,
    isAgent: !!agent,
    isActiveAgent: isActive,
    isPending,
    isAwaitingPayment,
    isSuspended,
    isRejected,
    needsActivation: isAwaitingPayment && !agent?.activation_paid,
    refresh: fetchAgentData,
  };
};
