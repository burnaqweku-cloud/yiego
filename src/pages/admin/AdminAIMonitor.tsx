import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import {
  Bot, MessageCircle, AlertTriangle, CheckCircle, Clock, Search, Filter, RefreshCw,
  Eye, ExternalLink, Flag, ThumbsUp, ThumbsDown, X, ChevronRight, ArrowLeft,
  BarChart3, Users, Ticket, XCircle, HelpCircle, TrendingUp, Download, Send, LogIn, LogOut, Shield
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

// Types
interface AIConversation {
  id: string;
  session_id: string;
  user_type: string;
  guest_name: string | null;
  user_email: string | null;
  username: string | null;
  source_page: string | null;
  status: string;
  outcome: string | null;
  ticket_id: string | null;
  ticket_code: string | null;
  user_message_count: number;
  ai_message_count: number;
  has_evidence: boolean;
  escalation_attempted: boolean;
  escalation_blocked: boolean;
  manager_review: boolean;
  quality_rating: string | null;
  admin_notes: string | null;
  flags: string[];
  last_user_message_preview: string | null;
  last_ai_message_preview: string | null;
  ip_address: string | null;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
}

interface AIMessage {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  image_url: string | null;
  event_type: string | null;
  admin_name: string | null;
  created_at: string;
}

const OUTCOME_OPTIONS = [
  { value: 'resolved_by_ai', label: 'Resolved by AI', color: 'bg-emerald-500/10 text-emerald-600' },
  { value: 'escalated_to_ticket', label: 'Escalated to Ticket', color: 'bg-blue-500/10 text-blue-600' },
  { value: 'more_info_requested', label: 'More Info Requested', color: 'bg-amber-500/10 text-amber-600' },
  { value: 'manager_review', label: 'Manager Review', color: 'bg-purple-500/10 text-purple-600' },
  { value: 'abandoned', label: 'Abandoned', color: 'bg-muted text-muted-foreground' },
  { value: 'unresolved', label: 'Unresolved', color: 'bg-destructive/10 text-destructive' },
  { value: 'escalation_blocked', label: 'Escalation Blocked', color: 'bg-orange-500/10 text-orange-600' },
  { value: 'duplicate_continued', label: 'Duplicate Continued', color: 'bg-muted text-muted-foreground' },
];

const QUALITY_OPTIONS = [
  { value: 'correct', label: '✅ AI Correct', color: 'text-emerald-600' },
  { value: 'wrong', label: '❌ AI Wrong', color: 'text-destructive' },
  { value: 'needs_improvement', label: '⚠️ Needs Improvement', color: 'text-amber-600' },
  { value: 'flag_prompt_update', label: '🔧 Flag for Prompt Update', color: 'text-blue-600' },
];

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-500/10 text-emerald-600' },
  waiting_user: { label: 'Waiting on User', className: 'bg-amber-500/10 text-amber-600' },
  waiting_admin: { label: 'Waiting on Admin', className: 'bg-blue-500/10 text-blue-600' },
  resolved: { label: 'Resolved', className: 'bg-muted text-muted-foreground' },
  abandoned: { label: 'Abandoned', className: 'bg-destructive/10 text-destructive' },
  flagged: { label: 'Needs Review', className: 'bg-orange-500/10 text-orange-600' },
};

