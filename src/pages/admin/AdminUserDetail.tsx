import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { supabase } from '@/integrations/supabase/client';
import { formatPrice } from '@/data/bundles';
import { StatusBadge } from './AdminDashboard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  ArrowLeft, User, Mail, Phone, Calendar, ShoppingCart, Wallet,
  Ban, CheckCircle, PlusCircle, MinusCircle, RefreshCw, FileText, Shield, AlertTriangle, ShieldCheck, Banknote
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { getExactCount, sumColumn, formatCount } from '@/lib/db-counts';

interface UserDetail {
  id: string;
  full_name: string;
  email: string | null;
  phone: string;
  username: string | null;
  created_at: string;
  suspended: boolean;
  suspended_at: string | null;
  suspended_reason: string | null;
  accepted_terms: boolean;
  accepted_terms_at: string | null;
  accepted_terms_version: string | null;
  accepted_privacy: boolean;
  accepted_privacy_at: string | null;
  accepted_privacy_version: string | null;
  accepted_disclaimer: boolean;
  accepted_disclaimer_at: string | null;
  accepted_disclaimer_version: string | null;
  manual_deposit_enabled: boolean;
}

interface UserOrder {
  order_id: string;
  network: string;
  bundle_size_gb: number;
  amount_ghs: number;
  status: string;
  payment_method: string;
  created_at: string;
}

interface WalletTx {
  id: string;
  type: string;
  amount_ghs: number;
  status: string;
  reference: string | null;
  description: string | null;
  created_at: string;
}

