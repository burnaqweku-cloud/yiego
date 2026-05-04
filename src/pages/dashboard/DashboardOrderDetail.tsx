import { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useUserOrders } from '@/hooks/useUserOrders';
import { formatPrice, NETWORK_COLORS, type Network } from '@/data/bundles';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Copy, RefreshCw, CheckCircle, Clock, XCircle, AlertCircle, Smartphone, Gift, Pencil, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import NonExpiryBadge from '@/components/bundles/NonExpiryBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import OrderTracker from '@/components/delivery/OrderTracker';

const DashboardOrderDetail = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const { orders, loading, refresh } = useUserOrders();
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ network: 'MTN', phone: '' });
  const [editSaving, setEditSaving] = useState(false);

  const order = orders.find((o) => o.order_id === orderId);
  const isReward = (order as any)?.order_type === 'reward';
  const isPendingApproval = order?.status === 'Pending Approval';

  const copyId = () => {
    if (orderId) { navigator.clipboard.writeText(orderId); toast.success('Order ID copied'); }
  };

  const handleReorder = () => {
    if (!order) return;
    sessionStorage.setItem('yiego_reorder', JSON.stringify({ network: order.network, recipientPhone: order.recipient_number }));
    navigate('/dashboard/buy');
  };

  const openEdit = () => {
    if (!order) return;
    setEditForm({ network: order.network, phone: order.recipient_number });
    setEditOpen(true);
  };

  const handleEditSave = async () => {
    if (!order) return;
    const cleaned = editForm.phone.replace(/\s+/g, '').replace(/^\+233/, '0');
    if (!/^0[235][0-9]{8}$/.test(cleaned)) {
      toast.error('Enter a valid Ghana phone number');
      return;
    }
    setEditSaving(true);
    try {
      // Update the order recipient
      await supabase.from('orders').update({
        recipient_number: cleaned,
        network: editForm.network,
      }).eq('order_id', order.order_id);

      // Also update the reward_claim if linked
      const rewardClaimId = (order as any).reward_claim_id;
      if (rewardClaimId) {
        await supabase.from('reward_claims').update({
          phone: cleaned,
          network: editForm.network,
        }).eq('id', rewardClaimId).eq('status', 'pending_admin');
      }

      toast.success('Recipient updated successfully');
      setEditOpen(false);
      await refresh();
    } catch {
      toast.error('Failed to update recipient');
    }
    setEditSaving(false);
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="p-4 md:p-6 max-w-2xl space-y-4">
          <Skeleton className="h-5 w-32" />
          <div className="bg-card rounded-2xl p-5 border border-border space-y-4">
            <Skeleton className="h-6 w-40" /><Skeleton className="h-16 w-full rounded-xl" />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (!order) {
    return (
      <DashboardLayout>
        <div className="p-4 md:p-6 max-w-2xl text-center py-16">
          <AlertCircle className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground mb-4">Order not found</p>
          <Link to="/dashboard/orders"><Button variant="outline" className="btn-press">Back to Orders</Button></Link>
        </div>
      </DashboardLayout>
    );
  }

  const statusTimeline = isReward
    ? [
        { label: 'Reward Claimed',       done: true,                                             time: order.created_at },
        { label: 'Pending Admin Review', done: ['Processing', 'Delivered'].includes(order.status), time: null },
        { label: 'Processing',           done: ['Processing', 'Delivered'].includes(order.status) && order.status !== 'Pending Approval', time: null },
        { label: 'Delivered',            done: order.status === 'Delivered',                      time: order.status === 'Delivered' ? order.updated_at : null },
      ]
    : [
        { label: 'Order Placed', done: true, time: order.created_at },
        { label: 'Processing',   done: ['Processing', 'Delivered', 'Pending Approval'].includes(order.status), time: null },
        { label: 'Delivered',    done: order.status === 'Delivered', time: order.status === 'Delivered' ? order.updated_at : null },
      ];
  if (order.status === 'Failed')    statusTimeline.push({ label: 'Failed',   done: true, time: order.updated_at });
  if (order.status === 'Rejected')  statusTimeline.push({ label: 'Rejected', done: true, time: order.updated_at });

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 max-w-2xl space-y-4">
        <Link to="/dashboard/orders" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors duration-150 btn-press">
          <ArrowLeft className="w-4 h-4" /> Back to Orders
        </Link>

        {/* Header Card */}
        <div className="bg-card rounded-2xl p-5 border border-border card-shadow">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <h1 className="text-lg font-display font-bold">{order.order_id}</h1>
                {isReward && (
                  <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30">REWARD</span>
                )}
                <button onClick={copyId} className="p-1 rounded hover:bg-muted transition-colors duration-150">
                  <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                {new Date(order.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
            <StatusBadge status={order.status} />
          </div>

          {/* Bundle Info */}
          <div className="flex items-center gap-4 p-4 rounded-xl bg-secondary/50 border border-border">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-sm ${isReward ? 'bg-primary/15' : NETWORK_COLORS[order.network as Network] || 'bg-muted'}`}>
              {isReward ? <Gift className="w-6 h-6 text-primary" /> : <Smartphone className="w-6 h-6" />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-display font-bold text-lg">{isReward ? `${order.bundle_size_gb}GB Reward` : `${order.bundle_size_gb}GB ${order.network}`}</p>
              <p className="text-xs text-muted-foreground">To: {order.recipient_number}</p>
            </div>
            <p className="text-lg font-display font-bold shrink-0">{isReward ? 'Free' : formatPrice(Number(order.amount_ghs))}</p>
          </div>

          {/* Edit recipient button — only for pending reward orders */}
          {isReward && isPendingApproval && (
            <button
              onClick={openEdit}
              className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-colors border border-primary/30 hover:bg-primary/5"
            >
              <Pencil className="w-3.5 h-3.5 text-primary" />
              <span className="text-primary">Edit Recipient Number</span>
            </button>
          )}
        </div>

        {/* Reward notice */}
        {isReward && isPendingApproval && (
          <div className="bg-card rounded-2xl p-4 border border-border card-shadow">
            <p className="text-sm font-semibold text-foreground mb-1">⏳ Awaiting Admin Approval</p>
            <p className="text-xs text-muted-foreground">Your reward claim is being reviewed. Delivery will follow shortly after verification. You can edit your recipient number above while it's pending.</p>
          </div>
        )}

        {/* Details */}
        <div className="bg-card rounded-2xl p-5 border border-border card-shadow space-y-3">
          <h3 className="font-display font-semibold text-sm mb-3">Order Details</h3>
          <DetailRow label="Network">
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${NETWORK_COLORS[order.network as Network] || 'bg-muted'}`}>{order.network}</span>
          </DetailRow>
          <DetailRow label="Bundle">
            <div className="flex items-center gap-2">
              <span>{isReward ? `${order.bundle_size_gb}GB Reward` : `${order.bundle_size_gb}GB`}</span>
              {!isReward && <NonExpiryBadge size="xs" network={order.network} />}
            </div>
          </DetailRow>
          <DetailRow label="Recipient">{order.recipient_number}</DetailRow>
          <DetailRow label="Amount">{isReward ? 'Free (Referral Reward)' : formatPrice(Number(order.amount_ghs))}</DetailRow>
          <DetailRow label="Payment Method">
            <span className="capitalize text-xs font-semibold px-2 py-0.5 rounded-full bg-secondary">
              {isReward ? '🎁 Reward' : order.payment_method === 'wallet' ? '💳 Wallet' : order.payment_method === 'paystack' ? '🏦 Paystack' : order.payment_method}
            </span>
          </DetailRow>
          {/* Safe status message — never show raw supplier/failure details */}
          {order.status === 'Processing' && (
            <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mt-2">
              <p className="text-sm text-primary">Your order is processing. You will be updated shortly.</p>
            </div>
          )}
          {order.status === 'Reprocessed' && (
            <div className="bg-amber-500/5 border border-amber-500/30 rounded-lg p-3 mt-2">
              <p className="text-sm text-amber-600 dark:text-amber-400">Your order is being reprocessed and will update once completed.</p>
            </div>
          )}
          {order.status === 'Failed' && (
            <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 mt-2">
              <p className="text-sm text-destructive">We could not complete your purchase right now. Please try again or contact support.</p>
            </div>
          )}
          {order.status === 'Delivered' && order.delivery_note && (
            <DetailRow label="Note"><span className="text-xs text-muted-foreground">Delivered successfully.</span></DetailRow>
          )}
        </div>


        {/* Timeline */}
        <div className="bg-card rounded-2xl p-5 border border-border card-shadow">
          <h3 className="font-display font-semibold text-sm mb-4">Status Timeline</h3>
          <div className="space-y-0">
            {statusTimeline.map((step, i) => (
              <div key={step.label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                    step.done ? step.label === 'Failed' || step.label === 'Rejected' ? 'bg-destructive/10 border-destructive/30' : 'bg-success/10 border-success/30' : 'bg-muted border-border'
                  }`}>
                    {step.label === 'Failed' || step.label === 'Rejected' ? (
                      <XCircle className="w-4 h-4 text-destructive" />
                    ) : step.done ? (
                      <CheckCircle className="w-4 h-4 text-success" />
                    ) : (
                      <Clock className="w-4 h-4 text-muted-foreground" />
                    )}
                  </div>
                  {i < statusTimeline.length - 1 && <div className={`w-0.5 h-8 ${step.done ? 'bg-success/30' : 'bg-border'}`} />}
                </div>
                <div className="pb-6">
                  <p className={`text-sm font-medium ${step.done ? 'text-foreground' : 'text-muted-foreground'}`}>{step.label}</p>
                  {step.time && step.label !== 'Delivered' && <p className="text-xs text-muted-foreground mt-0.5">{new Date(step.time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Order-specific progress tracker for active orders */}
        {['Pending', 'Processing', 'Paid'].includes(order.status) && (
          <OrderTracker orderCreatedAt={order.created_at} orderStatus={order.status} queueState={(order as any).queue_state} />
        )}

        {order.status === 'Delivered' && !isReward && (
          <Button onClick={handleReorder} className="w-full btn-press gap-2 h-12 text-sm font-bold">
            <RefreshCw className="w-4 h-4" /> Reorder This Bundle
          </Button>
        )}
      </div>

      {/* Edit Recipient Dialog */}
      <Dialog open={editOpen} onOpenChange={(o) => { if (!editSaving) setEditOpen(o); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Edit Recipient</DialogTitle></DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Network</Label>
              <div className="grid grid-cols-3 gap-2">
                {['MTN', 'Telecel', 'AirtelTigo'].map(n => (
                  <button key={n} onClick={() => setEditForm(f => ({ ...f, network: n }))}
                    className={`py-2 rounded-lg text-xs font-semibold border transition-all ${editForm.network === n ? 'bg-primary/10 border-primary text-primary' : 'bg-secondary border-border text-muted-foreground hover:bg-muted'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Phone Number</Label>
              <Input type="tel" placeholder="0551234567" value={editForm.phone} onChange={e => setEditForm(f => ({ ...f, phone: e.target.value.replace(/[^0-9+]/g, '') }))} maxLength={13} className="h-11" />
              <p className="text-xs text-muted-foreground">Ghana format e.g. 0551234567 · Double-check before saving</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditOpen(false)} disabled={editSaving}>Cancel</Button>
              <Button className="flex-1 btn-press" onClick={handleEditSave} disabled={editSaving || !editForm.phone.trim()}>
                {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
};

const DetailRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex justify-between items-center py-1.5">
    <span className="text-sm text-muted-foreground">{label}</span>
    <span className="text-sm font-medium">{children}</span>
  </div>
);

const BADGE_CLASSES: Record<string, string> = {
  Pending:            'badge-pending',
  'Pending Approval': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  Paid:               'badge-processing',
  Processing:         'badge-processing',
  Reprocessed:        'badge-reprocessed',
  Delivered:          'badge-delivered',
  Failed:             'badge-failed',
  Rejected:           'badge-failed',
  Voided:             'bg-slate-200 text-slate-700 dark:bg-slate-700/40 dark:text-slate-300',
};

const StatusBadge = ({ status }: { status: string }) => (
  <span className={`text-xs font-bold px-3 py-1 rounded-full ${BADGE_CLASSES[status] || 'bg-muted text-muted-foreground'}`}>{status}</span>
);

export default DashboardOrderDetail;
