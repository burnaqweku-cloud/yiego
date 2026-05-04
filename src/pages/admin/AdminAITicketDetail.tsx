import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import SEOHead from '@/components/seo/SEOHead';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  ArrowLeft, Copy, Clock, CheckCircle, AlertCircle, XCircle,
  Bot, User, CheckCircle2, Loader2, ExternalLink, Image as ImageIcon, Phone, ShieldAlert, Wallet, CreditCard, MessageCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

const ISSUE_LABELS: Record<string, string> = {
  order_not_created: 'Order Not Created',
  deposit_not_reflected: 'Deposit Not Reflected',
  order_not_delivered: 'Order Issue',
  account_issue: 'Account / Access Issue',
  other: 'Other',
};

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  new: { label: 'New', icon: AlertCircle, className: 'bg-sky-500/10 text-sky-600' },
  in_progress: { label: 'In Progress', icon: Clock, className: 'bg-amber-500/10 text-amber-600' },
  resolved: { label: 'Resolved', icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-600' },
  closed: { label: 'Closed', icon: XCircle, className: 'bg-muted text-muted-foreground' },
};

const RESOLUTION_OPTIONS: Record<string, { code: string; label: string; message: string }[]> = {
  order_not_created: [
    { code: 'order_created_now', label: 'Order Created Now', message: 'Your order has now been created successfully. Please check your orders page for details.' },
    { code: 'order_already_exists', label: 'Order Already Exists', message: 'We found that your order was already created. Please check your orders page or use the Track Order feature to view its status.' },
    { code: 'payment_not_verified', label: 'Payment Not Verified', message: 'We were unable to verify your payment. Please double-check your MoMo transaction history and ensure the payment was completed.' },
    { code: 'more_details_required', label: 'More Details Needed', message: 'We need additional information to resolve your issue. Please provide your exact MoMo transaction reference, the amount debited, and a clear screenshot.' },
    { code: 'escalated', label: 'Escalated', message: 'Your case has been escalated to our senior support team for further investigation. We will update you shortly.' },
  ],
  deposit_not_reflected: [
    { code: 'credited_successfully', label: 'Credited Successfully', message: 'Your wallet has been credited successfully. Please check your wallet balance.' },
    { code: 'deposit_not_found', label: 'Deposit Not Found', message: 'We could not find a matching deposit in our system. Please confirm the payment reference and ensure the payment was completed.' },
    { code: 'payment_pending', label: 'Payment Still Pending', message: 'Your payment is still being processed. This can take a few minutes. Please check back shortly.' },
    { code: 'more_details_required', label: 'More Details Needed', message: 'We need additional information to locate your deposit. Please provide the exact reference number and the amount.' },
    { code: 'escalated', label: 'Escalated', message: 'Your deposit case has been escalated for manual verification. We will update you shortly.' },
  ],
  order_not_delivered: [
    { code: 'delivered_confirmed', label: 'Delivered Confirmed', message: 'Your data bundle has been delivered successfully. Please check your phone to confirm.' },
    { code: 'still_processing_normal', label: 'Normal Processing', message: 'Your order is still being processed. AirtelTigo and Telecel orders may take a bit longer.' },
    { code: 'reprocessed', label: 'Reprocessed', message: 'Your order has been reprocessed and should be delivered shortly.' },
    { code: 'more_details_required', label: 'More Details Needed', message: 'We need more information about your order issue. Please provide the order ID.' },
    { code: 'escalated', label: 'Escalated', message: 'Your order issue has been escalated to our technical team. We will update you shortly.' },
  ],
  account_issue: [
    { code: 'resolved', label: 'Resolved', message: 'Your account issue has been resolved. Please try logging in again.' },
    { code: 'password_reset_sent', label: 'Password Reset Sent', message: 'A password reset link has been sent to your email.' },
    { code: 'more_details_required', label: 'More Details Needed', message: 'We need more information to resolve your account issue.' },
    { code: 'escalated', label: 'Escalated', message: 'Your account issue has been escalated for review.' },
  ],
};

const DEFAULT_RESOLUTIONS = [
  { code: 'more_details_required', label: 'More Details Needed', message: 'We need additional information to resolve your issue.' },
  { code: 'escalated', label: 'Escalated', message: 'Your case has been escalated for further investigation.' },
  { code: 'resolved_generic', label: 'Resolved', message: 'Your issue has been resolved.' },
];