const AdminUserDetail = () => {
  const { userId } = useParams<{ userId: string }>();
  const { user: authUser, isAdmin, isAdminOrStaff, loading: authLoading } = useAuth();
  const { log } = useAuditLog();
  const navigate = useNavigate();

  const [profile, setProfile] = useState<UserDetail | null>(null);
  const [orders, setOrders] = useState<UserOrder[]>([]);
  const [transactions, setTransactions] = useState<WalletTx[]>([]);
  const [walletBalance, setWalletBalance] = useState(0);
  const [agentStatus, setAgentStatus] = useState<string | null>(null);
  // True totals for this user — independent of the recent-50 list above.
  const [totalOrdersCount, setTotalOrdersCount] = useState(0);
  const [deliveredOrdersCount, setDeliveredOrdersCount] = useState(0);
  const [totalSpendAll, setTotalSpendAll] = useState(0);
  const [totalTxCount, setTotalTxCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showSuspend, setShowSuspend] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);

  useEffect(() => {
    if (!authLoading && (!authUser || !isAdminOrStaff)) navigate('/auth');
  }, [authUser, isAdminOrStaff, authLoading, navigate]);

  const fetchUser = useCallback(async () => {
    if (!userId) return;
    setLoading(true);

    const [
      profileRes,
      ordersRes,
      walletRes,
      txRes,
      agentRes,
      ordersTotal,
      deliveredTotal,
      spendTotal,
      txTotal,
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', userId).single(),
      // Recent-50 list — pagination is fine here, stats below use real counts
      supabase.from('orders').select('order_id, network, bundle_size_gb, amount_ghs, status, payment_method, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
      supabase.from('wallets').select('balance_ghs').eq('user_id', userId).maybeSingle(),
      supabase.from('wallet_transactions').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
      supabase.from('agents' as any).select('status').eq('user_id', userId).neq('status', 'deleted').maybeSingle(),
      // True totals — never capped at 50
      getExactCount('orders', (q) => q.eq('user_id', userId)),
      getExactCount('orders', (q) => q.eq('user_id', userId).eq('status', 'Delivered')),
      sumColumn('orders', 'amount_ghs', (q) => q.eq('user_id', userId).eq('status', 'Delivered')),
      getExactCount('wallet_transactions', (q) => q.eq('user_id', userId)),
    ]);

    if (profileRes.data) setProfile(profileRes.data as any);
    if (ordersRes.data) setOrders(ordersRes.data as any);
    if (walletRes.data) setWalletBalance(Number((walletRes.data as any).balance_ghs));
    if (txRes.data) setTransactions(txRes.data as any);
    setAgentStatus((agentRes.data as any)?.status || null);
    setTotalOrdersCount(ordersTotal);
    setDeliveredOrdersCount(deliveredTotal);
    setTotalSpendAll(spendTotal);
    setTotalTxCount(txTotal);

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (isAdminOrStaff && userId) fetchUser();
  }, [isAdminOrStaff, userId, fetchUser]);

  const handleToggleSuspend = async (suspend: boolean, reason?: string) => {
    if (!userId || !profile) return;

    const updates: any = {
      suspended: suspend,
      suspended_at: suspend ? new Date().toISOString() : null,
      suspended_reason: suspend ? (reason || 'Suspended by admin') : null,
    };

    const { error } = await supabase.from('profiles').update(updates).eq('id', userId);
    if (error) {
      toast.error('Failed to update user status');
      return;
    }

    await log({
      action: suspend ? 'user_suspended' : 'user_unsuspended',
      entity_type: 'user',
      entity_id: userId,
      changes: { suspended: { before: !suspend, after: suspend } },
      metadata: reason ? { reason } : undefined,
    });

    toast.success(suspend ? 'User suspended' : 'User unsuspended');
    setShowSuspend(false);
    fetchUser();
  };

  const handleWalletAdjust = async (amount: number, reason: string) => {
    if (!userId || !isAdmin) return;

    // Update wallet
    const { data: wallet } = await supabase.from('wallets').select('balance_ghs').eq('user_id', userId).maybeSingle();
    
    if (!wallet) {
      // Create wallet if doesn't exist
      await supabase.from('wallets').insert({ user_id: userId, balance_ghs: Math.max(0, amount) });
    } else {
      const newBalance = Number(wallet.balance_ghs) + amount;
      if (newBalance < 0) {
        toast.error('Cannot reduce balance below zero');
        return;
      }
      await supabase.from('wallets').update({ balance_ghs: newBalance }).eq('user_id', userId);
    }

    // Create transaction record
    await supabase.from('wallet_transactions').insert({
      user_id: userId,
      type: 'adjustment',
      amount_ghs: Math.abs(amount),
      status: 'confirmed',
      description: `Admin adjustment: ${reason}`,
      reference: `ADJ-${Date.now()}`,
    } as any);

    await log({
      action: 'wallet_adjusted',
      entity_type: 'wallet',
      entity_id: userId,
      changes: { balance: { before: walletBalance, after: walletBalance + amount } },
      metadata: { amount, reason },
    });

    toast.success(`Wallet adjusted by ${amount > 0 ? '+' : ''}${formatPrice(amount)}`);
    setShowAdjust(false);
    fetchUser();
  };

  const handleToggleManualDeposit = async (enabled: boolean) => {
    if (!userId || !isAdmin || !profile) return;
    const prev = profile.manual_deposit_enabled;
    setProfile({ ...profile, manual_deposit_enabled: enabled });
    const { error } = await supabase
      .from('profiles')
      .update({ manual_deposit_enabled: enabled } as any)
      .eq('id', userId);
    if (error) {
      toast.error('Failed to update access');
      setProfile({ ...profile, manual_deposit_enabled: prev });
      return;
    }
    await log({
      action: enabled ? 'manual_deposit_enabled' : 'manual_deposit_disabled',
      entity_type: 'user',
      entity_id: userId,
      changes: { manual_deposit_enabled: { before: prev, after: enabled } },
    });
    toast.success(`Manual transfer deposit ${enabled ? 'enabled' : 'disabled'}`);
  };

  if (authLoading || !authUser || !isAdminOrStaff) return null;

  // True totals come from dedicated count queries — not from the limited list.
  const totalSpend = totalSpendAll;
  const deliveredCount = deliveredOrdersCount;

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/users')} className="gap-1.5">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        ) : !profile ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <User className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground">User not found</p>
          </div>
        ) : (
          <>
            {/* Profile header */}
            <div className="bg-card rounded-xl border border-border p-6 card-shadow">
              <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <span className="text-xl font-bold text-primary">
                      {(profile.full_name || '?')[0].toUpperCase()}
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl font-display font-bold">{profile.full_name || '—'}</h2>
                      {agentStatus === 'active' && (
                        <Badge variant="outline" className="text-[10px] gap-0.5 border-primary/30 text-primary">
                          <ShieldCheck className="w-3 h-3" /> Active Agent
                        </Badge>
                      )}
                      {(agentStatus === 'pending_review' || agentStatus === 'approved') && (
                        <Badge variant="outline" className="text-[10px] gap-0.5 border-amber-400/30 text-amber-600">
                          Pending Agent
                        </Badge>
                      )}
                    </div>
                    {profile.username && <p className="text-sm text-muted-foreground">@{profile.username}</p>}
                    <div className="flex flex-wrap gap-3 mt-2 text-xs text-muted-foreground">
                      {profile.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{profile.email}</span>}
                      {profile.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{profile.phone}</span>}
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />Joined {new Date(profile.created_at).toLocaleDateString()}</span>
                    </div>
                    {profile.suspended && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">SUSPENDED</span>
                        {profile.suspended_reason && <span className="text-xs text-muted-foreground">{profile.suspended_reason}</span>}
                      </div>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={() => setShowAdjust(true)} className="gap-1.5 text-xs">
                      <Wallet className="w-3.5 h-3.5" /> Adjust Wallet
                    </Button>
                    <Button
                      variant={profile.suspended ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => profile.suspended ? handleToggleSuspend(false) : setShowSuspend(true)}
                      className={`gap-1.5 text-xs ${!profile.suspended ? 'text-destructive hover:text-destructive' : ''}`}
                    >
                      {profile.suspended ? <><CheckCircle className="w-3.5 h-3.5" /> Unsuspend</> : <><Ban className="w-3.5 h-3.5" /> Suspend</>}
                    </Button>
                  </div>
                )}
              </div>

              {/* Stats — true totals via count/aggregate queries (not capped at 50) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
                {[
                  { label: 'Total Orders', value: formatCount(totalOrdersCount), icon: ShoppingCart },
                  { label: 'Delivered', value: formatCount(deliveredCount), icon: CheckCircle },
                  { label: 'Total Spend', value: formatPrice(totalSpend), icon: ShoppingCart },
                  { label: 'Wallet Balance', value: formatPrice(walletBalance), icon: Wallet },
                ].map(s => (
                  <div key={s.label} className="bg-muted/30 rounded-lg p-3">
                    <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{s.label}</p>
                    <p className="text-lg font-display font-bold mt-0.5">{s.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Orders table — shows the most recent 50; header reflects true total */}
            <div className="bg-card rounded-xl border border-border card-shadow">
              <div className="p-4 border-b border-border">
                <h3 className="font-display font-semibold flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" /> Order History ({formatCount(totalOrdersCount)})
                </h3>
                {totalOrdersCount > orders.length && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Showing latest {orders.length} of {formatCount(totalOrdersCount)}
                  </p>
                )}
              </div>
              {orders.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No orders</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Order ID</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Bundle</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map(o => (
                        <tr key={o.order_id} className="border-b border-border last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-3 font-mono text-xs font-medium text-primary">{o.order_id}</td>
                          <td className="px-4 py-3 hidden sm:table-cell text-xs">{o.network} {o.bundle_size_gb}GB</td>
                          <td className="px-4 py-3 text-right font-medium">{formatPrice(Number(o.amount_ghs))}</td>
                          <td className="px-4 py-3"><StatusBadge status={o.status} /></td>
                          <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Wallet transactions */}
            <div className="bg-card rounded-xl border border-border card-shadow">
              <div className="p-4 border-b border-border">
                <h3 className="font-display font-semibold flex items-center gap-2">
                  <Wallet className="w-4 h-4" /> Wallet Transactions ({formatCount(totalTxCount)})
                </h3>
                {totalTxCount > transactions.length && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Showing latest {transactions.length} of {formatCount(totalTxCount)}
                  </p>
                )}
              </div>
              {transactions.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">No transactions</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border bg-muted/30">
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Type</th>
                        <th className="text-right px-4 py-3 font-medium text-muted-foreground">Amount</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden sm:table-cell">Reference</th>
                        <th className="text-left px-4 py-3 font-medium text-muted-foreground hidden md:table-cell">Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map(t => (
                        <tr key={t.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                          <td className="px-4 py-3 capitalize text-xs font-medium">{t.type}</td>
                          <td className="px-4 py-3 text-right font-medium">{formatPrice(Number(t.amount_ghs))}</td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              t.status === 'confirmed' || t.status === 'completed' ? 'bg-success/10 text-success' :
                              t.status === 'rejected' ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
                            }`}>{t.status}</span>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground font-mono">{t.reference || '—'}</td>
                          <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Manual Transfer Deposit Access */}
            {isAdmin && profile && (
              <div className="bg-card rounded-xl border border-border card-shadow p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Banknote className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-display font-semibold text-sm">Manual Transfer Deposit Access</h3>
                      <p className="text-xs text-muted-foreground mt-0.5 max-w-md">
                        Allow this user to request wallet top-ups by sending money manually to YieGo payment details. Disabled by default. Requests still require your approval before crediting.
                      </p>
                      <p className="text-[10px] mt-1.5 font-bold uppercase tracking-wide" style={{ color: profile.manual_deposit_enabled ? 'hsl(var(--success))' : 'hsl(var(--muted-foreground))' }}>
                        {profile.manual_deposit_enabled ? 'Enabled' : 'Disabled'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={!!profile.manual_deposit_enabled}
                    onCheckedChange={handleToggleManualDeposit}
                  />
                </div>
              </div>
            )}

            {/* Legal Agreement Acceptance */}
            {isAdmin && profile && (
              <div className="bg-card rounded-xl border border-border card-shadow">
                <div className="p-4 border-b border-border">
                  <h3 className="font-display font-semibold flex items-center gap-2">
                    <FileText className="w-4 h-4" /> Legal Agreement Acceptance
                  </h3>
                </div>
                <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    {
                      label: 'Terms of Service',
                      icon: FileText,
                      accepted: profile.accepted_terms,
                      at: profile.accepted_terms_at,
                      version: profile.accepted_terms_version,
                    },
                    {
                      label: 'Privacy Policy',
                      icon: Shield,
                      accepted: profile.accepted_privacy,
                      at: profile.accepted_privacy_at,
                      version: profile.accepted_privacy_version,
                    },
                    {
                      label: 'Disclaimer',
                      icon: AlertTriangle,
                      accepted: profile.accepted_disclaimer,
                      at: profile.accepted_disclaimer_at,
                      version: profile.accepted_disclaimer_version,
                    },
                  ].map((item) => (
                    <div key={item.label} className={`rounded-xl p-4 border ${item.accepted ? 'bg-success/5 border-success/20' : 'bg-muted/30 border-border'}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <item.icon className={`w-4 h-4 ${item.accepted ? 'text-success' : 'text-muted-foreground'}`} />
                        <span className="text-xs font-semibold text-foreground">{item.label}</span>
                      </div>
                      <div className={`text-[11px] font-bold mb-1 ${item.accepted ? 'text-success' : 'text-muted-foreground'}`}>
                        {item.accepted ? '✓ Accepted' : '✗ Not Accepted'}
                      </div>
                      {item.accepted && item.at && (
                        <p className="text-[10px] text-muted-foreground">{new Date(item.at).toLocaleString()}</p>
                      )}
                      {item.version && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">Version: {item.version}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Suspend dialog */}
      {showSuspend && (
        <SuspendDialog
          userName={profile?.full_name || 'User'}
          onConfirm={(reason) => handleToggleSuspend(true, reason)}
          onClose={() => setShowSuspend(false)}
        />
      )}

      {/* Wallet adjust dialog */}
      {showAdjust && (
        <WalletAdjustDialog
          currentBalance={walletBalance}
          onConfirm={handleWalletAdjust}
          onClose={() => setShowAdjust(false)}
        />
      )}
    </AdminLayout>
  );
};

const SuspendDialog = ({ userName, onConfirm, onClose }: { userName: string; onConfirm: (reason: string) => void; onClose: () => void }) => {
  const [reason, setReason] = useState('');
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="font-display">Suspend {userName}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">This will prevent the user from making purchases. They can still view their account.</p>
          <div>
            <Label>Reason</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="Enter suspension reason..." className="mt-1" rows={3} />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button variant="destructive" onClick={() => onConfirm(reason)} className="flex-1">Suspend User</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const WalletAdjustDialog = ({ currentBalance, onConfirm, onClose }: { currentBalance: number; onConfirm: (amount: number, reason: string) => void; onClose: () => void }) => {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isCredit, setIsCredit] = useState(true);

  const handleSubmit = () => {
    const num = parseFloat(amount);
    if (!num || num <= 0) { toast.error('Enter a valid amount'); return; }
    if (!reason.trim()) { toast.error('Enter a reason'); return; }
    onConfirm(isCredit ? num : -num, reason);
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="font-display">Adjust Wallet</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Current balance: <strong>{formatPrice(currentBalance)}</strong></p>
          <div className="flex gap-2">
            <Button variant={isCredit ? 'default' : 'outline'} size="sm" onClick={() => setIsCredit(true)} className="flex-1 gap-1.5">
              <PlusCircle className="w-3.5 h-3.5" /> Credit
            </Button>
            <Button variant={!isCredit ? 'default' : 'outline'} size="sm" onClick={() => setIsCredit(false)} className="flex-1 gap-1.5">
              <MinusCircle className="w-3.5 h-3.5" /> Debit
            </Button>
          </div>
          <div>
            <Label>Amount (GHS)</Label>
            <Input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="mt-1" min="0" step="0.01" />
          </div>
          <div>
            <Label>Reason (required for audit log)</Label>
            <Textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Refund for failed order YG-XYZ123" className="mt-1" rows={2} />
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleSubmit} className="flex-1">
              {isCredit ? 'Credit' : 'Debit'} Wallet
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminUserDetail;
