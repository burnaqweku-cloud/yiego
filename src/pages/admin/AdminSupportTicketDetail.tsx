import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { supabase } from '@/integrations/supabase/client';
import { formatPrice } from '@/data/bundles';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft, Copy, Clock, CheckCircle, AlertCircle, XCircle,
  Send, Package, Wallet, User, RefreshCw, CreditCard, Calendar, FileWarning, Mail, Shield
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const RESOLUTION_TYPES = [
  { value: 'credited_wallet', label: 'Credited Wallet' },
  { value: 'resent_fulfillment', label: 'Resent Fulfillment' },
  { value: 'status_updated', label: 'Status Updated' },
  { value: 'confirmed_delivered', label: 'Confirmed Delivered' },
  { value: 'refund_issued', label: 'Refund Issued' },
  { value: 'customer_error', label: 'Customer Error' },
  { value: 'other', label: 'Other' },
];

const ORDER_STATUSES = ['Pending', 'Paid', 'Processing', 'Delivered', 'Failed', 'Cancelled'];

const ISSUE_LABELS: Record<string, string> = {
  deposit_not_reflected: 'Deposit Not Reflected',
  order_not_delivered: 'Order Not Delivered',
  order_not_created: 'Order Not Created',
  wallet_issue: 'Wallet Issue',
  account_issue: 'Account Issue',
  other: 'Other',
};

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  new: { label: 'New', icon: AlertCircle, className: 'bg-sky-500/10 text-sky-600' },
  in_progress: { label: 'In Progress', icon: Clock, className: 'bg-amber-500/10 text-amber-600' },
  resolved: { label: 'Resolved', icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-600' },
  closed: { label: 'Closed', icon: XCircle, className: 'bg-muted text-muted-foreground' },
};

type LinkedRecordType = 'deposit' | 'order' | 'agent_order' | 'agent_subscription';

interface LinkedRecord {
  type: LinkedRecordType;
  id: string;
  display_id: string;
  amount: number;
  status: string;
  payment_status?: string;
  created_at: string;
  provider_reference?: string;
  user_id?: string | null;
  agent_id?: string | null;
  extra: Record<string, any>;
}

interface UserProfile {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  username: string | null;
}

interface WalletData {
  balance_ghs: number;
}

interface TicketMessage {
  id: string;
  created_at: string;
  created_by: string;
  message: string;
  is_internal: boolean;
}

interface SenderProfile {
  id: string;
  full_name: string;
  role: string;
}