const AdminAIMonitor = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [conversations, setConversations] = useState<AIConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterOutcome, setFilterOutcome] = useState<string>('all');
  const [filterUserType, setFilterUserType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterFlags, setFilterFlags] = useState<string>('all');
  const [selectedConv, setSelectedConv] = useState<AIConversation | null>(null);
  const [convMessages, setConvMessages] = useState<AIMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [saving, setSaving] = useState(false);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await (supabase.from('ai_conversations') as any)
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(200);
      if (!error && data) setConversations(data);
    } catch (err) {
      console.error('Failed to fetch AI conversations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  /* ── Realtime: keep the conversation list + counters live so totals never get stuck ── */
  useEffect(() => {
    const channel = supabase
      .channel('admin-ai-conv-list')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'ai_conversations',
      }, (payload: any) => {
        if (payload.eventType === 'INSERT') {
          setConversations(prev => {
            // Dedupe — same row may arrive twice from realtime.
            if (prev.some(c => c.id === payload.new.id)) return prev;
            return [payload.new as AIConversation, ...prev];
          });
        } else if (payload.eventType === 'UPDATE') {
          setConversations(prev => prev.map(c => c.id === payload.new.id ? { ...c, ...payload.new } : c));
        } else if (payload.eventType === 'DELETE') {
          setConversations(prev => prev.filter(c => c.id !== payload.old.id));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  // Auto-open conversation from URL param (ticket → conversation link)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const convId = params.get('conv');
    if (convId && conversations.length > 0 && !selectedConv) {
      const found = conversations.find(c => c.id === convId);
      if (found) {
        openConversation(found);
      } else {
        // Conversation not in list — fetch directly
        (async () => {
          const { data } = await (supabase.from('ai_conversations') as any).select('*').eq('id', convId).maybeSingle();
          if (data) openConversation(data as AIConversation);
        })();
      }
    }
  }, [conversations]);

  const [adminChatInput, setAdminChatInput] = useState('');
  const [sendingAdminMsg, setSendingAdminMsg] = useState(false);
  const [userTyping, setUserTyping] = useState(false);
  const transcriptRef = useRef<HTMLDivElement>(null);
  const typingChannelRef = useRef<any>(null);
  const userSessionChannelRef = useRef<any>(null);
  const userSessionReadyRef = useRef<boolean>(false);
  const adminTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userTypingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAdminTypingSentRef = useRef<number>(0);

  // Reliably broadcast to the customer's session channel.
  // Supabase requires the channel to be SUBSCRIBED before .send() will deliver.
  // We poll briefly (up to ~1.5s) for readiness, then send. Safe and non-blocking.
  const broadcastToCustomer = useCallback(async (event: string, payload: Record<string, unknown>) => {
    const channel = userSessionChannelRef.current;
    if (!channel) {
      console.warn('[admin-broadcast] No session channel available');
      return;
    }
    try {
      // Wait for SUBSCRIBED state (max 1500ms)
      if (!userSessionReadyRef.current) {
        const start = Date.now();
        while (!userSessionReadyRef.current && Date.now() - start < 1500) {
          await new Promise((r) => setTimeout(r, 50));
        }
      }
      await channel.send({ type: 'broadcast', event, payload });
    } catch (err) {
      console.error('Failed to broadcast customer sync event:', err);
    }
  }, []);

  /* ── Auto-scroll transcript to bottom on new message / open ── */
  useEffect(() => {
    if (!transcriptRef.current) return;
    const el = transcriptRef.current;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [convMessages, selectedConv?.id, userTyping]);

  // Fetch conversation messages
  const openConversation = useCallback(async (conv: AIConversation) => {
    setSelectedConv(conv);
    setAdminNote(conv.admin_notes || '');
    setAdminChatInput('');
    setMessagesLoading(true);
    try {
      const { data } = await (supabase.from('ai_conversation_messages') as any)
        .select('*')
        .eq('conversation_id', conv.id)
        .order('created_at', { ascending: true });
      setConvMessages(data || []);
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setMessagesLoading(false);
    }
  }, []);

  // Realtime subscription for messages + typing broadcast when viewing a conversation
  useEffect(() => {
    if (!selectedConv) return;
    const dbChannel = supabase
      .channel(`admin-conv-${selectedConv.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'ai_conversation_messages',
        filter: `conversation_id=eq.${selectedConv.id}`,
      }, (payload: any) => {
        setConvMessages(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new as AIMessage];
        });
        // Clear user typing on real user message arrival
        if (payload.new.role === 'user') setUserTyping(false);
      })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'ai_conversations',
        filter: `id=eq.${selectedConv.id}`,
      }, (payload: any) => {
        setSelectedConv(prev => prev ? { ...prev, ...payload.new } : prev);
        setConversations(prev => prev.map(conv => conv.id === payload.new.id ? { ...conv, ...payload.new } : conv));
      })
      .subscribe();

    // Typing broadcast channel — listen to user_typing, broadcast admin_typing
    const typingChannel = supabase
      .channel(`typing-${selectedConv.id}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'user_typing' }, (payload: any) => {
        if (payload.payload?.typing) {
          setUserTyping(true);
          if (userTypingTimeoutRef.current) clearTimeout(userTypingTimeoutRef.current);
          userTypingTimeoutRef.current = setTimeout(() => setUserTyping(false), 4000);
        } else {
          setUserTyping(false);
        }
      })
      .subscribe();
    typingChannelRef.current = typingChannel;

    const userSessionChannel = supabase
      .channel(`support-session-${selectedConv.session_id}`, { config: { broadcast: { self: false } } })
      .subscribe((status) => {
        userSessionReadyRef.current = status === 'SUBSCRIBED';
      });
    userSessionChannelRef.current = userSessionChannel;

    return () => {
      supabase.removeChannel(dbChannel);
      supabase.removeChannel(typingChannel);
      supabase.removeChannel(userSessionChannel);
      typingChannelRef.current = null;
      userSessionChannelRef.current = null;
      userSessionReadyRef.current = false;
      if (userTypingTimeoutRef.current) clearTimeout(userTypingTimeoutRef.current);
      if (adminTypingTimeoutRef.current) clearTimeout(adminTypingTimeoutRef.current);
      setUserTyping(false);
    };
  }, [selectedConv?.id]);

  /* ── Broadcast admin typing (throttled) ── */
  const broadcastAdminTyping = useCallback(() => {
    if (!typingChannelRef.current) return;
    const now = Date.now();
    if (now - lastAdminTypingSentRef.current < 1000) return;
    lastAdminTypingSentRef.current = now;
    typingChannelRef.current.send({
      type: 'broadcast',
      event: 'admin_typing',
      payload: { typing: true, ts: now },
    });
    if (adminTypingTimeoutRef.current) clearTimeout(adminTypingTimeoutRef.current);
    adminTypingTimeoutRef.current = setTimeout(() => {
      try {
        typingChannelRef.current?.send({
          type: 'broadcast',
          event: 'admin_typing',
          payload: { typing: false },
        });
      } catch {}
    }, 3500);
  }, []);

  // Admin takeover: join conversation
  const handleJoinConversation = useCallback(async () => {
    if (!selectedConv || !user) return;
    const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
    const adminName = (profile as any)?.full_name || user.email || 'Admin';
    
    const { data: updatedConversation } = await (supabase.from('ai_conversations') as any).update({
      handled_by: 'admin',
      admin_handler_id: user.id,
      admin_handler_name: adminName,
      admin_joined_at: new Date().toISOString(),
      admin_left_at: null,
    }).eq('id', selectedConv.id).select('*').single();

    // Insert system event
    const { data: joinMessage } = await (supabase.from('ai_conversation_messages') as any).insert({
      conversation_id: selectedConv.id,
      role: 'system',
      content: `${adminName} joined the conversation`,
      event_type: 'admin_joined',
      admin_name: adminName,
    }).select('*').single();

    if (joinMessage) {
      setConvMessages(prev => prev.some(msg => msg.id === joinMessage.id) ? prev : [...prev, joinMessage as AIMessage]);
    }

    setSelectedConv(prev => prev ? { ...prev, ...(updatedConversation || {}), handled_by: 'admin' as any, admin_handler_name: adminName } as any : prev);
    setConversations(prev => prev.map(conv => conv.id === selectedConv.id ? { ...conv, ...(updatedConversation || {}), handled_by: 'admin' as any, admin_handler_name: adminName } as any : conv));
    await broadcastToCustomer('admin_joined', {
      conversationId: selectedConv.id,
      adminName,
      handledBy: 'admin',
      message: joinMessage,
    });
    toast.success('You are now handling this conversation');
  }, [broadcastToCustomer, selectedConv, user]);

  // Admin leave conversation
  const handleLeaveConversation = useCallback(async () => {
    if (!selectedConv) return;
    const adminName = (selectedConv as any).admin_handler_name || 'Admin';
    
    const { data: updatedConversation } = await (supabase.from('ai_conversations') as any).update({
      handled_by: 'ai',
      admin_left_at: new Date().toISOString(),
    }).eq('id', selectedConv.id).select('*').single();

    const { data: leaveMessage } = await (supabase.from('ai_conversation_messages') as any).insert({
      conversation_id: selectedConv.id,
      role: 'system',
      content: `${adminName} left the conversation. AI support resumed.`,
      event_type: 'admin_left',
      admin_name: adminName,
    }).select('*').single();

    if (leaveMessage) {
      setConvMessages(prev => prev.some(msg => msg.id === leaveMessage.id) ? prev : [...prev, leaveMessage as AIMessage]);
    }

    setSelectedConv(prev => prev ? { ...prev, ...(updatedConversation || {}), handled_by: 'ai' as any } as any : prev);
    setConversations(prev => prev.map(conv => conv.id === selectedConv.id ? { ...conv, ...(updatedConversation || {}), handled_by: 'ai' as any } as any : conv));
    await broadcastToCustomer('admin_left', {
      conversationId: selectedConv.id,
      adminName,
      handledBy: 'ai',
      message: leaveMessage,
    });
    toast.success('AI support resumed for this conversation');
  }, [broadcastToCustomer, selectedConv]);

  // Send admin message
  const handleSendAdminMessage = useCallback(async () => {
    const text = adminChatInput.trim();
    if (!text || !selectedConv || !user) return;
    setSendingAdminMsg(true);
    try {
      const { data: profile } = await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
      const adminName = (profile as any)?.full_name || user.email || 'Admin';
      
      const { data: insertedMessage, error: insertError } = await (supabase.from('ai_conversation_messages') as any).insert({
        conversation_id: selectedConv.id,
        role: 'admin',
        content: text,
        admin_name: adminName,
      }).select('*').single();
      
      if (insertError) {
        console.error('Admin message insert error:', insertError);
        toast.error(`Failed to send: ${insertError.message}`);
        return;
      }

      if (insertedMessage) {
        setConvMessages(prev => prev.some(msg => msg.id === insertedMessage.id) ? prev : [...prev, insertedMessage as AIMessage]);
      }
      
      // Also update conversation's updated_at to keep it fresh
      await (supabase.from('ai_conversations') as any).update({
        updated_at: new Date().toISOString(),
      }).eq('id', selectedConv.id);

      try {
        typingChannelRef.current?.send({
          type: 'broadcast',
          event: 'admin_typing',
          payload: { typing: false },
        });
      } catch {}

      await broadcastToCustomer('admin_message', {
        conversationId: selectedConv.id,
        adminName,
        handledBy: 'admin',
        message: insertedMessage,
      });
      
      setAdminChatInput('');
      // No toast on success — message appears instantly in thread via realtime (native chat UX).
    } catch (err) {
      console.error('Failed to send admin message:', err);
      toast.error('Failed to send message');
    } finally {
      setSendingAdminMsg(false);
    }
  }, [adminChatInput, broadcastToCustomer, selectedConv, user]);

  // Update conversation
  const updateConversation = useCallback(async (id: string, updates: Record<string, any>) => {
    setSaving(true);
    try {
      await (supabase.from('ai_conversations') as any).update(updates).eq('id', id);
      setConversations(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
      if (selectedConv?.id === id) setSelectedConv(prev => prev ? { ...prev, ...updates } : prev);
    } catch (err) {
      console.error('Update failed:', err);
    } finally {
      setSaving(false);
    }
  }, [selectedConv]);

  // Summary stats
  const stats = useMemo(() => {
    const total = conversations.length;
    const today = conversations.filter(c => new Date(c.created_at).toDateString() === new Date().toDateString());
    const withTicket = conversations.filter(c => c.ticket_id);
    const resolved = conversations.filter(c => c.outcome === 'resolved_by_ai');
    const abandoned = conversations.filter(c => c.outcome === 'abandoned' || (!c.outcome && c.user_message_count <= 1 && Date.now() - new Date(c.updated_at).getTime() > 30 * 60 * 1000));
    const flagged = conversations.filter(c => c.flags?.length > 0);
    const blocked = conversations.filter(c => c.escalation_blocked);
    const guests = conversations.filter(c => c.user_type === 'guest');
    const users = conversations.filter(c => c.user_type === 'user');
    const agents = conversations.filter(c => c.user_type === 'agent');
    const missedEscalation = conversations.filter(c =>
      !c.ticket_id && !c.outcome &&
      c.user_message_count >= 4 &&
      Date.now() - new Date(c.updated_at).getTime() > 60 * 60 * 1000
    );
    return { total, today: today.length, withTicket: withTicket.length, resolved: resolved.length, abandoned: abandoned.length, flagged: flagged.length, blocked: blocked.length, guests: guests.length, users: users.length, agents: agents.length, missedEscalation: missedEscalation.length };
  }, [conversations]);

  // Filtered conversations
  const filtered = useMemo(() => {
    let list = [...conversations];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(c =>
        c.session_id?.toLowerCase().includes(s) ||
        c.guest_name?.toLowerCase().includes(s) ||
        c.username?.toLowerCase().includes(s) ||
        c.user_email?.toLowerCase().includes(s) ||
        c.ticket_code?.toLowerCase().includes(s) ||
        c.last_user_message_preview?.toLowerCase().includes(s)
      );
    }
    if (filterOutcome !== 'all') list = list.filter(c => c.outcome === filterOutcome);
    if (filterUserType !== 'all') list = list.filter(c => c.user_type === filterUserType);
    if (filterStatus !== 'all') list = list.filter(c => c.status === filterStatus);
    if (filterFlags === 'flagged') list = list.filter(c => c.flags?.length > 0);
    if (filterFlags === 'no_ticket_long') list = list.filter(c => !c.ticket_id && c.user_message_count >= 4 && Date.now() - new Date(c.updated_at).getTime() > 60 * 60 * 1000);
    if (filterFlags === 'has_evidence') list = list.filter(c => c.has_evidence);
    if (filterFlags === 'escalation_blocked') list = list.filter(c => c.escalation_blocked);
    return list;
  }, [conversations, search, filterOutcome, filterUserType, filterStatus, filterFlags]);

  // CSV export
  const exportCSV = () => {
    const headers = ['Session', 'User Type', 'Name/Username', 'Email', 'Messages', 'Outcome', 'Ticket', 'Status', 'Created', 'Updated'];
    const rows = filtered.map(c => [
      c.session_id, c.user_type, c.guest_name || c.username || '', c.user_email || '',
      `${c.user_message_count}/${c.ai_message_count}`, c.outcome || '', c.ticket_code || '',
      c.status, c.created_at, c.updated_at
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `ai-conversations-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const getOutcomeBadge = (outcome: string | null) => {
    if (!outcome) return <Badge variant="outline" className="text-[10px]">—</Badge>;
    const opt = OUTCOME_OPTIONS.find(o => o.value === outcome);
    return <Badge className={`${opt?.color || 'bg-muted text-muted-foreground'} text-[10px] border-0`}>{opt?.label || outcome}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const s = STATUS_LABELS[status];
    return <Badge className={`${s?.className || 'bg-muted text-muted-foreground'} text-[10px] border-0`}>{s?.label || status}</Badge>;
  };

  const getUserLabel = (c: AIConversation) => {
    if (c.username) return c.username;
    if (c.guest_name) return c.guest_name;
    if (c.user_email) return c.user_email.split('@')[0];
    return 'Anonymous';
  };

  // ── REPLAY VIEW ──
  if (selectedConv) {
    return (
      <AdminLayout>
        <div className="p-3 md:p-6 space-y-3 md:space-y-4 w-full max-w-none xl:max-w-5xl xl:mx-auto">
          {/* Header */}
          <div className="sticky top-0 z-10 -mx-3 px-3 py-1 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:static md:mx-0 md:px-0 md:py-0 md:bg-transparent flex items-center gap-3 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => setSelectedConv(null)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Back
            </Button>
            <h1 className="text-lg font-bold">Conversation Replay</h1>
            {getStatusBadge(selectedConv.status)}
            {getOutcomeBadge(selectedConv.outcome)}
            <Badge className={`text-[10px] border-0 ${(selectedConv as any).handled_by === 'admin' ? 'bg-orange-500/10 text-orange-600' : 'bg-emerald-500/10 text-emerald-600'}`}>
              {(selectedConv as any).handled_by === 'admin' ? <><Shield className="w-3 h-3 mr-1" /> Admin Handling</> : <><Bot className="w-3 h-3 mr-1" /> AI Handling</>}
            </Badge>
          </div>

          {/* Takeover controls */}
          <Card>
            <CardContent className="pt-4 pb-3 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              {(selectedConv as any).handled_by !== 'admin' ? (
                <Button size="sm" className="text-xs" onClick={handleJoinConversation}>
                  <LogIn className="w-3.5 h-3.5 mr-1" /> Join Conversation
                </Button>
              ) : (
                <Button size="sm" variant="outline" className="text-xs" onClick={handleLeaveConversation}>
                  <LogOut className="w-3.5 h-3.5 mr-1" /> Leave Conversation
                </Button>
              )}
              {(selectedConv as any).admin_handler_name && (selectedConv as any).handled_by === 'admin' && (
                <span className="text-xs text-muted-foreground">Handled by: <strong>{(selectedConv as any).admin_handler_name}</strong></span>
              )}
            </CardContent>
          </Card>

          {/* Meta */}
          <Card>
            <CardContent className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div><span className="text-muted-foreground block">User</span><span className="font-medium">{getUserLabel(selectedConv)}</span></div>
              <div><span className="text-muted-foreground block">Type</span><Badge variant="outline" className="text-[10px]">{selectedConv.user_type}</Badge></div>
              <div><span className="text-muted-foreground block">Messages</span><span>{selectedConv.user_message_count} user / {selectedConv.ai_message_count} AI</span></div>
              <div><span className="text-muted-foreground block">Page</span><span className="truncate block">{selectedConv.source_page || '—'}</span></div>
              <div><span className="text-muted-foreground block">Started</span><span>{format(new Date(selectedConv.created_at), 'dd MMM yyyy HH:mm')}</span></div>
              <div><span className="text-muted-foreground block">Last Activity</span><span>{formatDistanceToNow(new Date(selectedConv.updated_at), { addSuffix: true })}</span></div>
              <div><span className="text-muted-foreground block">Evidence</span><span>{selectedConv.has_evidence ? '📎 Yes' : 'No'}</span></div>
              <div><span className="text-muted-foreground block">Ticket</span>{selectedConv.ticket_code ? <Button variant="link" size="sm" className="p-0 h-auto text-xs" onClick={() => navigate(`/admin/ai-cases/${selectedConv.ticket_id}`)}>{selectedConv.ticket_code} <ExternalLink className="w-3 h-3 ml-1" /></Button> : <span>—</span>}</div>
              {selectedConv.flags?.length > 0 && (
                <div className="col-span-2"><span className="text-muted-foreground block">Flags</span>{selectedConv.flags.map(f => <Badge key={f} variant="destructive" className="text-[10px] mr-1">{f}</Badge>)}</div>
              )}
            </CardContent>
          </Card>

          {/* Chat transcript — bigger, more readable */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Chat Transcript</CardTitle></CardHeader>
            <CardContent>
              {messagesLoading ? (
                <div className="text-center py-8 text-muted-foreground text-sm">Loading messages...</div>
              ) : (
                <div ref={transcriptRef} className="space-y-3 h-[56dvh] min-h-[380px] md:h-[68vh] md:min-h-[480px] overflow-y-auto pr-1">
                  {convMessages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : msg.role === 'system' ? 'justify-center' : 'justify-start'}`}>
                      {msg.role === 'system' ? (
                        <div className={`rounded-xl px-4 py-2 text-xs max-w-[90%] flex items-center gap-2 ${
                          msg.event_type === 'admin_joined' ? 'bg-orange-500/10 text-orange-700 border border-orange-500/20' :
                          msg.event_type === 'admin_left' ? 'bg-blue-500/10 text-blue-700 border border-blue-500/20' :
                          'bg-muted/50 text-muted-foreground italic'
                        }`}>
                          {msg.event_type === 'admin_joined' && <LogIn className="w-3 h-3 shrink-0" />}
                          {msg.event_type === 'admin_left' && <LogOut className="w-3 h-3 shrink-0" />}
                          <span className="font-medium">{msg.content}</span>
                          <span className="text-[9px] opacity-60 ml-1">{format(new Date(msg.created_at), 'HH:mm')}</span>
                        </div>
                      ) : msg.role === 'admin' ? (
                        <div className="rounded-2xl px-4 py-2.5 max-w-[80%] text-sm bg-gradient-to-br from-orange-500/8 to-orange-500/4 border border-orange-500/20 shadow-sm">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Shield className="w-3 h-3 text-orange-600 dark:text-orange-400" />
                            <span className="text-[11px] font-semibold text-orange-700 dark:text-orange-400">{msg.admin_name || 'Admin'}</span>
                            <span className="text-[8.5px] bg-orange-500/15 text-orange-700 dark:text-orange-400 px-1.5 py-px rounded-md font-bold uppercase tracking-wide leading-none">Admin</span>
                          </div>
                          <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                          <div className="text-[10px] mt-1 text-muted-foreground">{format(new Date(msg.created_at), 'HH:mm')}</div>
                        </div>
                      ) : (
                        <div className={`rounded-2xl px-4 py-2.5 max-w-[80%] text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                          {msg.image_url && msg.image_url !== 'evidence_attached' && (
                            <img src={msg.image_url} alt="Evidence" className="rounded-lg max-w-[200px] mb-2" />
                          )}
                          {msg.image_url === 'evidence_attached' && <Badge variant="outline" className="text-[10px] mb-1">📎 Image attached</Badge>}
                          <div className="whitespace-pre-wrap break-words">{msg.content}</div>
                          <div className={`text-[10px] mt-1 ${msg.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                            {format(new Date(msg.created_at), 'HH:mm')}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* User typing indicator (real-time broadcast) */}
                  {userTyping && (
                    <div className="flex justify-start animate-in fade-in-0 duration-200">
                      <div className="rounded-2xl rounded-bl-md px-4 py-3 bg-muted border border-border/40">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          <span className="text-[10px] text-muted-foreground ml-1">user typing…</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Admin chat input — only when takeover is active */}
              {(selectedConv as any).handled_by === 'admin' && (
                <div className="mt-4 pt-3 border-t flex gap-2 sticky bottom-0 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 pb-1">
                  <Input
                    value={adminChatInput}
                    onChange={e => { setAdminChatInput(e.target.value); if (e.target.value.length > 0) broadcastAdminTyping(); }}
                    placeholder="Type a message as admin..."
                    className="flex-1 text-sm"
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendAdminMessage(); } }}
                    disabled={sendingAdminMsg}
                  />
                  <Button size="sm" onClick={handleSendAdminMessage} disabled={sendingAdminMsg || !adminChatInput.trim()}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Admin tools */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Admin Quality Controls</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {/* Outcome */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Set Outcome</label>
                <div className="flex flex-wrap gap-1.5">
                  {OUTCOME_OPTIONS.map(opt => (
                    <Button
                      key={opt.value}
                      variant={selectedConv.outcome === opt.value ? 'default' : 'outline'}
                      size="sm"
                      className="text-[11px] h-7"
                      onClick={() => updateConversation(selectedConv.id, { outcome: opt.value })}
                      disabled={saving}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Quality rating */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Quality Rating</label>
                <div className="flex flex-wrap gap-1.5">
                  {QUALITY_OPTIONS.map(opt => (
                    <Button
                      key={opt.value}
                      variant={selectedConv.quality_rating === opt.value ? 'default' : 'outline'}
                      size="sm"
                      className={`text-[11px] h-7 ${selectedConv.quality_rating !== opt.value ? opt.color : ''}`}
                      onClick={() => updateConversation(selectedConv.id, { quality_rating: opt.value })}
                      disabled={saving}
                    >
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>

              {/* Admin notes */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Internal Notes</label>
                <Textarea
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  placeholder="Add internal notes about this conversation..."
                  className="text-sm min-h-[60px]"
                />
                <Button
                  size="sm"
                  className="mt-2 text-xs"
                  onClick={() => updateConversation(selectedConv.id, { admin_notes: adminNote })}
                  disabled={saving || adminNote === (selectedConv.admin_notes || '')}
                >
                  Save Notes
                </Button>
              </div>

              {/* Flag actions */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-[11px]"
                  onClick={() => {
                    const newFlags = [...(selectedConv.flags || [])];
                    if (!newFlags.includes('needs_review')) newFlags.push('needs_review');
                    updateConversation(selectedConv.id, { flags: newFlags, status: 'flagged' });
                  }}
                  disabled={saving}
                >
                  <Flag className="w-3 h-3 mr-1" /> Flag for Review
                </Button>
                {selectedConv.flags?.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-[11px]"
                    onClick={() => updateConversation(selectedConv.id, { flags: [], status: 'resolved' })}
                    disabled={saving}
                  >
                    <X className="w-3 h-3 mr-1" /> Clear Flags
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </AdminLayout>
    );
  }

  // ── MAIN LIST VIEW ──
  return (
    <AdminLayout>
      <div className="p-4 md:p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2"><Bot className="w-5 h-5" /> AI Support Monitor</h1>
            <p className="text-sm text-muted-foreground">Track, replay, and review all AI support conversations</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={exportCSV}><Download className="w-3.5 h-3.5 mr-1" /> Export</Button>
            <Button variant="outline" size="sm" onClick={fetchConversations} disabled={loading}><RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} /> Refresh</Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <SummaryCard icon={<MessageCircle className="w-4 h-4" />} label="Total Conversations" value={stats.total} />
          <SummaryCard icon={<Clock className="w-4 h-4" />} label="Today" value={stats.today} />
          <SummaryCard icon={<CheckCircle className="w-4 h-4 text-emerald-500" />} label="AI Resolved" value={stats.resolved} />
          <SummaryCard icon={<Ticket className="w-4 h-4 text-blue-500" />} label="Tickets Created" value={stats.withTicket} />
          <SummaryCard icon={<XCircle className="w-4 h-4 text-destructive" />} label="Abandoned" value={stats.abandoned} />
          <SummaryCard icon={<AlertTriangle className="w-4 h-4 text-orange-500" />} label="Flagged" value={stats.flagged} />
          <SummaryCard icon={<Users className="w-4 h-4" />} label="Guests" value={stats.guests} />
          <SummaryCard icon={<Users className="w-4 h-4" />} label="Logged-in" value={stats.users} />
          <SummaryCard icon={<Users className="w-4 h-4" />} label="Agents" value={stats.agents} />
          <SummaryCard icon={<AlertTriangle className="w-4 h-4 text-destructive" />} label="Missed Escalation?" value={stats.missedEscalation} />
          <SummaryCard icon={<XCircle className="w-4 h-4 text-orange-500" />} label="Escalation Blocked" value={stats.blocked} />
          <SummaryCard icon={<TrendingUp className="w-4 h-4" />} label="Escalation Rate" value={stats.total > 0 ? `${Math.round(stats.withTicket / stats.total * 100)}%` : '—'} />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, email, ticket, message..." className="pl-9 h-9 text-sm" />
          </div>
          <Select value={filterUserType} onValueChange={setFilterUserType}>
            <SelectTrigger className="w-[130px] h-9 text-xs"><SelectValue placeholder="User type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="guest">Guest</SelectItem>
              <SelectItem value="user">Logged-in</SelectItem>
              <SelectItem value="agent">Agent</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterOutcome} onValueChange={setFilterOutcome}>
            <SelectTrigger className="w-[160px] h-9 text-xs"><SelectValue placeholder="Outcome" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Outcomes</SelectItem>
              {OUTCOME_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={filterFlags} onValueChange={setFilterFlags}>
            <SelectTrigger className="w-[170px] h-9 text-xs"><SelectValue placeholder="Special" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="flagged">🚩 Flagged</SelectItem>
              <SelectItem value="no_ticket_long">⚠️ Missed Escalation?</SelectItem>
              <SelectItem value="has_evidence">📎 Has Evidence</SelectItem>
              <SelectItem value="escalation_blocked">🚫 Escalation Blocked</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Conversation list */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Loading conversations...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No conversations found</div>
            ) : (
              <>
                <div className="md:hidden divide-y divide-border">
                  {filtered.map(conv => (
                    <button
                      key={conv.id}
                      type="button"
                      className="w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors"
                      onClick={() => openConversation(conv)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-semibold truncate">{getUserLabel(conv)}</p>
                            <Badge variant="outline" className="text-[9px]">{conv.user_type}</Badge>
                            {getStatusBadge(conv.status)}
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{conv.last_user_message_preview || '—'}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      </div>

                      <div className="flex items-center justify-between gap-2 mt-2 text-[11px] text-muted-foreground">
                        <span>{conv.user_message_count}/{conv.ai_message_count} msgs</span>
                        <span>{formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true })}</span>
                      </div>

                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        {getOutcomeBadge(conv.outcome)}
                        {conv.ticket_code ? (
                          <Badge className="bg-blue-500/10 text-blue-600 border-0 text-[10px]">{conv.ticket_code}</Badge>
                        ) : null}
                        {conv.flags?.length > 0 && <Badge variant="destructive" className="text-[10px]">Flagged</Badge>}
                        {conv.has_evidence && <Badge variant="outline" className="text-[10px]">📎 Evidence</Badge>}
                      </div>
                    </button>
                  ))}
                </div>

                <div className="hidden md:block overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs w-[140px]">User</TableHead>
                        <TableHead className="text-xs">Last Message</TableHead>
                        <TableHead className="text-xs w-[70px]">Msgs</TableHead>
                        <TableHead className="text-xs w-[100px]">Outcome</TableHead>
                        <TableHead className="text-xs w-[80px]">Ticket</TableHead>
                        <TableHead className="text-xs w-[70px]">Flags</TableHead>
                        <TableHead className="text-xs w-[90px]">Time</TableHead>
                        <TableHead className="text-xs w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(conv => (
                        <TableRow key={conv.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openConversation(conv)}>
                          <TableCell className="py-2">
                            <div className="text-xs font-medium truncate max-w-[130px]">{getUserLabel(conv)}</div>
                            <Badge variant="outline" className="text-[9px] mt-0.5">{conv.user_type}</Badge>
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="text-xs text-muted-foreground truncate max-w-[250px]">{conv.last_user_message_preview || '—'}</div>
                            <div className="text-[10px] text-muted-foreground/60 truncate max-w-[250px] mt-0.5">AI: {conv.last_ai_message_preview?.substring(0, 80) || '—'}</div>
                          </TableCell>
                          <TableCell className="py-2 text-xs">{conv.user_message_count}/{conv.ai_message_count}</TableCell>
                          <TableCell className="py-2">{getOutcomeBadge(conv.outcome)}</TableCell>
                          <TableCell className="py-2">
                            {conv.ticket_code ? (
                              <Badge className="bg-blue-500/10 text-blue-600 border-0 text-[10px]">{conv.ticket_code}</Badge>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="py-2">
                            {conv.flags?.length > 0 && <Flag className="w-3.5 h-3.5 text-destructive" />}
                            {conv.has_evidence && <span className="text-[10px]">📎</span>}
                            {conv.escalation_blocked && <span className="text-[10px]">🚫</span>}
                          </TableCell>
                          <TableCell className="py-2 text-[10px] text-muted-foreground">{formatDistanceToNow(new Date(conv.updated_at), { addSuffix: true })}</TableCell>
                          <TableCell className="py-2"><Eye className="w-3.5 h-3.5 text-muted-foreground" /></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <p className="text-[10px] text-muted-foreground text-center">Showing {filtered.length} of {conversations.length} conversations</p>
      </div>
    </AdminLayout>
  );
};

// Summary card component
const SummaryCard = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) => (
  <Card>
    <CardContent className="pt-4 pb-3 px-4">
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-[10px] text-muted-foreground">{label}</span></div>
      <div className="text-lg font-bold">{value}</div>
    </CardContent>
  </Card>
);

export default AdminAIMonitor;
