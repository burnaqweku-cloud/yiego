import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import AdminLayout from './AdminLayout';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { formatPrice } from '@/data/bundles';
import { Eye, Ban, CheckCircle, Power, Search, ExternalLink, MessageSquare, Copy,
  Timer, XCircle, Clock, Hourglass, AlertTriangle } from 'lucide-react';
import { normalizeGhanaWhatsApp, openAgentWhatsApp, copyAgentApprovalMessage } from '@/lib/agent-whatsapp-message';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';

const effectiveStateBadge = (state: string) => {
  const config: Record<string, { label: string; color: string; icon: any }> = {
    active: { label: 'Active', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400', icon: CheckCircle },
    expiring_soon: { label: 'Expiring Soon', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400', icon: Timer },
    grace_period: { label: 'Grace Period', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400', icon: Clock },
    expired_promo: { label: 'Expired Promo', color: 'bg-destructive/10 text-destructive', icon: AlertTriangle },
    expired_standard: { label: 'Expired', color: 'bg-destructive/10 text-destructive', icon: XCircle },
    approved_awaiting_activation: { label: 'Awaiting Activation', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400', icon: Hourglass },
    pending_review: { label: 'Pending Review', color: 'bg-muted text-muted-foreground', icon: Clock },
    suspended: { label: 'Suspended', color: 'bg-destructive/10 text-destructive', icon: Ban },
    unknown: { label: 'Unknown', color: 'bg-muted text-muted-foreground', icon: XCircle },
  };
  const cfg = config[state] || config.unknown;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
      <Icon className="w-3 h-3" />
      {cfg.label}
    </span>
  );
};

const AdminAgentDirectory = () => {
  const { user } = useAuth();
  const [agents, setAgents] = useState<any[]>([]);
  const [wallets, setWallets] = useState<Record<string, any>>({});
  const [effectiveStates, setEffectiveStates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [suspendDialog, setSuspendDialog] = useState<any>(null);
  const [suspendReason, setSuspendReason] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const [agentsRes, walletsRes] = await Promise.all([
      supabase.from('agents').select('*').order('created_at', { ascending: false }),
      supabase.from('agent_wallets').select('*'),
    ]);
    if (agentsRes.data) {
      setAgents(agentsRes.data);
      // Fetch effective state for each agent
      const stateMap: Record<string, string> = {};
      const statePromises = (agentsRes.data as any[]).map(async (ag: any) => {
        if (ag.status === 'suspended' || ag.status === 'rejected' || ag.status === 'deleted') {
          stateMap[ag.id] = ag.status;
          return;
        }
        try {
          const { data } = await supabase.rpc('get_agent_effective_state', { p_agent_id: ag.id });
          const row = Array.isArray(data) && data.length > 0 ? data[0] : null;
          stateMap[ag.id] = row?.effective_state || 'unknown';
        } catch {
          stateMap[ag.id] = 'unknown';
        }
      });
      await Promise.all(statePromises);
      setEffectiveStates(stateMap);
    }
    if (walletsRes.data) {
      const map: Record<string, any> = {};
      (walletsRes.data as any[]).forEach(w => { map[w.agent_id] = w; });
      setWallets(map);
    }
    setLoading(false);
  };

  const logActivity = async (agentId: string, eventType: string, meta: any) => {
    try {
      await (supabase.from('agent_activity_logs' as any) as any).insert({
        agent_id: agentId, event_type: eventType, meta, actor_id: user?.id,
      });
    } catch {}
  };

  const handleActivate = async (agentId: string) => {
    setProcessing(agentId);
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      await supabase.from('agents').update({
        status: 'active', activation_paid: true, activation_paid_at: now.toISOString(), activation_reference: 'ADMIN_MANUAL',
      }).eq('id', agentId);

      await supabase.from('agent_subscriptions' as any).insert({
        agent_id: agentId,
        status: 'active',
        paid_at: now.toISOString(),
        expiry_date: expiresAt.toISOString(),
        next_billing_date: expiresAt.toISOString(),
        paystack_reference: 'ADMIN_MANUAL',
        plan_price_current: 0,
        plan_price_standard: 50,
      });

      await logActivity(agentId, 'agent_activated', { admin: user?.id, method: 'admin_manual' });
      toast.success('Store activated successfully — Status: ACTIVE, Subscription: ACTIVE');
      fetchData();
    } catch (err: any) { toast.error(err.message); }
    finally { setProcessing(null); }
  };

  const handleSuspend = async () => {
    if (!suspendDialog || !suspendReason.trim()) {
      toast.error('Reason required');
      return;
    }
    setProcessing(suspendDialog.id);
    try {
      await supabase.from('agents').update({ status: 'suspended' }).eq('id', suspendDialog.id);
      await logActivity(suspendDialog.id, 'agent_suspended', { reason: suspendReason, admin: user?.id });
      toast.success('Agent suspended');
      setSuspendDialog(null);
      setSuspendReason('');
      fetchData();
    } catch (err: any) { toast.error(err.message); }
    finally { setProcessing(null); }
  };

  const handleReactivate = async (agentId: string) => {
    setProcessing(agentId);
    try {
      await supabase.from('agents').update({ status: 'active' }).eq('id', agentId);
      await logActivity(agentId, 'agent_reactivated', { admin: user?.id });
      toast.success('Agent reactivated');
      fetchData();
    } catch (err: any) { toast.error(err.message); }
    finally { setProcessing(null); }
  };

  const filtered = useMemo(() => {
    let result = agents;
    if (statusFilter !== 'all') result = result.filter(a => a.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        a.store_name?.toLowerCase().includes(q) ||
        a.store_slug?.toLowerCase().includes(q) ||
        a.region?.toLowerCase().includes(q) ||
        a.store_email?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [agents, search, statusFilter]);

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold">Agent Directory</h1>
          <p className="text-sm text-muted-foreground">All registered agents and their stores</p>
        </div>

        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search agents..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="approved">Awaiting Payment</SelectItem>
              <SelectItem value="pending_review">Pending Review</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="card-shadow">
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-8"><div className="spinner" /></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                      <th className="px-4 py-3 font-medium">Store</th>
                      <th className="px-4 py-3 font-medium hidden sm:table-cell">Slug</th>
                      <th className="px-4 py-3 font-medium hidden md:table-cell">Region</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium hidden lg:table-cell">Wallet</th>
                      <th className="px-4 py-3 font-medium hidden md:table-cell">Created</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No agents found</td></tr>
                    ) : filtered.map(ag => {
                      const wallet = wallets[ag.id];
                      return (
                        <tr key={ag.id} className="border-b last:border-0 hover:bg-muted/20">
                          <td className="px-4 py-3">
                            <Link to={`/admin/agents/${ag.id}`} className="font-semibold text-primary hover:underline">{ag.store_name}</Link>
                          </td>
                          <td className="px-4 py-3 hidden sm:table-cell font-mono text-xs">{ag.store_slug}</td>
                          <td className="px-4 py-3 hidden md:table-cell">{ag.region}</td>
                          <td className="px-4 py-3">{effectiveStateBadge(effectiveStates[ag.id] || 'unknown')}</td>
                          <td className="px-4 py-3 hidden lg:table-cell font-medium">
                            {wallet ? formatPrice(Number(wallet.available_balance)) : '—'}
                          </td>
                          <td className="px-4 py-3 hidden md:table-cell text-xs text-muted-foreground">
                            {format(new Date(ag.created_at), 'dd MMM yyyy')}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-1.5 flex-wrap">
                              <Button size="sm" variant="outline" asChild>
                                <Link to={`/admin/agents/${ag.id}`}><Eye className="w-3 h-3" /></Link>
                              </Button>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button size="sm" variant="outline" className="text-green-600"
                                      disabled={!normalizeGhanaWhatsApp(ag.whatsapp_number)}
                                      onClick={() => openAgentWhatsApp(ag.whatsapp_number, ag.store_name, ag.store_name)}>
                                      <MessageSquare className="w-3 h-3" />
                                    </Button>
                                  </TooltipTrigger>
                                  {!normalizeGhanaWhatsApp(ag.whatsapp_number) && <TooltipContent>No WhatsApp number provided</TooltipContent>}
                                </Tooltip>
                              </TooltipProvider>
                              <Button size="sm" variant="outline" onClick={async () => {
                                const ok = await copyAgentApprovalMessage(ag.store_name, ag.store_name);
                                if (ok) toast.success('Message copied!');
                              }}>
                                <Copy className="w-3 h-3" />
                              </Button>
                              {ag.status === 'active' && (
                                <>
                                  <Button size="sm" variant="outline" asChild>
                                    <a href={`/store/${ag.store_slug}`} target="_blank" rel="noopener noreferrer">
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </Button>
                                  <Button size="sm" variant="destructive" onClick={() => { setSuspendDialog(ag); setSuspendReason(''); }} disabled={processing === ag.id}>
                                    <Ban className="w-3 h-3" />
                                  </Button>
                                </>
                              )}
                              {ag.status === 'approved' && (
                                <Button size="sm" onClick={() => handleActivate(ag.id)} disabled={processing === ag.id}>
                                  <Power className="w-3 h-3 mr-1" /> Activate
                                </Button>
                              )}
                              {ag.status === 'suspended' && (
                                <Button size="sm" variant="outline" onClick={() => handleReactivate(ag.id)} disabled={processing === ag.id}>
                                  <CheckCircle className="w-3 h-3 mr-1" /> Reactivate
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Suspend Dialog */}
        <Dialog open={!!suspendDialog} onOpenChange={() => setSuspendDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader><DialogTitle>Suspend Agent</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Suspending <strong>{suspendDialog?.store_name}</strong>. Their store will go offline immediately.
              </p>
              <Textarea value={suspendReason} onChange={e => setSuspendReason(e.target.value)} placeholder="Reason for suspension (required)..." rows={4} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSuspendDialog(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleSuspend} disabled={!suspendReason.trim() || processing === suspendDialog?.id}>
                Confirm Suspend
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminAgentDirectory;
