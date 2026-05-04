import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import AdminLayout from './AdminLayout';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CheckCircle, XCircle, Eye, Search, MessageSquare, Copy } from 'lucide-react';
import { normalizeGhanaWhatsApp, openAgentWhatsApp, copyAgentApprovalMessage } from '@/lib/agent-whatsapp-message';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';

const statusBadge = (status: string) => {
  const styles: Record<string, string> = {
    pending_review: 'bg-primary/15 text-primary',
    pending: 'bg-primary/15 text-primary',
    approved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    declined: 'bg-destructive/10 text-destructive',
    rejected: 'bg-destructive/10 text-destructive',
    changes_requested: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  };
  const labels: Record<string, string> = {
    pending_review: 'Pending Review',
    pending: 'Pending',
    approved: 'Approved',
    declined: 'Declined',
    rejected: 'Rejected',
    changes_requested: 'Changes Requested',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${styles[status] || 'bg-muted text-muted-foreground'}`}>
      {labels[status] || status}
    </span>
  );
};

const AdminAgentApplications = () => {
  const { user, isAdmin } = useAuth();
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewApp, setViewApp] = useState<any>(null);
  const [processing, setProcessing] = useState<string | null>(null);
  const [declineDialog, setDeclineDialog] = useState<any>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [approveConfirmApp, setApproveConfirmApp] = useState<any>(null);

  useEffect(() => { fetchData(); }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('agent_applications')
      .select('*')
      .order('created_at', { ascending: false });
    if (data) setApplications(data);
    setLoading(false);
  };

  const logActivity = async (agentId: string | null, eventType: string, meta: any) => {
    if (!agentId) return;
    try {
      await (supabase.from('agent_activity_logs' as any) as any).insert({
        agent_id: agentId,
        event_type: eventType,
        meta,
        actor_id: user?.id,
      });
    } catch {} // non-blocking
  };

  const writeAuditLog = async (action: string, entityType: string, entityId: string, meta?: Record<string, any>) => {
    try {
      await supabase.from('audit_logs' as any).insert({
        actor_id: user?.id,
        actor_email: user?.email || '',
        action,
        entity_type: entityType,
        entity_id: entityId,
        metadata: { ...meta, actor_role: isAdmin ? 'admin' : 'staff' },
      });
    } catch {} // non-blocking
  };

  const findAgentByUserId = async (userId: string) => {
    const { data } = await supabase.from('agents').select('id').eq('user_id', userId).maybeSingle();
    return data?.id || null;
  };

  const handleApprove = async (app: any) => {
    setProcessing(app.id);
    try {
      // Update application
      const { error: appError } = await supabase.from('agent_applications').update({
        status: 'approved',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user?.id,
        admin_notes: adminNotes || null,
      }).eq('id', app.id);

      if (appError) {
        toast.error('Action failed. Please try again or contact admin.');
        console.error('Approve error:', appError);
        setProcessing(null);
        return;
      }

      // Update agent status
      const agentId = await findAgentByUserId(app.user_id);
      if (agentId) {
        const approvedAt = new Date().toISOString();
        const promoExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const { error: agentError } = await supabase.from('agents' as any).update({
          status: 'approved',
          agent_approved_at: approvedAt,
          activation_discount_expires_at: promoExpiresAt,
          discount_extension_used: false,
        }).eq('id', agentId);
        if (agentError) {
          console.error('Agent status update error:', agentError);
        }
        await logActivity(agentId, 'application_approved', { application_id: app.id, approved_by: user?.id });
      }

      // Audit log
      await writeAuditLog('agent_application_approved', 'agent_application', app.id, {
        target_user_id: app.user_id,
        store_name: app.store_name,
      });

      toast.success('Agent application approved');

      // Fire-and-forget SMS
      try {
        supabase.functions.invoke('send-sms', {
          body: {
            to: app.personal_phone || app.whatsapp_number,
            event_type: 'agent_approved',
            user_id: app.user_id,
            agent_id: agentId,
            template_vars: { name: app.full_name || 'there' },
          },
        }).catch(() => {});
      } catch {}

      setViewApp(null);
      setAdminNotes('');
      fetchData();
    } catch (err: any) {
      toast.error('Action failed. Please try again or contact admin.');
      console.error('Approve exception:', err);
    } finally {
      setProcessing(null);
    }
  };

  const handleDecline = async () => {
    if (!declineDialog) return;
    if (!declineReason.trim()) {
      toast.error('Please provide a reason for declining');
      return;
    }
    setProcessing(declineDialog.id);
    try {
      const { error: appError } = await supabase.from('agent_applications').update({
        status: 'rejected',
        reviewed_at: new Date().toISOString(),
        reviewed_by: user?.id,
        admin_notes: declineReason,
      }).eq('id', declineDialog.id);

      if (appError) {
        toast.error('Action failed. Please try again or contact admin.');
        console.error('Decline error:', appError);
        setProcessing(null);
        return;
      }

      const agentId = await findAgentByUserId(declineDialog.user_id);
      if (agentId) {
        const { error: agentError } = await supabase.from('agents').update({ status: 'rejected' }).eq('id', agentId);
        if (agentError) console.error('Agent status update error:', agentError);
        await logActivity(agentId, 'application_declined', { application_id: declineDialog.id, reason: declineReason });
      }

      // Audit log
      await writeAuditLog('agent_application_declined', 'agent_application', declineDialog.id, {
        target_user_id: declineDialog.user_id,
        store_name: declineDialog.store_name,
        decline_reason: declineReason,
      });

      toast.success('Agent application declined');
      setDeclineDialog(null);
      setDeclineReason('');
      setViewApp(null);
      fetchData();
    } catch (err: any) {
      toast.error('Action failed. Please try again or contact admin.');
      console.error('Decline exception:', err);
    } finally {
      setProcessing(null);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return applications;
    const q = search.toLowerCase();
    return applications.filter(a =>
      a.store_name?.toLowerCase().includes(q) ||
      a.full_name?.toLowerCase().includes(q) ||
      a.region?.toLowerCase().includes(q) ||
      a.store_email?.toLowerCase().includes(q)
    );
  }, [applications, search]);

  const pending = filtered.filter(a => a.status === 'pending_review' || a.status === 'pending');
  const approved = filtered.filter(a => a.status === 'approved');
  const declined = filtered.filter(a => a.status === 'rejected' || a.status === 'declined');

  const renderTable = (items: any[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/30 text-left text-muted-foreground">
            <th className="px-4 py-3 font-medium">Store Name</th>
            <th className="px-4 py-3 font-medium hidden sm:table-cell">Applicant</th>
            <th className="px-4 py-3 font-medium hidden md:table-cell">Region</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium hidden sm:table-cell">Date</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No applications found</td></tr>
          ) : items.map(app => (
            <tr key={app.id} className="border-b last:border-0 hover:bg-muted/20">
              <td className="px-4 py-3 font-semibold">{app.store_name}</td>
              <td className="px-4 py-3 hidden sm:table-cell">{app.full_name}</td>
              <td className="px-4 py-3 hidden md:table-cell">{app.region}</td>
              <td className="px-4 py-3">{statusBadge(app.status)}</td>
              <td className="px-4 py-3 hidden sm:table-cell text-xs text-muted-foreground">
                {format(new Date(app.created_at), 'dd MMM yyyy')}
              </td>
              <td className="px-4 py-3">
                <div className="flex gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => { setViewApp(app); setAdminNotes(app.admin_notes || ''); }}>
                    <Eye className="w-3 h-3 mr-1" /> View
                  </Button>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="sm" variant="outline" className="text-green-600"
                          disabled={!normalizeGhanaWhatsApp(app.whatsapp_number)}
                          onClick={() => openAgentWhatsApp(app.whatsapp_number, app.full_name, app.store_name)}>
                          <MessageSquare className="w-3 h-3" />
                        </Button>
                      </TooltipTrigger>
                      {!normalizeGhanaWhatsApp(app.whatsapp_number) && <TooltipContent>No WhatsApp number provided</TooltipContent>}
                    </Tooltip>
                  </TooltipProvider>
                  <Button size="sm" variant="outline" onClick={async () => {
                    const ok = await copyAgentApprovalMessage(app.full_name, app.store_name);
                    if (ok) toast.success('Message copied!');
                  }}>
                    <Copy className="w-3 h-3" />
                  </Button>
                  {(app.status === 'pending_review' || app.status === 'pending') && (
                    <>
                      <Button size="sm" onClick={() => setApproveConfirmApp(app)} disabled={processing === app.id}>
                        <CheckCircle className="w-3 h-3 mr-1" /> Approve
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setDeclineDialog(app); setDeclineReason(''); }}>
                        <XCircle className="w-3 h-3 mr-1" /> Decline
                      </Button>
                    </>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold">Agent Applications</h1>
            <p className="text-sm text-muted-foreground">Review, approve, or decline agent applications</p>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search applications..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">
              Pending {pending.length > 0 && <span className="ml-1.5 bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">{pending.length}</span>}
            </TabsTrigger>
            <TabsTrigger value="approved">Approved</TabsTrigger>
            <TabsTrigger value="declined">Declined</TabsTrigger>
            <TabsTrigger value="all">All ({filtered.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4">
            <Card className="card-shadow"><CardContent className="p-0">{renderTable(pending)}</CardContent></Card>
          </TabsContent>
          <TabsContent value="approved" className="mt-4">
            <Card className="card-shadow"><CardContent className="p-0">{renderTable(approved)}</CardContent></Card>
          </TabsContent>
          <TabsContent value="declined" className="mt-4">
            <Card className="card-shadow"><CardContent className="p-0">{renderTable(declined)}</CardContent></Card>
          </TabsContent>
          <TabsContent value="all" className="mt-4">
            <Card className="card-shadow"><CardContent className="p-0">{renderTable(filtered)}</CardContent></Card>
          </TabsContent>
        </Tabs>

        {/* Application Detail Dialog */}
        <Dialog open={!!viewApp} onOpenChange={() => setViewApp(null)}>
          <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Application Details</DialogTitle>
            </DialogHeader>
            {viewApp && (
              <div className="space-y-4 text-sm">
                <div className="flex items-center gap-2 mb-2">
                  {statusBadge(viewApp.status)}
                  <span className="text-xs text-muted-foreground">
                    Applied {format(new Date(viewApp.created_at), 'dd MMM yyyy, HH:mm')}
                  </span>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Store Information</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className="text-muted-foreground text-xs">Store Name</p><p className="font-semibold">{viewApp.store_name}</p></div>
                    <div><p className="text-muted-foreground text-xs">Region</p><p>{viewApp.region}</p></div>
                    <div><p className="text-muted-foreground text-xs">Store Email</p><p>{viewApp.store_email}</p></div>
                    <div><p className="text-muted-foreground text-xs">WhatsApp</p><p>{viewApp.whatsapp_number}</p></div>
                  </div>
                  <div><p className="text-muted-foreground text-xs">Description</p><p>{viewApp.store_description}</p></div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Identity</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className="text-muted-foreground text-xs">Full Name</p><p className="font-semibold">{viewApp.full_name}</p></div>
                    <div><p className="text-muted-foreground text-xs">Phone</p><p>{viewApp.personal_phone}</p></div>
                    <div><p className="text-muted-foreground text-xs">Personal Email</p><p>{viewApp.personal_email || '—'}</p></div>
                    <div><p className="text-muted-foreground text-xs">DOB</p><p>{viewApp.date_of_birth || '—'}</p></div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Business Plan</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div><p className="text-muted-foreground text-xs">Selling Method</p><p>{viewApp.selling_method}</p></div>
                    <div><p className="text-muted-foreground text-xs">Expected Customers</p><p>{viewApp.expected_customers}</p></div>
                    <div><p className="text-muted-foreground text-xs">Sold Before</p><p>{viewApp.sold_before ? 'Yes' : 'No'}</p></div>
                    <div><p className="text-muted-foreground text-xs">Referral</p><p>{viewApp.referral_source || '—'}</p></div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Agreements</h4>
                  <div className="space-y-1 text-xs">
                    <p>{viewApp.agreed_no_scam ? '✅' : '❌'} No scam policy</p>
                    <p>{viewApp.agreed_min_price ? '✅' : '❌'} Minimum price policy</p>
                    <p>{viewApp.agreed_suspension ? '✅' : '❌'} Suspension policy</p>
                  </div>
                </div>

                {/* Admin Notes */}
                {(viewApp.status === 'pending_review' || viewApp.status === 'pending') && (
                  <div className="space-y-2 pt-2 border-t border-border">
                    <label className="text-xs font-semibold text-muted-foreground">Admin Notes (optional)</label>
                    <Textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Internal notes about this application..." rows={3} />
                  </div>
                )}

                {viewApp.admin_notes && viewApp.status !== 'pending_review' && viewApp.status !== 'pending' && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs font-semibold text-muted-foreground mb-1">Admin Notes</p>
                    <p className="text-sm bg-muted/50 p-2 rounded">{viewApp.admin_notes}</p>
                  </div>
                )}

                {viewApp.reviewed_at && (
                  <p className="text-xs text-muted-foreground">
                    Reviewed: {format(new Date(viewApp.reviewed_at), 'dd MMM yyyy, HH:mm')}
                  </p>
                )}
              </div>
            )}
            {viewApp && (
              <div className="flex gap-2 flex-wrap pt-2 border-t border-border">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="sm" variant="outline" className="text-green-600"
                        disabled={!normalizeGhanaWhatsApp(viewApp.whatsapp_number)}
                        onClick={() => openAgentWhatsApp(viewApp.whatsapp_number, viewApp.full_name, viewApp.store_name)}>
                        <MessageSquare className="w-4 h-4 mr-1" /> Message on WhatsApp
                      </Button>
                    </TooltipTrigger>
                    {!normalizeGhanaWhatsApp(viewApp.whatsapp_number) && <TooltipContent>No WhatsApp number provided</TooltipContent>}
                  </Tooltip>
                </TooltipProvider>
                <Button size="sm" variant="outline" onClick={async () => {
                  const ok = await copyAgentApprovalMessage(viewApp.full_name, viewApp.store_name);
                  if (ok) toast.success('Message copied!');
                }}>
                  <Copy className="w-4 h-4 mr-1" /> Copy Approval Message
                </Button>
              </div>
            )}
            {viewApp && (viewApp.status === 'pending_review' || viewApp.status === 'pending') && (
              <DialogFooter className="gap-2">
                <Button variant="ghost" className="text-destructive" onClick={() => { setDeclineDialog(viewApp); setDeclineReason(''); }} disabled={processing === viewApp.id}>
                  <XCircle className="w-4 h-4 mr-1" /> Decline
                </Button>
                <Button onClick={() => setApproveConfirmApp(viewApp)} disabled={processing === viewApp.id}>
                  <CheckCircle className="w-4 h-4 mr-1" /> Approve
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>

        {/* Decline Reason Dialog */}
        <Dialog open={!!declineDialog} onOpenChange={() => setDeclineDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Decline Application</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Declining <strong>{declineDialog?.store_name}</strong> by <strong>{declineDialog?.full_name}</strong>
              </p>
              <Textarea
                value={declineReason}
                onChange={e => setDeclineReason(e.target.value)}
                placeholder="Reason for declining (required)..."
                rows={4}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeclineDialog(null)}>Cancel</Button>
              <Button variant="destructive" onClick={handleDecline} disabled={!declineReason.trim() || processing === declineDialog?.id}>
                Confirm Decline
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Approve Confirmation Dialog */}
        <Dialog open={!!approveConfirmApp} onOpenChange={() => setApproveConfirmApp(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm Approval</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                You are about to approve <strong>{approveConfirmApp?.store_name}</strong> by <strong>{approveConfirmApp?.full_name}</strong>.
              </p>
              <p className="text-sm text-muted-foreground">
                This will allow the agent to pay the activation fee and access their store dashboard.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApproveConfirmApp(null)}>Cancel</Button>
              <Button onClick={() => { handleApprove(approveConfirmApp); setApproveConfirmApp(null); }} disabled={processing === approveConfirmApp?.id}>
                Confirm Approve
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
};

export default AdminAgentApplications;