const AdminAITicketDetail = () => {
  const { ticketId } = useParams<{ ticketId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [ticket, setTicket] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [assignedAdminName, setAssignedAdminName] = useState<string | null>(null);
  const [customDetailsMsg, setCustomDetailsMsg] = useState('');
  const [activeScreenshot, setActiveScreenshot] = useState('');
  const [showCustomDetails, setShowCustomDetails] = useState(false);

  const fetchTicket = useCallback(async () => {
    if (!ticketId) return;
    setLoading(true);

    const { data, error } = await (supabase.from('admin_support_tickets') as any)
      .select('*')
      .eq('id', ticketId)
      .maybeSingle();

    if (error || !data) {
      toast.error('Ticket not found');
      navigate('/admin/ai-cases');
      return;
    }
    setTicket(data);

    if (data.assigned_to) {
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', data.assigned_to).maybeSingle();
      setAssignedAdminName((prof as any)?.full_name || 'Admin');
    } else {
      setAssignedAdminName(null);
    }

    setLoading(false);
  }, [ticketId, navigate]);

  useEffect(() => { fetchTicket(); }, [fetchTicket]);

  const handleResolve = async (code: string, message: string) => {
    if (!ticketId) return;
    setResolving(true);
    const newStatus = code === 'more_details_required' ? 'in_progress' : 'resolved';
    const { error } = await (supabase.from('admin_support_tickets') as any)
      .update({
        status: newStatus,
        resolution_code: code,
        resolution_message: message,
        user_notified: false,
      })
      .eq('id', ticketId);
    if (!error) {
      toast.success(`Ticket updated → ${newStatus}`);
      setShowCustomDetails(false);
      setCustomDetailsMsg('');
      fetchTicket();
    } else {
      toast.error('Failed to resolve ticket');
    }
    setResolving(false);
  };

  const handleCustomDetailsSubmit = async () => {
    const msg = customDetailsMsg.trim();
    if (!msg) return;
    // Send as a professional message
    const professionalMsg = `We need some additional details to resolve your issue: ${msg}`;
    await handleResolve('more_details_required', professionalMsg);
  };

  const handleTakeTicket = async () => {
    if (!ticketId || !user) return;
    const { error } = await (supabase.from('admin_support_tickets') as any)
      .update({ status: 'in_progress', assigned_to: user.id })
      .eq('id', ticketId);
    if (!error) {
      toast.success('Ticket assigned to you');
      fetchTicket();
    }
  };

  const handleManagerReview = async () => {
    if (!ticketId) return;
    const { error } = await (supabase.from('admin_support_tickets') as any)
      .update({ manager_review: true, resolution_message: 'Your issue is being reviewed further by our team. We will update you shortly.', user_notified: false })
      .eq('id', ticketId);
    if (!error) {
      toast.success('Flagged for manager review');
      fetchTicket();
    }
  };

  const handleCloseTicket = async () => {
    if (!ticketId) return;
    const { error } = await (supabase.from('admin_support_tickets') as any)
      .update({ status: 'closed' })
      .eq('id', ticketId);
    if (!error) {
      toast.success('Ticket closed');
      fetchTicket();
    }
  };

  const copyText = (text: string) => { navigator.clipboard.writeText(text); toast.success('Copied'); };

  // Back navigation: return to the correct tab
  const handleBack = () => {
    const fromTab = searchParams.get('from');
    if (fromTab === 'manager_review') {
      navigate('/admin/manager-review');
    } else if (fromTab === 'archive') {
      navigate('/admin/ai-cases?view=archive');
    } else if (fromTab) {
      navigate(`/admin/ai-cases?status=${fromTab}`);
    } else {
      navigate('/admin/ai-cases');
    }
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
  const resolutions = RESOLUTION_OPTIONS[ticket.issue_type] || DEFAULT_RESOLUTIONS;
  const canResolve = ticket.status === 'new' || ticket.status === 'in_progress';
  const displayCode = ticket.ticket_code || `#${ticket.ticket_number}`;

  const recipientNumber = meta.recipient_number || meta.phone_number || ticket.customer_phone;
  const screenshotUrl = meta.screenshot_url || meta.screenshot;
  const userProvidedDate = meta.transaction_date;
  const userProvidedTime = meta.transaction_time;

  // Deposit-related quick actions
  const isDepositTicket = ticket.issue_type === 'deposit_not_reflected';
  const depositRef = ticket.reference_value || meta.reference;

  return (
    <AdminLayout>
      <SEOHead title={`AI Ticket ${displayCode} | Admin`} description="AI support ticket detail" path={`/admin/ai-cases/${ticketId}`} noIndex />

      <div className="space-y-5 max-w-4xl">
        {/* Back button */}
        <button onClick={handleBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to AI Tickets
        </button>

        {/* Ticket Header */}
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Bot className="w-5 h-5 text-primary" />
                <h1 className="text-2xl font-display font-extrabold">Ticket {displayCode}</h1>
              </div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full ${st.className}`}>
                  <StatusIcon className="w-3.5 h-3.5" />
                  {st.label}
                </span>
                <span className="text-xs bg-secondary text-secondary-foreground px-2 py-0.5 rounded-full font-medium">
                  {ISSUE_LABELS[ticket.issue_type] || ticket.issue_type}
                </span>
                <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                  AI Escalation
                </span>
                {meta.is_agent && (
                  <span className="text-[10px] border border-primary/30 text-primary px-2 py-0.5 rounded-full font-bold">🏪 Agent</span>
                )}
                {meta.order_source === 'agent_store' && (
                  <span className="text-[10px] bg-amber-500/10 text-amber-700 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">On behalf of customer</span>
                )}
                {ticket.manager_review && (
                  <span className="text-[10px] bg-amber-500/10 text-amber-700 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold">
                    ⚠ Manager Review
                  </span>
                )}
              </div>
              {assignedAdminName && (
                <div className="flex items-center gap-1.5 mt-1">
                  <User className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Assigned to:</span>
                  <span className="text-xs font-semibold">{assignedAdminName}</span>
                </div>
              )}
            </div>
            <div className="flex gap-2 flex-wrap">
              {ticket.status === 'new' && (
                <Button size="sm" variant="outline" onClick={handleTakeTicket}>
                  <Clock className="w-3.5 h-3.5 mr-1" /> Take
                </Button>
              )}
              {(ticket.status === 'in_progress') && !ticket.manager_review && (
                <Button size="sm" variant="outline" className="text-amber-600 border-amber-300 hover:bg-amber-50" onClick={handleManagerReview}>
                  <ShieldAlert className="w-3.5 h-3.5 mr-1" /> Manager Review
                </Button>
              )}
              {ticket.status === 'resolved' && (
                <Button size="sm" variant="outline" onClick={handleCloseTicket}>
                  <XCircle className="w-3.5 h-3.5 mr-1" /> Close
                </Button>
              )}
              {meta.conversation_id && (
                <Button size="sm" variant="outline" className="text-primary border-primary/30 hover:bg-primary/5" onClick={() => navigate(`/admin/ai-monitor?conv=${meta.conversation_id}`)}>
                  <MessageCircle className="w-3.5 h-3.5 mr-1" /> Open Conversation
                </Button>
              )}
              {ticket.linked_case_id && !meta.conversation_id && (
                <Button size="sm" variant="outline" className="text-primary border-primary/30 hover:bg-primary/5" onClick={() => navigate(`/admin/ai-monitor?conv=${ticket.linked_case_id}`)}>
                  <MessageCircle className="w-3.5 h-3.5 mr-1" /> Open Conversation
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Customer Details Section */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <Phone className="w-4 h-4 text-primary" />
            Customer Details
          </h3>
          <div className="space-y-2 text-sm">
            {recipientNumber && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-muted-foreground text-xs w-28 shrink-0">Recipient:</span>
                <span className="font-mono font-semibold">{recipientNumber}</span>
                <button onClick={() => copyText(recipientNumber)} className="text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition-colors" title="Copy number">
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => navigate(`/admin/transactions?phone=${encodeURIComponent(recipientNumber)}`)}
                  className="text-primary hover:text-primary/80 p-1 rounded hover:bg-primary/10 transition-colors flex items-center gap-1 text-xs"
                  title="Search in transactions"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Transactions</span>
                </button>
              </div>
            )}
            {ticket.customer_phone && ticket.customer_phone !== recipientNumber && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs w-28 shrink-0">Phone:</span>
                <span className="font-medium">{ticket.customer_phone}</span>
                <button onClick={() => copyText(ticket.customer_phone)} className="text-muted-foreground hover:text-foreground p-1"><Copy className="w-3 h-3" /></button>
              </div>
            )}
            {ticket.customer_email && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs w-28 shrink-0">Email:</span>
                <span className="font-medium">{ticket.customer_email}</span>
              </div>
            )}
            {ticket.reference_value && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs w-28 shrink-0">Reference:</span>
                <span className="font-mono font-medium text-xs">{ticket.reference_value}</span>
                <button onClick={() => copyText(ticket.reference_value)} className="text-muted-foreground hover:text-foreground p-1"><Copy className="w-3 h-3" /></button>
              </div>
            )}
            {ticket.linked_order_id && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs w-28 shrink-0">Order:</span>
                <span className="font-mono font-medium text-xs">{ticket.linked_order_id}</span>
                <button onClick={() => copyText(ticket.linked_order_id)} className="text-muted-foreground hover:text-foreground p-1"><Copy className="w-3 h-3" /></button>
                <button
                  onClick={() => navigate(`/admin/orders?search=${encodeURIComponent(ticket.linked_order_id)}`)}
                  className="text-primary hover:text-primary/80 p-1 rounded hover:bg-primary/10 transition-colors flex items-center gap-1 text-xs"
                  title="Open order"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Open Order</span>
                </button>
              </div>
            )}
            {meta.reference && !ticket.linked_order_id && meta.reference.startsWith('DS-') && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs w-28 shrink-0">Order (meta):</span>
                <span className="font-mono font-medium text-xs">{meta.reference}</span>
                <button
                  onClick={() => navigate(`/admin/orders?search=${encodeURIComponent(meta.reference)}`)}
                  className="text-primary hover:text-primary/80 p-1 rounded hover:bg-primary/10 transition-colors flex items-center gap-1 text-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Open Order</span>
                </button>
              </div>
            )}
            {(userProvidedDate || userProvidedTime) && (
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs w-28 shrink-0">User provided:</span>
                <span className="text-xs bg-muted px-2 py-1 rounded font-medium">
                  📅 {userProvidedDate || '—'} {userProvidedTime ? `🕐 ${userProvidedTime}` : ''}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs w-28 shrink-0">Created:</span>
              <span className="text-xs">{format(new Date(ticket.created_at), 'MMM d, yyyy h:mm a')}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs w-28 shrink-0">Updated:</span>
              <span className="text-xs">{format(new Date(ticket.updated_at), 'MMM d, yyyy h:mm a')}</span>
            </div>
          </div>

          {/* Deposit Quick Actions */}
          {isDepositTicket && depositRef && (
            <div className="flex gap-2 mt-3 pt-3 border-t border-border">
              <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate(`/admin/deposits?search=${encodeURIComponent(depositRef)}`)}>
                <Wallet className="w-3.5 h-3.5 mr-1" /> View Deposit
              </Button>
              <Button size="sm" variant="outline" className="text-xs" onClick={() => navigate(`/admin/transactions?search=${encodeURIComponent(depositRef)}`)}>
                <CreditCard className="w-3.5 h-3.5 mr-1" /> View Transactions
              </Button>
            </div>
          )}
        </div>

        {/* Agent Context Card */}
        {meta.is_agent && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
            <h3 className="text-sm font-bold mb-2 flex items-center gap-2">
              🏪 Agent Ticket
            </h3>
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground text-xs w-28 shrink-0">Submitted by:</span>
                <span className="font-semibold text-xs">Agent</span>
              </div>
              {meta.order_source === 'agent_store' && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs w-28 shrink-0">On behalf of:</span>
                  <span className="font-semibold text-xs">Customer (via agent store)</span>
                </div>
              )}
              {meta.order_source && meta.order_source !== 'agent_store' && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs w-28 shrink-0">Order source:</span>
                  <span className="font-semibold text-xs capitalize">{meta.order_source}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Screenshot / Evidence Section */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-primary" />
            Evidence
          </h3>
          {(() => {
            // Collect all screenshot URLs
            const urls: string[] = [];
            if (screenshotUrl) urls.push(screenshotUrl);
            if (meta.screenshots && Array.isArray(meta.screenshots)) {
              meta.screenshots.forEach((u: string) => { if (u && !urls.includes(u)) urls.push(u); });
            }

            if (urls.length > 0) {
              return (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {urls.map((url, idx) => (
                      <div
                        key={idx}
                        className="relative rounded-lg overflow-hidden border border-border cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => { setScreenshotOpen(true); setActiveScreenshot(url); }}
                      >
                        <img
                          src={url}
                          alt={`Evidence ${idx + 1}`}
                          className="w-full h-32 object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).parentElement!.innerHTML = '<div class="w-full h-32 flex items-center justify-center bg-muted text-muted-foreground text-xs">Image unavailable</div>';
                          }}
                        />
                        <div className="absolute inset-0 bg-black/10 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                          <span className="text-white text-xs font-bold bg-black/50 px-3 py-1 rounded-full">Expand</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Dialog open={screenshotOpen} onOpenChange={setScreenshotOpen}>
                    <DialogContent className="max-w-3xl p-2">
                      <img src={activeScreenshot} alt="Screenshot full" className="w-full h-auto rounded-lg" />
                    </DialogContent>
                  </Dialog>
                </div>
              );
            }

            if (meta.has_screenshot) {
              return <p className="text-xs text-muted-foreground">📸 Screenshot was mentioned but URL not available</p>;
            }

            return <p className="text-xs text-muted-foreground italic">No screenshot provided</p>;
          })()}
        </div>

        {/* AI Context Card */}
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center gap-2 mb-3">
            <Bot className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold">AI Summary</h3>
          </div>
          <div className="space-y-3">
            {meta.ai_summary && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Summary</p>
                <p className="text-sm bg-primary/5 rounded-lg p-3">{meta.ai_summary}</p>
              </div>
            )}
            {meta.user_message && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">User's Message</p>
                <p className="text-sm bg-muted/50 rounded-lg p-3 italic">"{meta.user_message}"</p>
              </div>
            )}
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {meta.transaction_reference && <span className="bg-muted px-2 py-0.5 rounded font-mono">🔗 {meta.transaction_reference}</span>}
              {meta.amount && <span className="bg-muted px-2 py-0.5 rounded">💰 GHS {meta.amount}</span>}
              {meta.order_source && <span className="bg-muted px-2 py-0.5 rounded">🏪 {meta.order_source}</span>}
            </div>
          </div>
        </div>

        {/* Resolution — shown if already resolved */}
        {ticket.resolution_code && (
          <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-emerald-700">Resolution Applied</h3>
            </div>
            <p className="text-sm">{ticket.resolution_message || ticket.resolution_code}</p>
          </div>
        )}

        {/* Resolution Actions */}
        {canResolve && (
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-sm font-bold mb-3">Resolution Actions</h3>
            <p className="text-xs text-muted-foreground mb-3">Select a structured resolution to send back to the user via the AI chatbot:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {resolutions.filter(r => r.code !== 'more_details_required').map(r => (
                <Button
                  key={r.code}
                  size="sm"
                  variant="outline"
                  className="text-xs h-auto py-2.5 px-3 justify-start text-left"
                  disabled={resolving}
                  onClick={() => handleResolve(r.code, r.message)}
                >
                  {resolving ? (
                    <Loader2 className="w-3 h-3 animate-spin mr-1.5 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-3 h-3 mr-1.5 shrink-0 text-primary" />
                  )}
                  {r.label}
                </Button>
              ))}
            </div>

            {/* More Details Needed — with custom message option */}
            <div className="mt-3 pt-3 border-t border-border">
              {!showCustomDetails ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs"
                    disabled={resolving}
                    onClick={() => {
                      const defaultMsg = resolutions.find(r => r.code === 'more_details_required')?.message || 'We need additional information to resolve your issue.';
                      handleResolve('more_details_required', defaultMsg);
                    }}
                  >
                    <AlertCircle className="w-3 h-3 mr-1.5 text-amber-500" />
                    More Details Needed
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-xs text-muted-foreground"
                    onClick={() => setShowCustomDetails(true)}
                  >
                    Custom message →
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-medium">Specify what details are needed:</p>
                  <Input
                    placeholder="e.g. Send exact time and screenshot"
                    value={customDetailsMsg}
                    onChange={e => setCustomDetailsMsg(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCustomDetailsSubmit()}
                    className="h-9 text-sm"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" className="text-xs" disabled={!customDetailsMsg.trim() || resolving} onClick={handleCustomDetailsSubmit}>
                      {resolving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
                      Send Request
                    </Button>
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setShowCustomDetails(false); setCustomDetailsMsg(''); }}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminAITicketDetail;
