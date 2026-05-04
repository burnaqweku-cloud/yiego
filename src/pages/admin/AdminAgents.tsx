import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import AdminLayout from './AdminLayout';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CheckCircle, XCircle, Ban, Eye, Power, Clock, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';

const PAGE_SIZE = 50;

const AdminAgents = () => {
  const { user } = useAuth();

  // Agents tab state
  const [agents, setAgents] = useState<any[]>([]);
  const [agentsTotal, setAgentsTotal] = useState(0);
  const [agentsPage, setAgentsPage] = useState(0);
  const [agentsSearch, setAgentsSearch] = useState('');
  const [agentsLoading, setAgentsLoading] = useState(true);

  // Applications tab state
  const [applications, setApplications] = useState<any[]>([]);
  const [appsTotal, setAppsTotal] = useState(0);
  const [appsPage, setAppsPage] = useState(0);
  const [appsSearch, setAppsSearch] = useState('');
  const [appsLoading, setAppsLoading] = useState(true);

  // Pending / awaiting counts (lightweight head queries)
  const [pendingCount, setPendingCount] = useState(0);
  const [awaitingCount, setAwaitingCount] = useState(0);
  const [pendingAgents, setPendingAgents] = useState<any[]>([]);
  const [awaitingAgents, setAwaitingAgents] = useState<any[]>([]);
  const [pendingLoading, setPendingLoading] = useState(true);

  const [viewApp, setViewApp] = useState<any>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  // ── Fetch agents (paginated + searchable) ──
  const fetchAgents = useCallback(async () => {
    setAgentsLoading(true);
    const from = agentsPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from('agents' as any)
      .select('id, user_id, store_name, store_slug, store_email, whatsapp_number, region, status, activation_paid, activation_paid_at, created_at, application_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (agentsSearch.trim()) {
      const s = `%${agentsSearch.trim()}%`;
      query = query.or(`store_name.ilike.${s},store_slug.ilike.${s},store_email.ilike.${s},region.ilike.${s}`);
    }

    const { data, count } = await query;
    setAgents(data || []);
    setAgentsTotal(count || 0);
    setAgentsLoading(false);
  }, [agentsPage, agentsSearch]);

  // ── Fetch pending + awaiting (small sets, no pagination needed) ──
  const fetchPendingAwaiting = useCallback(async () => {
    setPendingLoading(true);
    const [pendingRes, awaitingRes] = await Promise.all([
      supabase.from('agents' as any)
        .select('id, store_name, store_slug, whatsapp_number, region, status, created_at, application_id')
        .eq('status', 'pending_review')
        .order('created_at', { ascending: false }),
      supabase.from('agents' as any)
        .select('id, store_name, store_slug, whatsapp_number, region, status, activation_paid, created_at, application_id')
        .eq('status', 'approved')
        .eq('activation_paid', false)
        .order('created_at', { ascending: false }),
    ]);
    setPendingAgents(pendingRes.data || []);
    setPendingCount((pendingRes.data || []).length);
    setAwaitingAgents(awaitingRes.data || []);
    setAwaitingCount((awaitingRes.data || []).length);
    setPendingLoading(false);
  }, []);

  // ── Fetch applications (paginated + searchable) ──
  const fetchApplications = useCallback(async () => {
    setAppsLoading(true);
    const from = appsPage * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
      .from('agent_applications' as any)
      .select('id, store_name, full_name, region, status, created_at, user_id, whatsapp_number, store_email, selling_method, expected_customers, store_description, sold_before, agreed_min_price, agreed_no_scam, agreed_suspension, personal_phone, personal_email, date_of_birth, referral_source, reviewed_at, reviewed_by, admin_notes', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (appsSearch.trim()) {
      const s = `%${appsSearch.trim()}%`;
      query = query.or(`store_name.ilike.${s},full_name.ilike.${s},store_email.ilike.${s},region.ilike.${s}`);
    }

    const { data, count } = await query;
    setApplications(data || []);
    setAppsTotal(count || 0);
    setAppsLoading(false);
  }, [appsPage, appsSearch]);

  // ── Effects ──
  useEffect(() => { fetchAgents(); }, [fetchAgents]);
  useEffect(() => { fetchPendingAwaiting(); }, [fetchPendingAwaiting]);
  useEffect(() => { fetchApplications(); }, [fetchApplications]);

  // ── Search handlers (reset to page 0) ──
  const handleAgentsSearch = (val: string) => {
    setAgentsSearch(val);
    setAgentsPage(0);
  };
  const handleAppsSearch = (val: string) => {
    setAppsSearch(val);
    setAppsPage(0);
  };

  // ── After mutation, refresh relevant data ──
  const refreshAfterMutation = () => {
    fetchAgents();
    fetchPendingAwaiting();
  };

  // ── Admin actions (unchanged logic) ──
  const handleApproveAgent = async (agentId: string) => {
    setProcessing(agentId);
    try {
      await supabase.from('agents' as any).update({ status: 'approved' }).eq('id', agentId);
      const ag = [...agents, ...pendingAgents].find(a => a.id === agentId);
      if (ag?.application_id) {
        await supabase.from('agent_applications' as any).update({
          status: 'approved', reviewed_at: new Date().toISOString(), reviewed_by: user?.id,
        }).eq('id', ag.application_id);
      }
      toast.success('Agent approved! They can now pay the activation fee.');
      refreshAfterMutation();
    } catch (err: any) {
      toast.error(err.message || 'Failed to approve');
    } finally { setProcessing(null); }
  };

  const handleActivateAgent = async (agentId: string) => {
    setProcessing(agentId);
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      await supabase.from('agents' as any).update({
        status: 'active', activation_paid: true, activation_paid_at: now.toISOString(), activation_reference: 'ADMIN_MANUAL',
      }).eq('id', agentId);
      await supabase.from('agent_subscriptions' as any).insert({
        agent_id: agentId, status: 'active', paid_at: now.toISOString(), expiry_date: expiresAt.toISOString(),
        next_billing_date: expiresAt.toISOString(), paystack_reference: 'ADMIN_MANUAL', plan_price_current: 0, plan_price_standard: 50,
      });
      toast.success('Store activated successfully — Status: ACTIVE, Subscription: ACTIVE');
      refreshAfterMutation();
    } catch (err: any) {
      toast.error(err.message || 'Failed to activate');
    } finally { setProcessing(null); }
  };

  const handleSuspendAgent = async (agentId: string) => {
    setProcessing(agentId);
    try {
      await supabase.from('agents' as any).update({ status: 'suspended' }).eq('id', agentId);
      toast.success('Agent suspended');
      refreshAfterMutation();
    } catch (err: any) {
      toast.error(err.message || 'Failed to suspend');
    } finally { setProcessing(null); }
  };

  const handleReactivateAgent = async (agentId: string) => {
    setProcessing(agentId);
    try {
      await supabase.from('agents' as any).update({ status: 'active' }).eq('id', agentId);
      toast.success('Agent reactivated');
      refreshAfterMutation();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reactivate');
    } finally { setProcessing(null); }
  };

  const handleRejectAgent = async (agentId: string) => {
    setProcessing(agentId);
    try {
      await supabase.from('agents' as any).update({ status: 'rejected' }).eq('id', agentId);
      const ag = [...agents, ...pendingAgents].find(a => a.id === agentId);
      if (ag?.application_id) {
        await supabase.from('agent_applications' as any).update({
          status: 'rejected', reviewed_at: new Date().toISOString(), reviewed_by: user?.id,
        }).eq('id', ag.application_id);
      }
      toast.success('Agent rejected');
      refreshAfterMutation();
    } catch (err: any) {
      toast.error(err.message || 'Failed to reject');
    } finally { setProcessing(null); }
  };

  // ── Helpers ──
  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending_review: 'badge-pending', approved: 'badge-processing', active: 'badge-delivered',
      suspended: 'badge-failed', rejected: 'badge-failed',
    };
    const labels: Record<string, string> = {
      pending_review: 'Pending Review', approved: 'Awaiting Payment', active: 'Active',
      suspended: 'Suspended', rejected: 'Rejected',
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${map[status] || 'badge-pending'}`}>{labels[status] || status}</span>;
  };

  const findAppFromList = (appId: string | null) => appId ? applications.find(a => a.id === appId) : null;

  const agentsTotalPages = Math.max(1, Math.ceil(agentsTotal / PAGE_SIZE));
  const appsTotalPages = Math.max(1, Math.ceil(appsTotal / PAGE_SIZE));

  const PaginationControls = ({ page, totalPages, total, onPrev, onNext }: { page: number; totalPages: number; total: number; onPrev: () => void; onNext: () => void }) => (
    <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/10">
      <p className="text-xs text-muted-foreground">
        Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
      </p>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={onPrev} disabled={page === 0}>
          <ChevronLeft className="w-4 h-4 mr-1" /> Previous
        </Button>
        <span className="text-xs text-muted-foreground">Page {page + 1} / {totalPages}</span>
        <Button size="sm" variant="outline" onClick={onNext} disabled={page >= totalPages - 1}>
          Next <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <h1 className="text-xl font-bold">Agent Management</h1>

        <Tabs defaultValue="agents">
          <TabsList>
            <TabsTrigger value="agents">All Agents ({agentsTotal})</TabsTrigger>
            <TabsTrigger value="pending">
              Pending Review {pendingCount > 0 && <span className="ml-1.5 bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{pendingCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="awaiting">
              Awaiting Payment {awaitingCount > 0 && <span className="ml-1.5 bg-info text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">{awaitingCount}</span>}
            </TabsTrigger>
            <TabsTrigger value="applications">Applications ({appsTotal})</TabsTrigger>
          </TabsList>

          {/* All Agents Tab */}
          <TabsContent value="agents" className="mt-4">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by store name, slug, email, region..."
                value={agentsSearch}
                onChange={e => handleAgentsSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Card className="card-shadow">
              <CardContent className="p-0">
                {agentsLoading ? <div className="flex justify-center py-8"><div className="spinner" /></div> : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-muted/30 text-left text-muted-foreground">
                          <th className="px-4 py-3 font-medium">Store</th>
                          <th className="px-4 py-3 font-medium">Slug</th>
                          <th className="px-4 py-3 font-medium">Region</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Paid</th>
                          <th className="px-4 py-3 font-medium">Created</th>
                          <th className="px-4 py-3 font-medium">Actions</th>
                        </tr></thead>
                        <tbody>
                          {agents.length === 0 ? (
                            <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No agents found</td></tr>
                          ) : agents.map((ag: any) => (
                            <tr key={ag.id} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="px-4 py-3 font-semibold">{ag.store_name}</td>
                              <td className="px-4 py-3 font-mono text-xs">{ag.store_slug}</td>
                              <td className="px-4 py-3">{ag.region}</td>
                              <td className="px-4 py-3">{statusBadge(ag.status)}</td>
                              <td className="px-4 py-3">{ag.activation_paid ? '✓' : '—'}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">{format(new Date(ag.created_at), 'dd MMM yyyy')}</td>
                              <td className="px-4 py-3">
                                <div className="flex gap-1.5 flex-wrap">
                                  <Button size="sm" variant="outline" onClick={() => setViewApp(findAppFromList(ag.application_id))}>
                                    <Eye className="w-3 h-3" />
                                  </Button>
                                  {ag.status === 'pending_review' && (
                                    <Button size="sm" onClick={() => handleApproveAgent(ag.id)} disabled={processing === ag.id}>
                                      <CheckCircle className="w-3 h-3 mr-1" /> Approve
                                    </Button>
                                  )}
                                  {ag.status === 'approved' && (
                                    <Button size="sm" onClick={() => handleActivateAgent(ag.id)} disabled={processing === ag.id}>
                                      <Power className="w-3 h-3 mr-1" /> Activate
                                    </Button>
                                  )}
                                  {ag.status === 'active' && (
                                    <Button size="sm" variant="destructive" onClick={() => handleSuspendAgent(ag.id)} disabled={processing === ag.id}>
                                      <Ban className="w-3 h-3 mr-1" /> Suspend
                                    </Button>
                                  )}
                                  {ag.status === 'suspended' && (
                                    <Button size="sm" variant="outline" onClick={() => handleReactivateAgent(ag.id)} disabled={processing === ag.id}>
                                      <CheckCircle className="w-3 h-3 mr-1" /> Reactivate
                                    </Button>
                                  )}
                                  {['pending_review', 'approved', 'suspended'].includes(ag.status) && (
                                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleRejectAgent(ag.id)} disabled={processing === ag.id}>
                                      <XCircle className="w-3 h-3 mr-1" /> Reject
                                    </Button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {agentsTotal > PAGE_SIZE && (
                      <PaginationControls
                        page={agentsPage}
                        totalPages={agentsTotalPages}
                        total={agentsTotal}
                        onPrev={() => setAgentsPage(p => Math.max(0, p - 1))}
                        onNext={() => setAgentsPage(p => Math.min(agentsTotalPages - 1, p + 1))}
                      />
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pending Review Tab */}
          <TabsContent value="pending" className="space-y-4 mt-4">
            {pendingLoading ? <div className="flex justify-center py-8"><div className="spinner" /></div> : (
              pendingAgents.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No agents pending review</CardContent></Card>
              ) : (
                pendingAgents.map(ag => (
                  <Card key={ag.id} className="card-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                          <h3 className="font-bold">{ag.store_name}</h3>
                          <p className="text-sm text-muted-foreground">{ag.region} · {ag.whatsapp_number}</p>
                          <p className="text-xs text-muted-foreground">Applied: {format(new Date(ag.created_at), 'dd MMM yyyy')}</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" variant="outline" onClick={() => setViewApp(findAppFromList(ag.application_id))}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button size="sm" onClick={() => handleApproveAgent(ag.id)} disabled={processing === ag.id}>
                            <CheckCircle className="w-4 h-4 mr-1" /> Approve
                          </Button>
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleRejectAgent(ag.id)} disabled={processing === ag.id}>
                            <XCircle className="w-4 h-4 mr-1" /> Reject
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )
            )}
          </TabsContent>

          {/* Awaiting Payment Tab */}
          <TabsContent value="awaiting" className="space-y-4 mt-4">
            {pendingLoading ? <div className="flex justify-center py-8"><div className="spinner" /></div> : (
              awaitingAgents.length === 0 ? (
                <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No agents awaiting activation payment</CardContent></Card>
              ) : (
                awaitingAgents.map(ag => (
                  <Card key={ag.id} className="card-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                          <h3 className="font-bold">{ag.store_name}</h3>
                          <p className="text-sm text-muted-foreground">{ag.region} · {ag.store_slug}</p>
                          <p className="text-xs text-muted-foreground">Approved, waiting for activation payment</p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <Button size="sm" variant="outline" onClick={() => setViewApp(findAppFromList(ag.application_id))}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button size="sm" onClick={() => handleActivateAgent(ag.id)} disabled={processing === ag.id}>
                            <Power className="w-4 h-4 mr-1" /> Activate (Skip Payment)
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )
            )}
          </TabsContent>

          {/* Applications history */}
          <TabsContent value="applications" className="mt-4">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search by store name, applicant name, email, region..."
                value={appsSearch}
                onChange={e => handleAppsSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Card className="card-shadow">
              <CardContent className="p-0">
                {appsLoading ? <div className="flex justify-center py-8"><div className="spinner" /></div> : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead><tr className="border-b bg-muted/30 text-left text-muted-foreground">
                          <th className="px-4 py-3 font-medium">Store Name</th>
                          <th className="px-4 py-3 font-medium">Full Name</th>
                          <th className="px-4 py-3 font-medium">Region</th>
                          <th className="px-4 py-3 font-medium">Status</th>
                          <th className="px-4 py-3 font-medium">Date</th>
                          <th className="px-4 py-3 font-medium">Actions</th>
                        </tr></thead>
                        <tbody>
                          {applications.length === 0 ? (
                            <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No applications</td></tr>
                          ) : applications.map((app: any) => (
                            <tr key={app.id} className="border-b last:border-0 hover:bg-muted/20">
                              <td className="px-4 py-3 font-semibold">{app.store_name}</td>
                              <td className="px-4 py-3">{app.full_name}</td>
                              <td className="px-4 py-3">{app.region}</td>
                              <td className="px-4 py-3">{statusBadge(app.status)}</td>
                              <td className="px-4 py-3 text-xs text-muted-foreground">{format(new Date(app.created_at), 'dd MMM yyyy')}</td>
                              <td className="px-4 py-3">
                                <Button size="sm" variant="outline" onClick={() => setViewApp(app)}>
                                  <Eye className="w-3 h-3 mr-1" /> View
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {appsTotal > PAGE_SIZE && (
                      <PaginationControls
                        page={appsPage}
                        totalPages={appsTotalPages}
                        total={appsTotal}
                        onPrev={() => setAppsPage(p => Math.max(0, p - 1))}
                        onNext={() => setAppsPage(p => Math.min(appsTotalPages - 1, p + 1))}
                      />
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* View application detail dialog */}
        <Dialog open={!!viewApp} onOpenChange={() => setViewApp(null)}>
          <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Application Details</DialogTitle></DialogHeader>
            {viewApp && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><p className="text-muted-foreground text-xs">Store Name</p><p className="font-semibold">{viewApp.store_name}</p></div>
                  <div><p className="text-muted-foreground text-xs">Region</p><p>{viewApp.region}</p></div>
                  <div><p className="text-muted-foreground text-xs">Full Name</p><p>{viewApp.full_name}</p></div>
                  <div><p className="text-muted-foreground text-xs">Phone</p><p>{viewApp.personal_phone}</p></div>
                  <div><p className="text-muted-foreground text-xs">WhatsApp</p><p>{viewApp.whatsapp_number}</p></div>
                  <div><p className="text-muted-foreground text-xs">Email</p><p>{viewApp.store_email}</p></div>
                  <div><p className="text-muted-foreground text-xs">Selling Method</p><p>{viewApp.selling_method}</p></div>
                  <div><p className="text-muted-foreground text-xs">Expected Customers</p><p>{viewApp.expected_customers}</p></div>
                  <div><p className="text-muted-foreground text-xs">Sold Before</p><p>{viewApp.sold_before ? 'Yes' : 'No'}</p></div>
                  <div><p className="text-muted-foreground text-xs">Referral</p><p>{viewApp.referral_source || '—'}</p></div>
                </div>
                <div><p className="text-muted-foreground text-xs">Description</p><p>{viewApp.store_description}</p></div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminAgents;
