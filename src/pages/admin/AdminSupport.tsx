import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { useAuditLog } from '@/hooks/useAuditLog';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { LifeBuoy, MessageSquare, AlertCircle, CheckCircle, Plus, Search, RefreshCw, Clock } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIES = ['delivery delay', 'wrong number', 'payment', 'wallet', 'other'];
const STATUSES = ['open', 'pending', 'resolved'];

interface Ticket {
  id: string;
  user_id: string | null;
  order_id: string | null;
  category: string;
  status: string;
  subject: string;
  description: string;
  admin_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
  user_name?: string;
  user_email?: string;
}

const AdminSupport = () => {
  const { user, isAdmin, isAdminOrStaff, loading: authLoading } = useAuth();
  const { log } = useAuditLog();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [editTicket, setEditTicket] = useState<Ticket | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || !isAdminOrStaff)) navigate('/auth');
  }, [user, isAdminOrStaff, authLoading, navigate]);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('support_tickets').select('*').order('created_at', { ascending: false });
    if (statusFilter !== 'all') query = query.eq('status', statusFilter);

    const { data } = await query;
    if (data) {
      const userIds = [...new Set(data.filter((t: any) => t.user_id).map((t: any) => t.user_id))];
      const { data: profiles } = userIds.length > 0
        ? await supabase.from('profiles').select('id, full_name, email').in('id', userIds)
        : { data: [] };

      const profileMap: Record<string, any> = {};
      profiles?.forEach((p: any) => { profileMap[p.id] = p; });

      setTickets(data.map((t: any) => ({
        ...t,
        user_name: t.user_id ? (profileMap[t.user_id]?.full_name || 'Unknown') : 'N/A',
        user_email: t.user_id ? (profileMap[t.user_id]?.email || '') : '',
      })));
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => {
    if (isAdminOrStaff) fetchTickets();
  }, [isAdminOrStaff, fetchTickets]);

  if (authLoading || !user || !isAdminOrStaff) return null;

  const filtered = tickets.filter(t => {
    if (!search) return true;
    const q = search.toLowerCase();
    return t.subject.toLowerCase().includes(q) || t.order_id?.toLowerCase().includes(q) || t.user_name?.toLowerCase().includes(q);
  });

  const stats = {
    open: tickets.filter(t => t.status === 'open').length,
    pending: tickets.filter(t => t.status === 'pending').length,
    resolved: tickets.filter(t => t.status === 'resolved').length,
    total: tickets.length,
  };

  const handleUpdateTicket = async (id: string, updates: Partial<Ticket>) => {
    const { error } = await supabase.from('support_tickets').update(updates as any).eq('id', id);
    if (error) { toast.error('Failed to update ticket'); return; }
    await log({ action: 'ticket_updated', entity_type: 'support_ticket', entity_id: id, changes: updates as any });
    toast.success('Ticket updated');
    fetchTickets();
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-display font-bold">Support & Issues</h2>
            <p className="text-muted-foreground text-sm">Manage customer support tickets</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => setShowCreate(true)} className="gap-1.5">
              <Plus className="w-3.5 h-3.5" /> New Ticket
            </Button>
            <Button variant="outline" size="sm" onClick={fetchTickets}><RefreshCw className="w-3.5 h-3.5" /></Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Open', value: stats.open, icon: AlertCircle, color: 'text-destructive' },
            { label: 'Pending', value: stats.pending, icon: Clock, color: 'text-primary' },
            { label: 'Resolved', value: stats.resolved, icon: CheckCircle, color: 'text-success' },
            { label: 'Total', value: stats.total, icon: LifeBuoy, color: 'text-muted-foreground' },
          ].map(s => (
            <div key={s.label} className="bg-card rounded-xl p-4 border border-border card-shadow">
              <div className="flex items-center gap-2 mb-2">
                <s.icon className={`w-4 h-4 ${s.color}`} />
                <span className="text-xs text-muted-foreground font-medium">{s.label}</span>
              </div>
              <p className="text-xl font-display font-bold">{s.value}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search by subject, order, user..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-2">
            {['all', ...STATUSES].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter === s ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}`}>
                {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Tickets */}
        {loading ? (
          <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="bg-card rounded-xl border border-border p-12 text-center">
            <LifeBuoy className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">No tickets found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(ticket => (
              <div key={ticket.id} className="bg-card rounded-xl border border-border p-4 card-shadow hover:bg-muted/20 transition-colors cursor-pointer" onClick={() => setEditTicket(ticket)}>
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h4 className="text-sm font-semibold truncate">{ticket.subject || 'No subject'}</h4>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        ticket.status === 'open' ? 'bg-destructive/10 text-destructive' :
                        ticket.status === 'pending' ? 'bg-primary/10 text-primary' :
                        'bg-success/10 text-success'
                      }`}>{ticket.status}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{ticket.category}</span>
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground">
                      <span>{ticket.user_name}</span>
                      {ticket.order_id && <span className="font-mono">{ticket.order_id}</span>}
                      <span>{new Date(ticket.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreate && <CreateTicketDialog onClose={() => { setShowCreate(false); fetchTickets(); }} />}
      {editTicket && <TicketDetailDialog ticket={editTicket} isAdmin={isAdmin} onClose={() => { setEditTicket(null); fetchTickets(); }} onUpdate={handleUpdateTicket} />}
    </AdminLayout>
  );
};

