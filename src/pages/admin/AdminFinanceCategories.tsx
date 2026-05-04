import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Pencil, Archive, ArchiveRestore, Tag } from 'lucide-react';
import { useAuditLog } from '@/hooks/useAuditLog';

interface Category {
  id: string;
  name: string;
  description: string | null;
  color_hex: string | null;
  sort_order: number;
  archived: boolean;
  created_at: string;
}

interface CountRow { category_id: string; count: number; }

const AdminFinanceCategories = () => {
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const { log } = useAuditLog();
  const [rows, setRows] = useState<Category[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', color_hex: '#94a3b8', sort_order: 0 });

  useEffect(() => { if (isAdmin === false) { toast.error('Access denied'); navigate('/admin'); } }, [isAdmin, navigate]);

  const load = useCallback(async () => {
    setLoading(true);
    const [catsRes, countRes] = await Promise.all([
      supabase.from('finance_categories').select('*').order('sort_order').order('name'),
      supabase.from('finance_ledger_entries').select('category_id'),
    ]);
    if (catsRes.error) { toast.error(catsRes.error.message); setLoading(false); return; }
    setRows(catsRes.data as Category[]);
    const c: Record<string, number> = {};
    ((countRes.data || []) as { category_id: string | null }[]).forEach(r => {
      if (r.category_id) c[r.category_id] = (c[r.category_id] || 0) + 1;
    });
    setCounts(c);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: '', description: '', color_hex: '#94a3b8', sort_order: 0 });
    setCreating(true);
  };
  const openEdit = (c: Category) => {
    setEditing(c);
    setForm({ name: c.name, description: c.description || '', color_hex: c.color_hex || '#94a3b8', sort_order: c.sort_order });
    setCreating(true);
  };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      color_hex: form.color_hex || null,
      sort_order: Number(form.sort_order) || 0,
    };
    if (editing) {
      const { error } = await supabase.from('finance_categories').update(payload).eq('id', editing.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      await log({ action: 'finance_category_edit', entity_type: 'finance_category', entity_id: editing.id, metadata: payload });
      toast.success('Category updated');
    } else {
      const { data, error } = await supabase.from('finance_categories').insert({ ...payload, created_by: user?.id }).select().single();
      setSaving(false);
      if (error) return toast.error(error.message);
      await log({ action: 'finance_category_create', entity_type: 'finance_category', entity_id: data?.id, metadata: payload });
      toast.success('Category created');
    }
    setCreating(false);
    load();
  };

  const toggleArchive = async (c: Category) => {
    const { error } = await supabase.from('finance_categories').update({ archived: !c.archived }).eq('id', c.id);
    if (error) return toast.error(error.message);
    await log({
      action: c.archived ? 'finance_category_unarchive' : 'finance_category_archive',
      entity_type: 'finance_category', entity_id: c.id,
    });
    toast.success(c.archived ? 'Category restored' : 'Category archived');
    load();
  };

  if (isAdmin === false) return null;

  return (
    <AdminLayout>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <Button size="sm" variant="ghost" onClick={() => navigate('/admin/finance-ledger')}>
            <ArrowLeft className="w-4 h-4 mr-1.5" /> Ledger
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold flex items-center gap-2"><Tag className="w-5 h-5" /> Expense Categories</h1>
            <p className="text-sm text-muted-foreground">Used in Expense and Manual Adjustment entries.</p>
          </div>
          <Button onClick={openCreate} size="sm" className="gap-2"><Plus className="w-4 h-4" /> New Category</Button>
        </div>

        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-4 space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-10" />)}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30 text-left text-muted-foreground">
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Description</th>
                      <th className="px-3 py-2">Color</th>
                      <th className="px-3 py-2 text-right">Sort</th>
                      <th className="px-3 py-2 text-right">Entries</th>
                      <th className="px-3 py-2 text-center">Active</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(c => {
                      const used = counts[c.id] || 0;
                      return (
                        <tr key={c.id} className={`border-b last:border-0 hover:bg-muted/20 ${c.archived ? 'opacity-50' : ''}`}>
                          <td className="px-3 py-2 font-medium">
                            <Badge variant="outline" style={c.color_hex ? { borderColor: c.color_hex, color: c.color_hex } : undefined} className="text-[11px]">
                              {c.name}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-xs text-muted-foreground max-w-xs truncate">{c.description || '—'}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-1 text-xs">
                              <span className="w-3 h-3 rounded-sm border" style={{ backgroundColor: c.color_hex || 'transparent' }} />
                              {c.color_hex || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs">{c.sort_order}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-xs">{used}</td>
                          <td className="px-3 py-2 text-center">
                            <Switch checked={!c.archived} onCheckedChange={() => toggleArchive(c)} />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(c)}><Pencil className="w-3.5 h-3.5" /></Button>
                              <Button
                                size="sm" variant="ghost" className="h-7 w-7 p-0"
                                onClick={() => {
                                  if (used > 0 && !c.archived) return toast.error(`Cannot delete — ${used} entries use this. Archive instead.`);
                                  toggleArchive(c);
                                }}
                                title={c.archived ? 'Restore' : 'Archive'}
                              >
                                {c.archived ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                              </Button>
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
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>{editing ? 'Edit Category' : 'New Category'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label>Color</Label>
                <div className="flex items-center gap-2">
                  <Input type="color" value={form.color_hex} onChange={e => setForm(f => ({ ...f, color_hex: e.target.value }))} className="w-12 h-9 p-1" />
                  <Input value={form.color_hex} onChange={e => setForm(f => ({ ...f, color_hex: e.target.value }))} className="flex-1" />
                </div>
              </div>
              <div className="w-24">
                <Label>Sort</Label>
                <Input type="number" value={form.sort_order} onChange={e => setForm(f => ({ ...f, sort_order: Number(e.target.value) }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
};

export default AdminFinanceCategories;
