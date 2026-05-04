import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Plus, RefreshCw, Copy, Clock, CheckCircle, AlertCircle, XCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const ISSUE_TYPES = [
  { value: 'deposit_not_reflected', label: 'Deposit Not Reflected' },
  { value: 'order_not_delivered', label: 'Order Not Delivered' },
  { value: 'order_not_created', label: 'Order Not Created' },
  { value: 'wallet_issue', label: 'Wallet Issue' },
  { value: 'account_issue', label: 'Account Issue' },
  { value: 'other', label: 'Other' },
];

const STATUS_TABS = [
  { value: 'new', label: 'New', icon: AlertCircle, color: 'text-sky-600' },
  { value: 'in_progress', label: 'In Progress', icon: Clock, color: 'text-amber-600' },
  { value: 'resolved', label: 'Resolved', icon: CheckCircle, color: 'text-emerald-600' },
  { value: 'closed', label: 'Closed', icon: XCircle, color: 'text-muted-foreground' },
];

const PAGE_SIZE = 20;

interface Ticket {
  id: string;
  ticket_number: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  assigned_to: string | null;
  status: string;
  issue_type: string;
  customer_phone: string | null;
  reference_type: string;
  reference_value: string | null;
  linked_order_id: string | null;
  linked_deposit_id: string | null;
  linked_user_id: string | null;
  notes: string | null;
  resolution_type: string | null;
  resolution_notes: string | null;
  ticket_metadata?: any;
  verification_status?: string;
}

interface ProductOption {
  id: string;
  network: string;
  bundle_size_gb: number;
  description: string;
}

