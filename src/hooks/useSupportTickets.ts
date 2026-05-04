import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

export interface SupportTicket {
  id: string;
  ticket_type: 'user' | 'agent';
  created_by: string;
  agent_id: string | null;
  subject: string;
  category: string;
  status: string;
  related_order_id: string | null;
  customer_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_type: 'user' | 'agent' | 'admin';
  sender_id: string;
  sender_name?: string;
  message_text: string;
  attachment_url: string | null;
  created_at: string;
  read_by_user: boolean;
  read_by_agent: boolean;
  read_by_admin: boolean;
}

export const useSupportTickets = (ticketType: 'user' | 'agent') => {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchTickets = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('support_tickets_v2' as any)
      .select('*')
      .eq('ticket_type', ticketType)
      .eq('created_by', user.id)
      .order('updated_at', { ascending: false });

    if (!error && data) {
      setTickets(data as unknown as SupportTicket[]);
      const ticketIds = (data as any[]).map((t: any) => t.id);
      if (ticketIds.length > 0) {
        const readCol = ticketType === 'user' ? 'read_by_user' : 'read_by_agent';
        const { count } = await supabase
          .from('ticket_messages' as any)
          .select('*', { count: 'exact', head: true })
          .in('ticket_id', ticketIds)
          .eq('sender_type', 'admin')
          .eq(readCol, false);
        setUnreadCount(count || 0);
      } else {
        setUnreadCount(0);
      }
    }
    setLoading(false);
  }, [user, ticketType]);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`ticket-messages-${ticketType}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ticket_messages',
      }, (payload) => {
        const msg = payload.new as any;
        if (msg.sender_type === 'admin') {
          toast.info('New reply from Support', { description: 'Check your support tickets' });
          setUnreadCount(prev => prev + 1);
          setTickets(prev => prev.map(t =>
            t.id === msg.ticket_id ? { ...t, updated_at: msg.created_at } : t
          ).sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, ticketType]);

  const createTicket = async (data: {
    subject: string;
    category: string;
    message: string;
    related_order_id?: string;
    customer_phone?: string;
    agent_id?: string;
  }) => {
    if (!user) return null;
    const { data: ticket, error } = await supabase
      .from('support_tickets_v2' as any)
      .insert({
        ticket_type: ticketType,
        created_by: user.id,
        subject: data.subject,
        category: data.category,
        related_order_id: data.related_order_id || null,
        customer_phone: data.customer_phone || null,
        agent_id: data.agent_id || null,
      } as any)
      .select()
      .single();

    if (error) {
      toast.error('Failed to create ticket: ' + error.message);
      return null;
    }

    const t = ticket as any;
    await supabase.from('ticket_messages' as any).insert({
      ticket_id: t.id,
      sender_type: ticketType,
      sender_id: user.id,
      message_text: data.message,
      read_by_user: ticketType === 'user',
      read_by_agent: ticketType === 'agent',
      read_by_admin: false,
    } as any);

    toast.success('Ticket created!');
    await fetchTickets();
    return t as SupportTicket;
  };

  return { tickets, loading, unreadCount, createTicket, refresh: fetchTickets };
};

export const useTicketThread = (ticketId: string | null, senderRole: 'user' | 'agent' | 'admin') => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const lastSendRef = useRef(0);
  const messageIdsRef = useRef(new Set<string>());

  const fetchMessages = useCallback(async () => {
    if (!ticketId || !user) return;
    setLoading(true);

    const { data: ticketData } = await supabase
      .from('support_tickets_v2' as any)
      .select('*')
      .eq('id', ticketId)
      .single();

    if (ticketData) setTicket(ticketData as unknown as SupportTicket);

    const { data } = await supabase
      .from('ticket_messages' as any)
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (data) {
      const msgs = data as unknown as TicketMessage[];
      messageIdsRef.current = new Set(msgs.map(m => m.id));
      setMessages(msgs);
      // Mark as read
      const readCol = senderRole === 'user' ? 'read_by_user' : senderRole === 'agent' ? 'read_by_agent' : 'read_by_admin';
      const unread = (data as any[]).filter((m: any) => !m[readCol]).map((m: any) => m.id);
      if (unread.length > 0) {
        await supabase
          .from('ticket_messages' as any)
          .update({ [readCol]: true } as any)
          .in('id', unread);
      }
    }
    setLoading(false);
  }, [ticketId, user, senderRole]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);

  // Realtime deduplicated
  useEffect(() => {
    if (!ticketId) return;
    const channel = supabase
      .channel(`thread-${ticketId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ticket_messages',
        filter: `ticket_id=eq.${ticketId}`,
      }, (payload) => {
        const newMsg = payload.new as unknown as TicketMessage;
        // Dedupe: skip if already in state
        if (messageIdsRef.current.has(newMsg.id)) return;
        messageIdsRef.current.add(newMsg.id);
        setMessages(prev => {
          // Extra safety: filter out any existing with same id
          const filtered = prev.filter(m => m.id !== newMsg.id);
          return [...filtered, newMsg];
        });
        // Mark as read immediately
        const readCol = senderRole === 'user' ? 'read_by_user' : senderRole === 'agent' ? 'read_by_agent' : 'read_by_admin';
        supabase.from('ticket_messages' as any).update({ [readCol]: true } as any).eq('id', newMsg.id).then(() => {});
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [ticketId, senderRole]);

  const sendMessage = async (messageText: string) => {
    if (!ticketId || !user || !messageText.trim() || sending) return;

    // Debounce: ignore if sent within 500ms
    const now = Date.now();
    if (now - lastSendRef.current < 500) return;
    lastSendRef.current = now;

    setSending(true);

    const optimisticId = crypto.randomUUID();
    const readFields = {
      read_by_user: senderRole === 'user',
      read_by_agent: senderRole === 'agent',
      read_by_admin: senderRole === 'admin',
    };

    // Add to dedupe set immediately
    messageIdsRef.current.add(optimisticId);

    const optimistic: TicketMessage = {
      id: optimisticId,
      ticket_id: ticketId,
      sender_type: senderRole,
      sender_id: user.id,
      message_text: messageText,
      attachment_url: null,
      created_at: new Date().toISOString(),
      ...readFields,
    };
    setMessages(prev => [...prev, optimistic]);

    const { data: inserted, error } = await supabase
      .from('ticket_messages' as any)
      .insert({
        ticket_id: ticketId,
        sender_type: senderRole,
        sender_id: user.id,
        message_text: messageText,
        ...readFields,
      } as any)
      .select()
      .single();

    if (error) {
      toast.error('Failed to send message');
      messageIdsRef.current.delete(optimisticId);
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
    } else if (inserted) {
      // Replace optimistic with real message
      const real = inserted as unknown as TicketMessage;
      messageIdsRef.current.add(real.id);
      setMessages(prev => prev.map(m => m.id === optimisticId ? real : m).filter((m, i, arr) =>
        arr.findIndex(x => x.id === m.id) === i
      ));
    }

    setSending(false);
  };

  const updateStatus = async (newStatus: string) => {
    if (!ticketId) return;
    await supabase.from('support_tickets_v2' as any).update({ status: newStatus } as any).eq('id', ticketId);
    setTicket(prev => prev ? { ...prev, status: newStatus } : null);
    toast.success(`Status updated to ${newStatus}`);
  };

  return { ticket, messages, loading, sending, sendMessage, updateStatus, refresh: fetchMessages };
};