const AdminSupportTicketDetail = () => {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const { log } = useAuditLog();
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [ticket, setTicket] = useState<any>(null);
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [senderProfiles, setSenderProfiles] = useState<Record<string, SenderProfile>>({});
  const [loading, setLoading] = useState(true);

  const [matchedRecords, setMatchedRecords] = useState<LinkedRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<LinkedRecord | null>(null);
  const [matchingRef, setMatchingRef] = useState(false);

  const [linkedUser, setLinkedUser] = useState<UserProfile | null>(null);
  const [walletData, setWalletData] = useState<WalletData | null>(null);

  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);

  const [newOrderStatus, setNewOrderStatus] = useState('');
  const [updatingOrder, setUpdatingOrder] = useState(false);

  const [resolutionType, setResolutionType] = useState('');
  const [resolutionNotes, setResolutionNotes] = useState('');

  // Order Not Created workflow state
  const [oncEmail, setOncEmail] = useState('');
  const [oncEmailLooking, setOncEmailLooking] = useState(false);
  const [oncLinkedUser, setOncLinkedUser] = useState<UserProfile | null>(null);
  const [oncWallet, setOncWallet] = useState<WalletData | null>(null);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditReason, setCreditReason] = useState('Order not created — payment confirmed');
  const [crediting, setCrediting] = useState(false);

  const scrollToBottom = () => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  useEffect(() => { scrollToBottom(); }, [messages]);

  // ---- Reference matching engine ----
  const matchReference = useCallback(async (refValue: string, refType: string, linkedOrderId: string | null, linkedDepositId: string | null) => {
    if (!refValue && !linkedOrderId && !linkedDepositId) return;
    setMatchingRef(true);
    const found: LinkedRecord[] = [];
    const ref = refValue?.trim() || '';

    // Search deposits
    if (ref && refType === 'deposit') {
      const { data: deposits } = await supabase
        .from('paystack_payments')
        .select('id, reference, amount_ghs, status, user_id, created_at, purpose, total_paid, processing_fee, channel, paid_at')
        .eq('reference', ref)
        .limit(5);
      deposits?.forEach((d: any) => {
        found.push({
          type: 'deposit', id: d.id, display_id: d.reference || d.id.substring(0, 12),
          amount: d.total_paid || d.amount_ghs, status: d.status, payment_status: d.status,
          created_at: d.created_at, provider_reference: d.reference, user_id: d.user_id,
          extra: { purpose: d.purpose, processing_fee: d.processing_fee, channel: d.channel, paid_at: d.paid_at, base_amount: d.amount_ghs },
        });
      });
    }

    if (linkedDepositId && !found.some(r => r.id === linkedDepositId)) {
      const { data: dep } = await supabase.from('paystack_payments')
        .select('id, reference, amount_ghs, status, user_id, created_at, purpose, total_paid, processing_fee, channel, paid_at')
        .eq('id', linkedDepositId).maybeSingle();
      if (dep) {
        found.push({
          type: 'deposit', id: dep.id, display_id: dep.reference || dep.id.substring(0, 12),
          amount: dep.total_paid || dep.amount_ghs, status: dep.status, created_at: dep.created_at,
          provider_reference: dep.reference, user_id: dep.user_id,
          extra: { purpose: dep.purpose, processing_fee: dep.processing_fee, channel: dep.channel, paid_at: dep.paid_at, base_amount: dep.amount_ghs },
        });
      }
    }

    // Search orders
    if (ref && (refType === 'order' || refType === 'none')) {
      const { data: orders } = await supabase.from('orders')
        .select('id, order_id, recipient_number, network, bundle_size_gb, amount_ghs, status, payment_method, payment_status, user_id, paystack_reference, created_at, total_paid, processing_fee')
        .eq('order_id', ref).limit(5);
      orders?.forEach((o: any) => {
        if (!found.some(r => r.type === 'order' && r.id === o.id)) {
          found.push({
            type: 'order', id: o.id, display_id: o.order_id, amount: o.total_paid || o.amount_ghs,
            status: o.status, payment_status: o.payment_status, created_at: o.created_at,
            provider_reference: o.paystack_reference, user_id: o.user_id,
            extra: { network: o.network, bundle_size_gb: o.bundle_size_gb, recipient_number: o.recipient_number, payment_method: o.payment_method, base_amount: o.amount_ghs, processing_fee: o.processing_fee },
          });
        }
      });
    }

    if (linkedOrderId) {
      const alreadyMatched = found.some(r => r.type === 'order' && (r.display_id === linkedOrderId || r.id === linkedOrderId));
      if (!alreadyMatched) {
        const { data: order } = await supabase.from('orders')
          .select('id, order_id, recipient_number, network, bundle_size_gb, amount_ghs, status, payment_method, payment_status, user_id, paystack_reference, created_at, total_paid, processing_fee')
          .or(`order_id.eq.${linkedOrderId},id.eq.${linkedOrderId}`).limit(1).maybeSingle();
        if (order) {
          found.push({
            type: 'order', id: order.id, display_id: order.order_id, amount: order.total_paid || order.amount_ghs,
            status: order.status, payment_status: order.payment_status, created_at: order.created_at,
            provider_reference: order.paystack_reference, user_id: order.user_id,
            extra: { network: order.network, bundle_size_gb: order.bundle_size_gb, recipient_number: order.recipient_number, payment_method: order.payment_method, base_amount: order.amount_ghs, processing_fee: order.processing_fee },
          });
        }
      }
    }

    const unique = found.filter((r, i, arr) => arr.findIndex(x => x.type === r.type && x.id === r.id) === i);
    setMatchedRecords(unique);
    if (unique.length === 1) setSelectedRecord(unique[0]);
    else if (unique.length > 1) setSelectedRecord(null);
    setMatchingRef(false);
  }, []);

  const fetchRecordUser = useCallback(async (record: LinkedRecord) => {
    const userId = record.user_id;
    const agentId = record.agent_id;
    let resolvedUserId = userId;
    if (!resolvedUserId && agentId) {
      const { data: agent } = await supabase.from('agents').select('user_id').eq('id', agentId).maybeSingle();
      if (agent) resolvedUserId = (agent as any).user_id;
    }
    if (resolvedUserId) {
      const { data: prof } = await supabase.from('profiles').select('id, full_name, email, phone, username').eq('id', resolvedUserId).maybeSingle();
      if (prof) setLinkedUser(prof as UserProfile);
      else setLinkedUser(null);
      setWalletData(null);
    } else {
      setLinkedUser(null);
      setWalletData(null);
    }
  }, []);

  useEffect(() => { if (selectedRecord) fetchRecordUser(selectedRecord); }, [selectedRecord, fetchRecordUser]);

  const fetchSenderProfiles = useCallback(async (msgs: TicketMessage[]) => {
    const ids = [...new Set(msgs.map(m => m.created_by))];
    const missing = ids.filter(id => !senderProfiles[id]);
    if (missing.length === 0) return;
    const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', missing);
    const { data: roles } = await supabase.from('user_roles').select('user_id, role').in('user_id', missing);
    const newProfiles: Record<string, SenderProfile> = {};
    missing.forEach(id => {
      const prof = profiles?.find((p: any) => p.id === id);
      const roleRow = roles?.find((r: any) => r.user_id === id);
      newProfiles[id] = { id, full_name: prof?.full_name || 'Unknown', role: roleRow?.role === 'admin' ? 'Admin' : 'Staff' };
    });
    setSenderProfiles(prev => ({ ...prev, ...newProfiles }));
  }, [senderProfiles]);

  const fetchTicket = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);
    const { data, error } = await supabase.from('admin_support_tickets').select('*').eq('id', ticketId).maybeSingle();
    if (error || !data) { toast.error('Ticket not found'); navigate('/admin/support-tickets'); return; }
    setTicket(data);

    // Load ONC linked user if customer_email is set
    if (data.issue_type === 'order_not_created' && data.customer_email) {
      setOncEmail(data.customer_email);
      const { data: prof } = await supabase.from('profiles').select('id, full_name, email, phone, username').eq('email', data.customer_email).maybeSingle();
      if (prof) {
        setOncLinkedUser(prof as UserProfile);
        const { data: w } = await supabase.from('wallets').select('balance_ghs').eq('user_id', prof.id).maybeSingle();
        if (w) setOncWallet(w as WalletData);
      } else {
        setOncLinkedUser(null);
        setOncWallet(null);
      }
    }

    // Set credit amount default from expected_amount
    const meta = (data as any).ticket_metadata || {};
    if (meta.expected_amount) {
      setCreditAmount(String(meta.expected_amount));
    }

    const { data: msgs } = await supabase.from('admin_ticket_messages').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true });
    const msgList = (msgs as TicketMessage[]) || [];
    setMessages(msgList);
    await fetchSenderProfiles(msgList);

    // Only run reference matching for non-ONC tickets
    if (data.issue_type !== 'order_not_created') {
      await matchReference(data.reference_value || '', data.reference_type || '', data.linked_order_id, data.linked_deposit_id);
    }

    if (data.linked_user_id) {
      const { data: prof } = await supabase.from('profiles').select('id, full_name, email, phone, username').eq('id', data.linked_user_id).maybeSingle();
      if (prof) setLinkedUser(prof as UserProfile);
    }
    setLoading(false);
  }, [ticketId, navigate, matchReference, fetchSenderProfiles]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);

  const addMessage = async (text: string) => {
    if (!text.trim() || !ticketId) return;
    setSending(true);
    const { error } = await supabase.from('admin_ticket_messages').insert({
      ticket_id: ticketId, created_by: user!.id, message: text.trim(), is_internal: true,
    });
    if (!error) {
      setNewMessage('');
      const { data: msgs } = await supabase.from('admin_ticket_messages').select('*').eq('ticket_id', ticketId).order('created_at', { ascending: true });
      const msgList = (msgs as TicketMessage[]) || [];
      setMessages(msgList);
      await fetchSenderProfiles(msgList);
    } else { toast.error('Failed to add note'); }
    setSending(false);
  };

  const updateTicketStatus = async (newStatus: string) => {
    if (!ticketId) return;
    const previousStatus = ticket?.status;
    const updates: any = { status: newStatus };
    if ((newStatus === 'resolved' || newStatus === 'closed') && resolutionType) {
      updates.resolution_type = resolutionType;
      updates.resolution_notes = resolutionNotes.trim() || null;
    }
    const { error } = await supabase.from('admin_support_tickets').update(updates).eq('id', ticketId);
    if (!error) {
      await addMessage(`Ticket status changed to "${newStatus}"`);
      toast.success(`Ticket marked as ${newStatus}`);
      await log({ action: 'ticket_status_change', entity_type: 'support_ticket', entity_id: ticketId, changes: { status: { after: newStatus } } });

      // Fire customer notification on transition INTO 'resolved' (idempotent)
      if (newStatus === 'resolved' && previousStatus !== 'resolved' && ticket?.created_by) {
        const t: any = ticket;
        supabase.functions.invoke('notify-event', {
          body: {
            event: 'ai_ticket_resolved',
            user_id: ticket.created_by,
            data: {
              ticket_id: ticketId,
              ticket_code: t.ticket_code || (t.ticket_number ? `TK-${t.ticket_number}` : null),
              issue_type: ticket.issue_type,
              resolution_message: t.resolution_message || updates.resolution_notes || t.resolution_notes || null,
            },
            idempotencyKey: `ai_ticket_resolved:${ticketId}`,
          },
        }).catch((e) => console.error('[notify-event] resolved invoke failed', e));
      }

      fetchTicket();
    } else { toast.error('Failed to update ticket'); }
  };

  const handleOrderStatusChange = async () => {
    if (!selectedRecord || (selectedRecord.type !== 'order' && selectedRecord.type !== 'agent_order') || !newOrderStatus) return;
    if (newOrderStatus === selectedRecord.status) return;
    setUpdatingOrder(true);
    const oldStatus = selectedRecord.status;
    const table = selectedRecord.type === 'order' ? 'orders' : 'agent_orders';
    const idCol = selectedRecord.type === 'order' ? 'order_id' : 'id';
    const idVal = selectedRecord.type === 'order' ? selectedRecord.display_id : selectedRecord.id;
    const { error } = await supabase.from(table).update({ status: newOrderStatus } as any).eq(idCol, idVal);
    if (!error) {
      await addMessage(`${selectedRecord.type === 'order' ? 'Order' : 'Agent order'} status changed from "${oldStatus}" to "${newOrderStatus}"`);
      toast.success('Order status updated');
      await log({ action: 'order_status_change_from_ticket', entity_type: selectedRecord.type, entity_id: idVal, changes: { status: { before: oldStatus, after: newOrderStatus } } });
      fetchTicket();
    } else { toast.error('Failed to update order'); }
    setUpdatingOrder(false);
  };

  const handleDepositStatusChange = async (newStatus: string) => {
    if (!isAdmin || !selectedRecord || selectedRecord.type !== 'deposit') return;
    const { error } = await supabase.from('paystack_payments').update({ status: newStatus }).eq('id', selectedRecord.id);
    if (!error) {
      await addMessage(`Deposit status changed to "${newStatus}" by admin`);
      toast.success('Deposit status updated');
      fetchTicket();
    } else { toast.error('Failed to update deposit'); }
  };

  const handleEscalateToAdmin = async () => {
    await updateTicketStatus('in_progress');
    await addMessage('Escalated to admin for review');
    toast.success('Escalated to admin');
  };

  // ---- Order Not Created workflow ----
  const handleVerificationChange = async (status: 'confirmed' | 'not_found') => {
    if (!isAdmin || !ticketId) { toast.error('Admin only'); return; }
    const { error } = await supabase.from('admin_support_tickets')
      .update({ verification_status: status } as any).eq('id', ticketId);
    if (!error) {
      await addMessage(`Payment verification set to "${status}"`);
      toast.success(`Payment marked as ${status === 'confirmed' ? 'Confirmed' : 'Not Found'}`);
      await log({ action: 'ticket_payment_verification', entity_type: 'support_ticket', entity_id: ticketId, changes: { verification_status: { after: status } } });
      fetchTicket();
    } else { toast.error('Failed to update verification'); }
  };

  const handleOncEmailLookup = async () => {
    if (!oncEmail.trim()) { toast.error('Enter a customer email'); return; }
    setOncEmailLooking(true);
    // Save email to ticket
    await supabase.from('admin_support_tickets')
      .update({ customer_email: oncEmail.trim() } as any).eq('id', ticketId);

    const { data: prof } = await supabase.from('profiles')
      .select('id, full_name, email, phone, username')
      .eq('email', oncEmail.trim()).maybeSingle();

    if (prof) {
      setOncLinkedUser(prof as UserProfile);
      // Update linked_user_id on ticket
      await supabase.from('admin_support_tickets')
        .update({ linked_user_id: prof.id } as any).eq('id', ticketId);
      // Fetch wallet
      const { data: w } = await supabase.from('wallets').select('balance_ghs').eq('user_id', prof.id).maybeSingle();
      if (w) setOncWallet(w as WalletData);
      else setOncWallet(null);
      await addMessage(`Linked customer account: ${prof.full_name} (${prof.email})`);
      toast.success('Account linked');
    } else {
      setOncLinkedUser(null);
      setOncWallet(null);
      toast.error('No account found for this email');
    }
    setOncEmailLooking(false);
  };

  const handleWalletCredit = async () => {
    if (!isAdmin) { toast.error('Admin only'); return; }
    if (!oncLinkedUser) { toast.error('No linked user'); return; }
    const amount = parseFloat(creditAmount);
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return; }
    if (!creditReason.trim()) { toast.error('Enter a reason'); return; }

    setCrediting(true);
    try {
      // 1. Insert wallet transaction
      const { error: txError } = await supabase.from('wallet_transactions').insert({
        user_id: oncLinkedUser.id,
        type: 'credit',
        amount_ghs: amount,
        status: 'completed',
        reference: `TKT-${ticket.ticket_number}`,
        description: creditReason.trim(),
        provider: 'manual',
      } as any);

      if (txError) { toast.error(`Wallet credit failed: ${txError.message}`); setCrediting(false); return; }

      // 2. Update wallet balance
      const { error: wError } = await supabase.from('wallets')
        .update({ balance_ghs: (oncWallet?.balance_ghs || 0) + amount } as any)
        .eq('user_id', oncLinkedUser.id);

      if (wError) {
        toast.error(`Balance update failed: ${wError.message}`);
        setCrediting(false);
        return;
      }

      // 3. Log it
      await addMessage(`Wallet credited GHS ${amount.toFixed(2)} to ${oncLinkedUser.full_name} — ${creditReason.trim()}`);
      await log({
        action: 'wallet_credit_from_ticket',
        entity_type: 'wallet',
        entity_id: oncLinkedUser.id,
        changes: { amount: { after: amount }, reason: { after: creditReason.trim() } },
      });

      toast.success(`GHS ${amount.toFixed(2)} credited to wallet`);
      // Refresh wallet
      const { data: w } = await supabase.from('wallets').select('balance_ghs').eq('user_id', oncLinkedUser.id).maybeSingle();
      if (w) setOncWallet(w as WalletData);
    } catch (e: any) {
      toast.error('Unexpected error during credit');
    }
    setCrediting(false);
  };

  const copyText = (text: string) => { navigator.clipboard.writeText(text); toast.success('Copied'); };
  const maskRef = (ref: string | undefined) => {
    if (!ref) return '—';
    if (ref.length <= 8) return ref;
    return ref.substring(0, 6) + '••••' + ref.substring(ref.length - 4);
  };
  const recordTypeLabel = (type: LinkedRecordType) => {
    switch (type) { case 'deposit': return 'Deposit'; case 'order': return 'Order'; case 'agent_order': return 'Agent Order'; case 'agent_subscription': return 'Subscription'; }
  };
  const recordTypeIcon = (type: LinkedRecordType) => {
    switch (type) { case 'deposit': return Wallet; case 'order': return Package; case 'agent_order': return Package; case 'agent_subscription': return Calendar; }
  };

  if (loading) {
    return (
      <AdminLayout>
        <div className="space-y-4">
          <Skeleton className="h-10 w-48" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </AdminLayout>
    );
  }

  if (!ticket) return null;

  const st = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.new;
  const StatusIcon = st.icon;
  const meta = ticket.ticket_metadata || {};
  const isONC = ticket.issue_type === 'order_not_created';
  const verificationStatus = ticket.verification_status || 'unverified';

  return (
    <AdminLayout>
      <div className="space-y-5 max-w-4xl">
        <button onClick={() => navigate('/admin/support-tickets')} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to tickets
        </button>

        {/* Ticket Header */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-display font-extrabold mb-2">Ticket #{ticket.ticket_number}</h1>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${st.className}`}>
                  <StatusIcon className="w-3.5 h-3.5" />
                  {st.label}
                </span>
                <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full font-medium">
                  {ISSUE_LABELS[ticket.issue_type] || ticket.issue_type}
                </span>
                {isONC && verificationStatus === 'confirmed' && (
                  <span className="text-[10px] font-bold bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">✓ Payment Confirmed</span>
                )}
                {isONC && verificationStatus === 'not_found' && (
                  <span className="text-[10px] font-bold bg-destructive/10 text-destructive px-2 py-0.5 rounded-full">✗ Payment Not Found</span>
                )}
              </div>
            </div>
          </div>

          {/* Contact & Reference */}
          <div className="mt-3 space-y-1 text-sm">
            {ticket.customer_phone && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs w-24">Phone:</span>
                <span className="font-medium">{ticket.customer_phone}</span>
                <button onClick={() => copyText(ticket.customer_phone)} className="text-muted-foreground hover:text-foreground"><Copy className="w-3 h-3" /></button>
              </div>
            )}
            {ticket.reference_value && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs w-24">Reference:</span>
                <span className="font-medium font-mono text-xs">{ticket.reference_value}</span>
                <button onClick={() => copyText(ticket.reference_value)} className="text-muted-foreground hover:text-foreground"><Copy className="w-3 h-3" /></button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs w-24">Created:</span>
              <span className="text-xs">{format(new Date(ticket.created_at), 'MMM d, yyyy h:mm a')}</span>
            </div>
          </div>

          {/* Issue-specific metadata display */}
          {(ticket.issue_type === 'order_not_delivered' && meta.recipient_number) && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground text-xs w-24">Recipient:</span>
              <span className="font-mono text-xs">{meta.recipient_number}</span>
            </div>
          )}

          {isONC && (
            <div className="mt-3 bg-muted/30 rounded-lg p-3 space-y-1 text-xs">
              <p className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Payment Investigation Details</p>
              {meta.payment_number && <div className="flex gap-2"><span className="text-muted-foreground w-28">Payment #:</span><span className="font-mono">{meta.payment_number}</span></div>}
              {meta.payment_date && <div className="flex gap-2"><span className="text-muted-foreground w-28">Date:</span><span>{meta.payment_date}</span></div>}
              {meta.payment_time && <div className="flex gap-2"><span className="text-muted-foreground w-28">Time:</span><span>{meta.payment_time}</span></div>}
              {meta.bundle_label && <div className="flex gap-2"><span className="text-muted-foreground w-28">Bundle:</span><span>{meta.bundle_label}</span></div>}
              {meta.expected_amount != null && <div className="flex gap-2"><span className="text-muted-foreground w-28">Expected Amount:</span><span className="font-bold">GHS {Number(meta.expected_amount).toFixed(2)}</span></div>}
            </div>
          )}

          {ticket.issue_type === 'wallet_issue' && meta.short_description && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground text-xs w-24">Description:</span>
              <span className="text-xs">{meta.short_description}</span>
            </div>
          )}

          {ticket.issue_type === 'account_issue' && meta.short_description && (
            <div className="mt-2 flex items-center gap-2 text-sm">
              <span className="text-muted-foreground text-xs w-24">Description:</span>
              <span className="text-xs">{meta.short_description}</span>
            </div>
          )}

          {ticket.notes && (
            <div className="mt-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">Staff Note</p>
              <p className="text-sm bg-muted/40 rounded-lg p-3">{ticket.notes}</p>
            </div>
          )}
        </div>

        {/* ====== ORDER NOT CREATED — Guided Workflow ====== */}
        {isONC && (
          <div className="space-y-4">
            {/* PHASE 1: Payment Verification */}
            <div className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-primary" />
                <h3 className="text-sm font-bold">Phase 1: Payment Verification</h3>
                {verificationStatus !== 'unverified' && (
                  <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    verificationStatus === 'confirmed' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-destructive/10 text-destructive'
                  }`}>
                    {verificationStatus === 'confirmed' ? '✓ Confirmed' : '✗ Not Found'}
                  </span>
                )}
              </div>

              {verificationStatus === 'unverified' && (
                <>
                  {isAdmin ? (
                    <div>
                      <p className="text-xs text-muted-foreground mb-3">Verify if the customer's payment was received.</p>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => handleVerificationChange('confirmed')} className="gap-1">
                          <CheckCircle className="w-3.5 h-3.5" /> Payment Confirmed
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleVerificationChange('not_found')} className="gap-1">
                          <XCircle className="w-3.5 h-3.5" /> Payment Not Found
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Awaiting admin payment verification.</p>
                      <Button size="sm" variant="outline" className="text-xs" onClick={handleEscalateToAdmin}>
                        Escalate to Admin
                      </Button>
                    </div>
                  )}
                </>
              )}

              {verificationStatus === 'not_found' && (
                <p className="text-xs text-muted-foreground">Payment was not found. Add a note and resolve/close the ticket.</p>
              )}

              {verificationStatus === 'confirmed' && (
                <p className="text-xs text-emerald-600">Payment verified ✓ — proceed to link customer account below.</p>
              )}
            </div>

            {/* PHASE 2: Customer Email + Account Linking (only after Payment Confirmed) */}
            {verificationStatus === 'confirmed' && (
              <div className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Mail className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold">Phase 2: Link Customer Account</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">Enter the customer's DataSika account email to link and credit their wallet.</p>
                <div className="flex gap-2">
                  <Input
                    className="h-9 text-sm flex-1"
                    placeholder="customer@example.com"
                    value={oncEmail}
                    onChange={e => setOncEmail(e.target.value)}
                  />
                  <Button size="sm" className="h-9" onClick={handleOncEmailLookup} disabled={oncEmailLooking}>
                    {oncEmailLooking ? 'Looking up...' : 'Lookup'}
                  </Button>
                </div>

                {oncLinkedUser && (
                  <div className="mt-3 bg-muted/30 rounded-lg p-3 space-y-1 text-xs">
                    <p className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground mb-1.5">Linked Account</p>
                    <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span>{oncLinkedUser.full_name}</span></div>
                    {oncLinkedUser.email && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{oncLinkedUser.email}</span></div>}
                    <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{oncLinkedUser.phone}</span></div>
                    {oncLinkedUser.username && <div className="flex justify-between"><span className="text-muted-foreground">Username</span><span>@{oncLinkedUser.username}</span></div>}
                    {oncWallet && <div className="flex justify-between"><span className="text-muted-foreground">Wallet Balance</span><span className="font-bold">GHS {oncWallet.balance_ghs.toFixed(2)}</span></div>}
                  </div>
                )}

                {/* Admin Wallet Credit */}
                {isAdmin && oncLinkedUser && (
                  <div className="mt-4 pt-3 border-t border-border">
                    <div className="flex items-center gap-2 mb-3">
                      <CreditCard className="w-4 h-4 text-primary" />
                      <h4 className="text-xs font-bold">Admin: Credit Wallet</h4>
                    </div>
                    <div className="space-y-3">
                      <div>
                        <Label className="text-[10px] font-semibold">Amount (GHS)</Label>
                        <Input
                          type="number"
                          step="0.01"
                          className="h-9 mt-1 text-sm"
                          value={creditAmount}
                          onChange={e => setCreditAmount(e.target.value)}
                        />
                        {meta.expected_amount && creditAmount !== String(meta.expected_amount) && (
                          <p className="text-[10px] text-amber-600 mt-0.5">Default expected amount: GHS {Number(meta.expected_amount).toFixed(2)}</p>
                        )}
                      </div>
                      <div>
                        <Label className="text-[10px] font-semibold">Reason</Label>
                        <Input className="h-9 mt-1 text-sm" value={creditReason} onChange={e => setCreditReason(e.target.value)} />
                      </div>
                      <Button size="sm" onClick={handleWalletCredit} disabled={crediting} className="gap-1">
                        <Wallet className="w-3.5 h-3.5" />
                        {crediting ? 'Crediting...' : 'Credit Wallet'}
                      </Button>
                    </div>
                  </div>
                )}

                {!isAdmin && oncLinkedUser && (
                  <p className="mt-3 text-[10px] text-muted-foreground italic">Wallet credit actions are admin-only.</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Record Selector (if multiple matches) — non-ONC tickets */}
        {!isONC && matchedRecords.length > 1 && !selectedRecord && (
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-sm font-bold mb-3">Multiple Records Found — Select One</h3>
            <div className="space-y-2">
              {matchedRecords.map(r => {
                const Icon = recordTypeIcon(r.type);
                return (
                  <button key={`${r.type}-${r.id}`} onClick={() => setSelectedRecord(r)}
                    className="w-full text-left bg-muted/40 rounded-lg p-3 hover:bg-muted/60 transition-colors">
                    <div className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-primary" />
                      <span className="text-xs font-bold">{recordTypeLabel(r.type)}</span>
                      <span className="text-xs font-mono text-muted-foreground">{r.display_id}</span>
                      <span className="ml-auto text-xs font-semibold">{formatPrice(r.amount)}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-secondary text-secondary-foreground">{r.status}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Linked Record & User Panels — non-ONC tickets */}
        {!isONC && (
          <div className="grid gap-4 md:grid-cols-2">
            {selectedRecord && (
              <div className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  {(() => { const Icon = recordTypeIcon(selectedRecord.type); return <Icon className="w-4 h-4 text-primary" />; })()}
                  <h3 className="text-sm font-bold">{recordTypeLabel(selectedRecord.type)} Snapshot</h3>
                  {matchedRecords.length > 1 && (
                    <button onClick={() => setSelectedRecord(null)} className="ml-auto text-[10px] text-primary hover:underline">Change</button>
                  )}
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">ID</span><span className="font-mono flex items-center gap-1">{selectedRecord.display_id} <button onClick={() => copyText(selectedRecord.display_id)}><Copy className="w-3 h-3 text-muted-foreground" /></button></span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold">{formatPrice(selectedRecord.amount)}</span></div>
                  {selectedRecord.extra.base_amount !== undefined && selectedRecord.extra.base_amount !== selectedRecord.amount && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Base Amount</span><span>{formatPrice(selectedRecord.extra.base_amount)}</span></div>
                  )}
                  {selectedRecord.extra.processing_fee > 0 && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Processing Fee</span><span>{formatPrice(selectedRecord.extra.processing_fee)}</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-muted-foreground">Status</span><span className="font-bold">{selectedRecord.status}</span></div>
                  {selectedRecord.payment_status && selectedRecord.payment_status !== selectedRecord.status && (
                    <div className="flex justify-between"><span className="text-muted-foreground">Payment Status</span><span>{selectedRecord.payment_status}</span></div>
                  )}
                  <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span>{format(new Date(selectedRecord.created_at), 'MMM d, yyyy h:mm a')}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Provider Ref</span><span className="font-mono">{maskRef(selectedRecord.provider_reference)}</span></div>
                  {selectedRecord.extra.network && <div className="flex justify-between"><span className="text-muted-foreground">Network</span><span>{selectedRecord.extra.network}</span></div>}
                  {selectedRecord.extra.bundle_size_gb && <div className="flex justify-between"><span className="text-muted-foreground">Bundle</span><span>{selectedRecord.extra.bundle_size_gb}GB</span></div>}
                  {selectedRecord.extra.recipient_number && <div className="flex justify-between"><span className="text-muted-foreground">Recipient</span><span>{selectedRecord.extra.recipient_number}</span></div>}
                  {selectedRecord.extra.customer_phone && <div className="flex justify-between"><span className="text-muted-foreground">Customer</span><span>{selectedRecord.extra.customer_phone}</span></div>}
                  {selectedRecord.extra.payment_method && <div className="flex justify-between"><span className="text-muted-foreground">Payment</span><span>{selectedRecord.extra.payment_method}</span></div>}
                  {selectedRecord.extra.purpose && <div className="flex justify-between"><span className="text-muted-foreground">Purpose</span><span>{selectedRecord.extra.purpose}</span></div>}
                  {selectedRecord.extra.expiry_date && <div className="flex justify-between"><span className="text-muted-foreground">Expires</span><span>{format(new Date(selectedRecord.extra.expiry_date), 'MMM d, yyyy')}</span></div>}
                </div>

                <div className="mt-4 pt-3 border-t border-border space-y-3">
                  {(selectedRecord.type === 'order' || selectedRecord.type === 'agent_order') && (
                    <div>
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Change Status</Label>
                      <div className="flex gap-2 mt-1.5">
                        <Select value={newOrderStatus || selectedRecord.status} onValueChange={setNewOrderStatus}>
                          <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                          <SelectContent>{ORDER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={handleOrderStatusChange} disabled={updatingOrder || !newOrderStatus || newOrderStatus === selectedRecord.status}>Save</Button>
                      </div>
                    </div>
                  )}

                  {selectedRecord.type === 'deposit' && isAdmin && (
                    <div>
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Deposit Actions (Admin)</Label>
                      <div className="flex gap-2 mt-1.5 flex-wrap">
                        {selectedRecord.status !== 'confirmed' && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => handleDepositStatusChange('confirmed')}>
                            <CheckCircle className="w-3 h-3 mr-1" /> Mark Successful
                          </Button>
                        )}
                        {selectedRecord.status !== 'failed' && (
                          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => handleDepositStatusChange('failed')}>
                            <XCircle className="w-3 h-3 mr-1" /> Mark Failed
                          </Button>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedRecord.type === 'deposit' && !isAdmin && (
                    <div>
                      <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Deposit Actions</Label>
                      <div className="flex gap-2 mt-1.5 flex-wrap">
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={handleEscalateToAdmin}>
                          Escalate to Admin
                        </Button>
                        <p className="text-[10px] text-muted-foreground italic self-center">Wallet crediting is admin-only</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {linkedUser && (
              <div className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold">User Snapshot</h3>
                </div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Name</span><span>{linkedUser.full_name}</span></div>
                  {linkedUser.username && <div className="flex justify-between"><span className="text-muted-foreground">Username</span><span>@{linkedUser.username}</span></div>}
                  {linkedUser.email && <div className="flex justify-between"><span className="text-muted-foreground">Email</span><span>{linkedUser.email}</span></div>}
                  <div className="flex justify-between"><span className="text-muted-foreground">Phone</span><span>{linkedUser.phone}</span></div>
                </div>
                <div className="mt-3 pt-3 border-t border-border flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => navigate(`/admin/users/${linkedUser.id}`)}>View User</Button>
                </div>
              </div>
            )}

            {matchedRecords.length === 0 && !matchingRef && ticket.reference_value && ticket.issue_type !== 'wallet_issue' && ticket.issue_type !== 'account_issue' && (
              <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 md:col-span-2">
                <p className="text-sm text-destructive font-medium">⚠️ No {ticket.issue_type === 'deposit_not_reflected' ? 'deposit' : 'record'} found for {ticket.reference_value}. Check ID and try again.</p>
                <p className="text-xs text-muted-foreground mt-1">Searched deposits, orders, agent orders, and subscriptions.</p>
              </div>
            )}

            {matchingRef && (
              <div className="md:col-span-2 text-center py-4">
                <RefreshCw className="w-4 h-4 animate-spin mx-auto text-muted-foreground" />
                <p className="text-xs text-muted-foreground mt-2">Matching reference...</p>
              </div>
            )}
          </div>
        )}

        {/* Chat-Style Notes & Activity */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-bold mb-3">Conversation</h3>

          <div className="h-72 overflow-y-auto space-y-3 mb-4 p-2">
            {messages.length === 0 ? (
              <p className="text-xs text-muted-foreground py-8 text-center">No messages yet. Start the conversation below.</p>
            ) : (
              messages.map(msg => {
                const sender = senderProfiles[msg.created_by];
                const isSelf = msg.created_by === user?.id;
                const isAdminSender = sender?.role === 'Admin';

                return (
                  <div key={msg.id} className={`flex ${isSelf ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                      isSelf
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-muted rounded-bl-md'
                    }`}>
                      <div className={`flex items-center gap-2 mb-1 ${isSelf ? 'justify-end' : ''}`}>
                        <span className={`text-[10px] font-bold ${isSelf ? 'text-primary-foreground/80' : 'text-foreground'}`}>
                          {sender?.full_name || 'Unknown'}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                          isAdminSender
                            ? (isSelf ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-primary/10 text-primary')
                            : (isSelf ? 'bg-primary-foreground/15 text-primary-foreground/80' : 'bg-secondary text-secondary-foreground')
                        }`}>
                          {sender?.role || 'Staff'}
                        </span>
                      </div>
                      <p className={`text-xs leading-relaxed ${isSelf ? 'text-primary-foreground' : 'text-foreground'}`}>
                        {msg.message}
                      </p>
                      <p className={`text-[9px] mt-1 ${isSelf ? 'text-primary-foreground/60 text-right' : 'text-muted-foreground'}`}>
                        {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                      </p>
                    </div>
                  </div>
                );
              })
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Message Input */}
          <div className="flex gap-2 border-t border-border pt-3">
            <Input
              placeholder="Add internal note..."
              value={newMessage}
              onChange={e => setNewMessage(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && addMessage(newMessage)}
              className="h-10 text-sm flex-1"
            />
            <Button className="h-10 px-4" onClick={() => addMessage(newMessage)} disabled={sending || !newMessage.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Resolution Controls */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-bold mb-3">Resolution</h3>

          {(ticket.status === 'new' || ticket.status === 'in_progress') && (
            <div className="space-y-3 mb-4">
              {isAdmin && (
                <div>
                  <Label className="text-xs font-semibold">Resolution Type</Label>
                  <Select value={resolutionType} onValueChange={setResolutionType}>
                    <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select resolution type" /></SelectTrigger>
                    <SelectContent>{RESOLUTION_TYPES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {isAdmin && (
                <div>
                  <Label className="text-xs font-semibold">Resolution Notes</Label>
                  <Textarea className="mt-1 text-sm" placeholder="Summary of resolution..." rows={2} value={resolutionNotes} onChange={e => setResolutionNotes(e.target.value)} />
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            {ticket.status === 'new' && (
              <Button size="sm" onClick={() => updateTicketStatus('in_progress')}>
                <Clock className="w-3.5 h-3.5 mr-1" /> Mark In Progress
              </Button>
            )}
            {ticket.status === 'in_progress' && (
              <Button size="sm" onClick={() => updateTicketStatus('resolved')}>
                <CheckCircle className="w-3.5 h-3.5 mr-1" /> Resolve
              </Button>
            )}
            {ticket.status === 'resolved' && (
              <Button size="sm" variant="outline" onClick={() => updateTicketStatus('closed')}>
                <XCircle className="w-3.5 h-3.5 mr-1" /> Close
              </Button>
            )}
          </div>

          {ticket.resolution_type && (
            <div className="mt-4 pt-3 border-t border-border text-sm">
              <p className="text-xs text-muted-foreground mb-1">Resolution: <strong>{RESOLUTION_TYPES.find(r => r.value === ticket.resolution_type)?.label || ticket.resolution_type}</strong></p>
              {ticket.resolution_notes && <p className="text-xs bg-muted/40 p-2 rounded">{ticket.resolution_notes}</p>}
            </div>
          )}
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminSupportTicketDetail;