const AdminSupportTickets = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('new');
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [staffProfiles, setStaffProfiles] = useState<Record<string, string>>({});

  // Products + pricing for bundle dropdown
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [serverPrices, setServerPrices] = useState<Record<string, number>>({});
  const [productsLoaded, setProductsLoaded] = useState(false);

  // Create form state — common
  const [formIssueType, setFormIssueType] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Issue-specific fields
  const [formDepositId, setFormDepositId] = useState('');
  const [formOrderId, setFormOrderId] = useState('');
  const [formRecipientNumber, setFormRecipientNumber] = useState('');
  const [formPaymentNumber, setFormPaymentNumber] = useState('');
  const [formPaymentDate, setFormPaymentDate] = useState('');
  const [formPaymentTime, setFormPaymentTime] = useState('');
  const [formSelectedProductId, setFormSelectedProductId] = useState('');
  const [formWalletRef, setFormWalletRef] = useState('');
  const [formWalletDesc, setFormWalletDesc] = useState('');
  const [formAccountId, setFormAccountId] = useState('');
  const [formAccountDesc, setFormAccountDesc] = useState('');

  // Load products + prices for bundle dropdown
  useEffect(() => {
    const load = async () => {
      const [prodRes, priceRes] = await Promise.all([
        supabase.from('products').select('id, network, bundle_size_gb, description').eq('active', true).order('bundle_size_gb'),
        supabase.functions.invoke('get-public-prices'),
      ]);
      if (prodRes.data) setProducts(prodRes.data as ProductOption[]);
      if (!priceRes.error && priceRes.data?.prices) setServerPrices(priceRes.data.prices);
      setProductsLoaded(true);
    };
    load();
  }, []);

  const getExpectedAmount = (productId: string): number | null => {
    if (!productId) return null;
    return serverPrices[productId] ?? null;
  };

  const selectedProduct = products.find(p => p.id === formSelectedProductId);
  const expectedAmount = getExpectedAmount(formSelectedProductId);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from('admin_support_tickets')
      .select('*', { count: 'exact' })
      .eq('status', activeTab)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (search.trim()) {
      const s = search.trim();
      query = supabase
        .from('admin_support_tickets')
        .select('*', { count: 'exact' })
        .eq('status', activeTab)
        .or(`customer_phone.ilike.%${s}%,reference_value.ilike.%${s}%,issue_type.ilike.%${s}%`)
        .order('created_at', { ascending: false })
        .range(from, to);
    }

    const { data, error, count } = await query;
    if (!error) {
      setTickets((data as any[]) || []);
      setTotalCount(count || 0);
      const assignedIds = [...new Set((data || []).map((t: any) => t.assigned_to).filter(Boolean))];
      if (assignedIds.length > 0) {
        const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', assignedIds);
        if (profiles) {
          const map: Record<string, string> = {};
          profiles.forEach((p: any) => { map[p.id] = p.full_name; });
          setStaffProfiles(prev => ({ ...prev, ...map }));
        }
      }
    }
    setLoading(false);
  }, [activeTab, page, search]);

  const fetchCounts = useCallback(async () => {
    const results = await Promise.all(
      STATUS_TABS.map(t =>
        supabase.from('admin_support_tickets').select('id', { count: 'exact', head: true }).eq('status', t.value)
      )
    );
    const c: Record<string, number> = {};
    STATUS_TABS.forEach((t, i) => { c[t.value] = results[i].count || 0; });
    setCounts(c);
  }, []);

  useEffect(() => { fetchTickets(); }, [fetchTickets]);
  useEffect(() => { fetchCounts(); }, [fetchCounts]);
  useEffect(() => { setPage(0); }, [activeTab, search]);

  const quickStatusUpdate = async (ticket: Ticket, newStatus: string) => {
    setUpdatingId(ticket.id);
    const previousStatus = ticket.status;
    const { error } = await supabase.from('admin_support_tickets').update({ status: newStatus }).eq('id', ticket.id);
    if (!error) {
      await supabase.from('admin_ticket_messages').insert({
        ticket_id: ticket.id, created_by: user!.id,
        message: `Ticket status changed to "${newStatus}"`, is_internal: true,
      });
      toast.success(`Ticket #${ticket.ticket_number} → ${newStatus.replace('_', ' ')}`);

      // Fire customer notification on transition INTO 'resolved' (idempotent: skip if already resolved)
      if (newStatus === 'resolved' && previousStatus !== 'resolved' && ticket.created_by) {
        const t: any = ticket;
        supabase.functions.invoke('notify-event', {
          body: {
            event: 'ai_ticket_resolved',
            user_id: ticket.created_by,
            data: {
              ticket_id: ticket.id,
              ticket_code: (ticket as any).ticket_code || `TK-${ticket.ticket_number}`,
              issue_type: ticket.issue_type,
              resolution_message: t.resolution_message || t.resolution_notes || null,
            },
            idempotencyKey: `ai_ticket_resolved:${ticket.id}`,
          },
        }).catch((e) => console.error('[notify-event] resolved invoke failed', e));
      }

      fetchTickets();
      fetchCounts();
    } else {
      toast.error('Failed to update');
    }
    setUpdatingId(null);
  };

  const validateForm = (): string | null => {
    if (!formIssueType) return 'Select an issue type';

    switch (formIssueType) {
      case 'deposit_not_reflected':
        if (!formDepositId.trim()) return 'Deposit ID is required';
        if (!formDepositId.trim().startsWith('DEP-')) return 'Deposit ID must start with "DEP-"';
        if (formDepositId.trim().length < 10) return 'Deposit ID must be at least 10 characters';
        break;
      case 'order_not_delivered':
        if (!formOrderId.trim()) return 'Order ID is required';
        if (!formOrderId.trim().startsWith('ORD-')) return 'Order ID must start with "ORD-"';
        if (!formRecipientNumber.trim()) return 'Recipient number is required';
        if (!/^0[235]\d{8}$/.test(formRecipientNumber.trim())) return 'Invalid Ghana phone number (10 digits, starts with 02/03/05)';
        break;
      case 'order_not_created':
        if (!formPaymentNumber.trim()) return 'Payment number is required';
        if (!/^0[235]\d{8}$/.test(formPaymentNumber.trim())) return 'Invalid Ghana phone number';
        if (!formPaymentDate) return 'Payment date is required';
        if (!formPaymentTime) return 'Payment time is required';
        if (!formSelectedProductId) return 'Select a bundle';
        if (expectedAmount == null) return 'Could not calculate expected amount for this bundle';
        break;
      case 'wallet_issue':
        if (!formWalletDesc.trim()) return 'Short description is required';
        break;
      case 'account_issue':
        if (!formAccountId.trim()) return 'Account identifier is required';
        if (!formAccountDesc.trim()) return 'Short description is required';
        break;
    }
    return null;
  };

  const handleCreate = async () => {
    const err = validateForm();
    if (err) { toast.error(err); return; }
    setCreating(true);

    let reference_type = 'none';
    let reference_value: string | null = null;
    let linked_order_id: string | null = null;
    let linked_deposit_id: string | null = null;
    let linked_user_id: string | null = null;
    let linkMsg = '';
    let ticket_metadata: Record<string, any> = {};

    switch (formIssueType) {
      case 'deposit_not_reflected':
        reference_type = 'deposit';
        reference_value = formDepositId.trim();
        const { data: dep } = await supabase.from('paystack_payments')
          .select('id, user_id, reference')
          .eq('reference', reference_value)
          .limit(1).maybeSingle();
        if (dep) {
          linked_deposit_id = dep.id;
          linked_user_id = dep.user_id;
          linkMsg = `Linked to deposit ${dep.id.substring(0, 12)}`;
        }
        break;

      case 'order_not_delivered':
        reference_type = 'order';
        reference_value = formOrderId.trim();
        ticket_metadata.recipient_number = formRecipientNumber.trim();
        const { data: order } = await supabase.from('orders')
          .select('id, order_id, user_id')
          .eq('order_id', reference_value)
          .limit(1).maybeSingle();
        if (order) {
          linked_order_id = order.order_id || order.id;
          linked_user_id = order.user_id;
          linkMsg = `Linked to order ${linked_order_id}`;
        }
        break;

      case 'order_not_created':
        reference_type = 'payment_investigation';
        reference_value = formPaymentNumber.trim();
        ticket_metadata = {
          payment_number: formPaymentNumber.trim(),
          payment_date: formPaymentDate,
          payment_time: formPaymentTime,
          product_id: formSelectedProductId,
          bundle_size_gb: selectedProduct?.bundle_size_gb,
          network: selectedProduct?.network,
          bundle_label: selectedProduct ? `${selectedProduct.bundle_size_gb}GB ${selectedProduct.network}` : '',
          expected_amount: expectedAmount,
        };
        break;

      case 'wallet_issue':
        reference_type = 'wallet';
        reference_value = formWalletRef.trim() || null;
        ticket_metadata = { short_description: formWalletDesc.trim() };
        break;

      case 'account_issue':
        reference_type = 'account';
        reference_value = formAccountId.trim();
        ticket_metadata = { short_description: formAccountDesc.trim() };
        break;
    }

    const notesText = formNotes.trim() || null;

    const { data: inserted, error } = await supabase.from('admin_support_tickets').insert({
      created_by: user!.id,
      issue_type: formIssueType,
      customer_phone: formPhone.trim() || null,
      reference_type,
      reference_value,
      linked_order_id,
      linked_deposit_id,
      linked_user_id,
      notes: notesText,
      ticket_metadata,
    } as any).select('ticket_number').single();

    if (error) {
      console.error('Ticket creation error:', error);
      const reason = error.message?.includes('check constraint')
        ? 'Invalid field value (check issue type or reference type)'
        : error.message?.includes('row-level security')
        ? 'Permission denied — check your role'
        : error.message || 'Database insert failed';
      toast.error(`Ticket not created: ${reason}`);
    } else {
      const num = (inserted as any)?.ticket_number;
      toast.success(num ? `Ticket #${num} created` : 'Ticket created');
      if (linkMsg) toast.info(linkMsg);
      if (!linkMsg && reference_value && formIssueType !== 'order_not_created' && formIssueType !== 'wallet_issue' && formIssueType !== 'account_issue') {
        toast.info('No matching record found for the reference provided');
      }
      setShowCreate(false);
      resetForm();
      fetchTickets();
      fetchCounts();
    }
    setCreating(false);
  };

  const resetForm = () => {
    setFormIssueType('');
    setFormPhone('');
    setFormNotes('');
    setFormDepositId('');
    setFormOrderId('');
    setFormRecipientNumber('');
    setFormPaymentNumber('');
    setFormPaymentDate('');
    setFormPaymentTime('');
    setFormSelectedProductId('');
    setFormWalletRef('');
    setFormWalletDesc('');
    setFormAccountId('');
    setFormAccountDesc('');
  };

  const copyText = (text: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigator.clipboard.writeText(text);
    toast.success('Copied');
  };

  const issueLabel = (val: string) => ISSUE_TYPES.find(t => t.value === val)?.label || val;
  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  // Group products by network for the dropdown
  const networkGroups = ['MTN', 'Telecel', 'AirtelTigo'];

  const renderIssueFields = () => {
    switch (formIssueType) {
      case 'deposit_not_reflected':
        return (
          <div>
            <Label className="text-xs font-semibold">Deposit ID *</Label>
            <Input className="h-9 mt-1" placeholder="DEP-123456789" value={formDepositId} onChange={e => setFormDepositId(e.target.value)} />
            <p className="text-[10px] text-muted-foreground mt-1">Must start with DEP- (at least 10 characters)</p>
          </div>
        );

      case 'order_not_delivered':
        return (
          <>
            <div>
              <Label className="text-xs font-semibold">Order ID *</Label>
              <Input className="h-9 mt-1" placeholder="ORD-123456789" value={formOrderId} onChange={e => setFormOrderId(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs font-semibold">Recipient Number *</Label>
              <Input className="h-9 mt-1" placeholder="0551234567" value={formRecipientNumber} onChange={e => setFormRecipientNumber(e.target.value)} />
            </div>
          </>
        );

      case 'order_not_created':
        return (
          <>
            <div>
              <Label className="text-xs font-semibold">Payment Number (MoMo) *</Label>
              <Input className="h-9 mt-1" placeholder="0551234567" value={formPaymentNumber} onChange={e => setFormPaymentNumber(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs font-semibold">Date *</Label>
                <Input type="date" className="h-9 mt-1" value={formPaymentDate} onChange={e => setFormPaymentDate(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs font-semibold">Time *</Label>
                <Input type="time" className="h-9 mt-1" value={formPaymentTime} onChange={e => setFormPaymentTime(e.target.value)} />
              </div>
            </div>
            <div>
              <Label className="text-xs font-semibold">Bundle/GB Purchased *</Label>
              <Select value={formSelectedProductId} onValueChange={setFormSelectedProductId}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select bundle" /></SelectTrigger>
                <SelectContent>
                  {networkGroups.map(net => {
                    const netProducts = products.filter(p => p.network === net);
                    if (netProducts.length === 0) return null;
                    return netProducts.map(p => {
                      const price = serverPrices[p.id];
                      return (
                        <SelectItem key={p.id} value={p.id}>
                          {p.bundle_size_gb}GB {net}{price != null ? ` — GHS ${price.toFixed(2)}` : ''}
                        </SelectItem>
                      );
                    });
                  })}
                </SelectContent>
              </Select>
            </div>
            {expectedAmount != null && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm">
                <span className="text-muted-foreground text-xs">Expected Amount:</span>
                <span className="font-bold ml-2">GHS {expectedAmount.toFixed(2)}</span>
              </div>
            )}
          </>
        );

      case 'wallet_issue':
        return (
          <>
            <div>
              <Label className="text-xs font-semibold">Wallet Transaction Reference</Label>
              <Input className="h-9 mt-1" placeholder="WAL-123456" value={formWalletRef} onChange={e => setFormWalletRef(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs font-semibold">Short Description *</Label>
              <Input className="h-9 mt-1" placeholder="Brief wallet issue description" value={formWalletDesc} onChange={e => setFormWalletDesc(e.target.value)} />
            </div>
          </>
        );

      case 'account_issue':
        return (
          <>
            <div>
              <Label className="text-xs font-semibold">Account Identifier (email or username) *</Label>
              <Input className="h-9 mt-1" placeholder="user@example.com or username" value={formAccountId} onChange={e => setFormAccountId(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs font-semibold">Short Description *</Label>
              <Input className="h-9 mt-1" placeholder="Brief issue description" value={formAccountDesc} onChange={e => setFormAccountDesc(e.target.value)} />
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold">Support Tickets</h2>
            <p className="text-muted-foreground text-sm">WhatsApp escalation tracking</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> New Ticket
            </Button>
            <Button variant="outline" size="sm" onClick={() => { fetchTickets(); fetchCounts(); }}>
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 overflow-x-auto">
          {STATUS_TABS.map(tab => {
            const Icon = tab.icon;
            const count = counts[tab.value] || 0;
            return (
              <button
                key={tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                {count > 0 && (
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    activeTab === tab.value ? 'bg-primary-foreground/20' : 'bg-muted'
                  }`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by phone, reference, ticket #, or issue..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-9 text-sm"
          />
        </div>

        {/* Ticket table */}
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12">
            <AlertCircle className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No tickets in this tab</p>
          </div>
        ) : (
          <>
            {/* Desktop table header */}
            <div className="hidden md:grid grid-cols-[60px_1fr_120px_130px_180px_120px_130px_110px] gap-2 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
              <span>Ticket #</span>
              <span>Issue Type</span>
              <span>Status</span>
              <span>Phone</span>
              <span>Reference</span>
              <span>Created</span>
              <span>Assigned</span>
              <span>Action</span>
            </div>

            <div className="space-y-1">
              {tickets.map(ticket => {
                const meta = ticket.ticket_metadata || {};
                const isONC = ticket.issue_type === 'order_not_created';
                return (
                <div
                  key={ticket.id}
                  className="bg-card rounded-xl border border-border hover:bg-muted/30 transition-all duration-150"
                >
                  {/* Desktop row */}
                  <div className="hidden md:grid grid-cols-[60px_1fr_120px_130px_180px_120px_130px_110px] gap-2 px-4 py-3 items-center cursor-pointer"
                    onClick={() => navigate(`/admin/support-tickets/${ticket.id}`)}
                  >
                    <span className="text-sm font-extrabold text-foreground">#{ticket.ticket_number}</span>
                    <div className="min-w-0">
                      <span className="text-xs font-medium truncate block">{issueLabel(ticket.issue_type)}</span>
                      {isONC && meta.bundle_label && (
                        <span className="text-[10px] text-muted-foreground block truncate">
                          {meta.payment_number} · {meta.bundle_label}{meta.expected_amount ? ` · GHS ${Number(meta.expected_amount).toFixed(2)}` : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full w-fit ${
                        ticket.status === 'new' ? 'bg-sky-500/10 text-sky-600' :
                        ticket.status === 'in_progress' ? 'bg-amber-500/10 text-amber-600' :
                        ticket.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-600' :
                        'bg-muted text-muted-foreground'
                      }`}>
                        {STATUS_TABS.find(s => s.value === ticket.status)?.label || ticket.status}
                      </span>
                      {isONC && ticket.verification_status === 'confirmed' && (
                        <span className="text-[9px] font-bold text-emerald-600">✓ Payment Confirmed</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {ticket.customer_phone || '—'}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono truncate">
                      {ticket.reference_value ? ticket.reference_value.substring(0, 20) : '—'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {format(new Date(ticket.created_at), 'MMM d, h:mm a')}
                    </span>
                    <span className="text-xs text-muted-foreground truncate">
                      {ticket.assigned_to ? (staffProfiles[ticket.assigned_to] || ticket.assigned_to.substring(0, 8)) : '—'}
                    </span>
                    <div onClick={e => e.stopPropagation()}>
                      {ticket.status === 'new' && (
                        <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" disabled={updatingId === ticket.id}
                          onClick={() => quickStatusUpdate(ticket, 'in_progress')}>
                          In Progress
                        </Button>
                      )}
                      {ticket.status === 'in_progress' && (
                        <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" disabled={updatingId === ticket.id}
                          onClick={() => quickStatusUpdate(ticket, 'resolved')}>
                          Resolve
                        </Button>
                      )}
                      {ticket.status === 'resolved' && (
                        <Button size="sm" variant="outline" className="h-7 text-[10px] px-2" disabled={updatingId === ticket.id}
                          onClick={() => quickStatusUpdate(ticket, 'closed')}>
                          Close
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Mobile card */}
                  <div className="md:hidden p-4" onClick={() => navigate(`/admin/support-tickets/${ticket.id}`)}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-extrabold">#{ticket.ticket_number}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            ticket.status === 'new' ? 'bg-sky-500/10 text-sky-600' :
                            ticket.status === 'in_progress' ? 'bg-amber-500/10 text-amber-600' :
                            ticket.status === 'resolved' ? 'bg-emerald-500/10 text-emerald-600' :
                            'bg-muted text-muted-foreground'
                          }`}>
                            {STATUS_TABS.find(s => s.value === ticket.status)?.label}
                          </span>
                          {isONC && ticket.verification_status === 'confirmed' && (
                            <span className="text-[9px] font-bold text-emerald-600">✓ Confirmed</span>
                          )}
                        </div>
                        <p className="text-xs font-medium">{issueLabel(ticket.issue_type)}</p>
                        {isONC && meta.bundle_label && (
                          <p className="text-[10px] text-muted-foreground mt-0.5">{meta.payment_number} · {meta.bundle_label}{meta.expected_amount ? ` · GHS ${Number(meta.expected_amount).toFixed(2)}` : ''}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground flex-wrap">
                          {ticket.customer_phone && <span>📞 {ticket.customer_phone}</span>}
                          {ticket.reference_value && <span className="font-mono truncate max-w-[140px]">🔗 {ticket.reference_value.substring(0, 16)}</span>}
                        </div>
                      </div>
                      <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                        {format(new Date(ticket.created_at), 'MMM d')}
                      </span>
                    </div>
                    <div className="mt-2" onClick={e => e.stopPropagation()}>
                      {ticket.status === 'new' && (
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={updatingId === ticket.id}
                          onClick={() => quickStatusUpdate(ticket, 'in_progress')}>
                          Mark In Progress
                        </Button>
                      )}
                      {ticket.status === 'in_progress' && (
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={updatingId === ticket.id}
                          onClick={() => quickStatusUpdate(ticket, 'resolved')}>
                          Mark Resolved
                        </Button>
                      )}
                      {ticket.status === 'resolved' && (
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" disabled={updatingId === ticket.id}
                          onClick={() => quickStatusUpdate(ticket, 'closed')}>
                          Close Ticket
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
              })}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <p className="text-xs text-muted-foreground">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount}
                </p>
                <div className="flex gap-1">
                  <Button size="sm" variant="outline" className="h-7 px-2" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <span className="text-xs flex items-center px-2">{page + 1} / {totalPages}</span>
                  <Button size="sm" variant="outline" className="h-7 px-2" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Create Ticket Dialog */}
      <Dialog open={showCreate} onOpenChange={(open) => { setShowCreate(open); if (!open) resetForm(); }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>New Support Ticket</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <Label className="text-xs font-semibold">Issue Type *</Label>
              <Select value={formIssueType} onValueChange={(v) => { setFormIssueType(v); setFormSelectedProductId(''); }}>
                <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select issue type" /></SelectTrigger>
                <SelectContent>
                  {ISSUE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold">Customer Phone</Label>
              <Input className="h-9 mt-1" placeholder="0551234567 (optional)" value={formPhone} onChange={e => setFormPhone(e.target.value)} />
            </div>

            {formIssueType && renderIssueFields()}

            <div>
              <Label className="text-xs font-semibold">Internal Note to Admin</Label>
              <Textarea className="mt-1 text-sm" placeholder="Brief description of the issue..." rows={3} value={formNotes} onChange={e => setFormNotes(e.target.value)} />
            </div>

            <Button className="w-full" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating...' : 'Create Ticket'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminSupportTickets;