const CreateTicketDialog = ({ onClose }: { onClose: () => void }) => {
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('other');
  const [orderId, setOrderId] = useState('');
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!subject.trim()) { toast.error('Subject is required'); return; }
    setSaving(true);
    const { error } = await supabase.from('support_tickets').insert({
      subject, description, category, order_id: orderId || null
    } as any);
    if (error) toast.error('Failed to create ticket: ' + error.message);
    else toast.success('Ticket created');
    setSaving(false);
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle className="font-display">Create Support Ticket</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div><Label>Subject</Label><Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Brief issue description" className="mt-1" /></div>
          <div><Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Linked Order ID (optional)</Label><Input value={orderId} onChange={e => setOrderId(e.target.value)} placeholder="DS-XXXXXXXX" className="mt-1" /></div>
          <div><Label>Description</Label><Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Detailed description..." className="mt-1" rows={3} /></div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={handleCreate} disabled={saving} className="flex-1">{saving ? 'Creating...' : 'Create Ticket'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

const TicketDetailDialog = ({ ticket, isAdmin, onClose, onUpdate }: { ticket: Ticket; isAdmin: boolean; onClose: () => void; onUpdate: (id: string, updates: any) => Promise<void> }) => {
  const [status, setStatus] = useState(ticket.status);
  const [adminNotes, setAdminNotes] = useState(ticket.admin_notes || '');

  const handleSave = async () => {
    const updates: any = { status, admin_notes: adminNotes };
    if (status === 'resolved' && ticket.status !== 'resolved') updates.resolved_at = new Date().toISOString();
    await onUpdate(ticket.id, updates);
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">Ticket: {ticket.subject}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="bg-secondary rounded-xl p-4 space-y-2 text-sm">
            <div className="flex justify-between"><span className="text-muted-foreground">User</span><span className="font-medium">{ticket.user_name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Category</span><span className="capitalize">{ticket.category}</span></div>
            {ticket.order_id && <div className="flex justify-between"><span className="text-muted-foreground">Order</span><span className="font-mono text-xs">{ticket.order_id}</span></div>}
            <div className="flex justify-between"><span className="text-muted-foreground">Created</span><span className="text-xs">{new Date(ticket.created_at).toLocaleString()}</span></div>
          </div>
          {ticket.description && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">Description</p>
              <p className="text-sm bg-muted/30 rounded-lg p-3">{ticket.description}</p>
            </div>
          )}
          {isAdmin && (
            <div className="border-t border-border pt-4 space-y-3">
              <div><Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Admin Notes</Label><Textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} placeholder="Internal notes..." className="mt-1" rows={3} /></div>
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Close</Button>
            {isAdmin && <Button onClick={handleSave} className="flex-1">Save Changes</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AdminSupport;
