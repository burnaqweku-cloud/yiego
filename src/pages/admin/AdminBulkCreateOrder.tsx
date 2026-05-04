import { useState, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, Search, PackagePlus, Copy, AlertCircle, CheckCircle2 } from 'lucide-react';

const NETWORKS = ['MTN', 'Telecel', 'AirtelTigo'];
const SUPPLIERS = [
  { code: 'SUPPLIER_A', label: 'Supplier A' },
  { code: 'DATAMART', label: 'Supplier B / DataMart' },
  { code: 'DATACART', label: 'Supplier C / DataCart' },
];

interface UserOption { id: string; full_name: string; email: string | null; phone: string; }

interface ParsedRow { line: number; raw: string; phone?: string; gb?: number; error?: string; }

interface DispatchResultRow {
  line: number; phone: string; gb: number;
  order_id?: string; created: boolean; dispatched: boolean;
  supplier_status?: string | null; supplier_message?: string | null;
  supplier_order_id?: string | null; error?: string;
}

function normalizePhone(raw: string): string {
  let p = raw.trim().replace(/[\s\-()]/g, '');
  if (p.startsWith('+233')) p = '0' + p.slice(4);
  else if (p.startsWith('233') && p.length === 12) p = '0' + p.slice(3);
  return p;
}

function parseClientLines(text: string): ParsedRow[] {
  const out: ParsedRow[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;
    const lineNo = i + 1;
    const parts = trimmed.split(/[\s,]+/).filter(Boolean);
    if (parts.length < 2) { out.push({ line: lineNo, raw: trimmed, error: 'Missing bundle value' }); continue; }
    const phone = normalizePhone(parts[0]);
    const gb = Number(parts[1]);
    if (!/^0\d{9}$/.test(phone)) { out.push({ line: lineNo, raw: trimmed, error: 'Invalid phone number' }); continue; }
    if (!Number.isFinite(gb) || gb <= 0) { out.push({ line: lineNo, raw: trimmed, error: 'Invalid bundle value' }); continue; }
    out.push({ line: lineNo, raw: trimmed, phone, gb });
  }
  return out;
}

const AdminBulkCreateOrder = () => {
  const { user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [network, setNetwork] = useState('');
  const [supplier, setSupplier] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserOption | null>(null);
  const [searching, setSearching] = useState(false);
  const [linesText, setLinesText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState<{
    total_lines: number; valid_lines: number;
    created_count: number; dispatched_count: number; failed_count: number;
    results: DispatchResultRow[];
  } | null>(null);

  const parsed = useMemo(() => parseClientLines(linesText), [linesText]);
  const errorRows = parsed.filter((r) => r.error);
  const validRows = parsed.filter((r) => !r.error);

  const handleUserSearch = useCallback(async () => {
    if (!userSearch.trim()) return;
    setSearching(true);
    const q = userSearch.trim();
    const { data } = await supabase.from('profiles').select('id, full_name, email, phone')
      .or(`email.ilike.%${q}%,full_name.ilike.%${q}%,phone.ilike.%${q}%,id.eq.${q.length === 36 ? q : '00000000-0000-0000-0000-000000000000'}`)
      .limit(20);
    setUsers((data as UserOption[]) || []);
    setSearching(false);
  }, [userSearch]);

  const canSubmit = !!network && !!supplier && !!selectedUser && validRows.length > 0 && errorRows.length === 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !user) return;
    const total = validRows.length;
    if (!window.confirm(`Dispatch ${total} order${total === 1 ? '' : 's'} through ${supplier}?\n\nThis bypasses the duplicate-active-order rule and does NOT deduct from ${selectedUser!.full_name}.`)) return;
    setSubmitting(true);
    setResults(null);
    try {
      const { data, error } = await supabase.functions.invoke('admin-bulk-create-order', {
        body: {
          network,
          supplier_code: supplier,
          user_id: selectedUser!.id,
          lines_text: linesText,
          mode: 'dispatch',
        },
      });
      if (error) throw error;
      if (data?.error) {
        if (data?.validation_errors) {
          toast.error(`Validation failed: ${data.validation_errors.length} line(s)`);
        } else {
          toast.error(data.error);
        }
        return;
      }
      setResults(data);
      toast.success(`Dispatched ${data.dispatched_count}/${data.created_count} orders`);
    } catch (err: any) {
      toast.error(err.message || 'Bulk dispatch failed');
    } finally {
      setSubmitting(false);
    }
  };

  const copyOrderIds = () => {
    if (!results) return;
    const ids = results.results.filter((r) => r.order_id).map((r) => r.order_id).join('\n');
    navigator.clipboard.writeText(ids);
    toast.success('Order IDs copied');
  };

  if (!isAdmin) {
    return <AdminLayout><div className="p-8 text-center text-sm text-muted-foreground">Admin role required.</div></AdminLayout>;
  }

  return (
    <AdminLayout>
      <div className="space-y-4 max-w-4xl">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate('/admin/bulk-orders')} className="gap-1">
            <ArrowLeft className="w-4 h-4" /> Back
          </Button>
          <h2 className="text-xl font-display font-bold">Bulk Create Order</h2>
        </div>

        {!results && (
          <>
            <Card>
              <CardHeader><CardTitle className="text-sm">1. Network & Supplier</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs">Network</Label>
                    <Select value={network} onValueChange={setNetwork}>
                      <SelectTrigger><SelectValue placeholder="Select network" /></SelectTrigger>
                      <SelectContent>{NETWORKS.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Supplier</Label>
                    <Select value={supplier} onValueChange={setSupplier}>
                      <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                      <SelectContent>{SUPPLIERS.map((s) => <SelectItem key={s.code} value={s.code}>{s.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-sm">2. Order Owner (no wallet deduction)</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input placeholder="Search by email, name, phone, or user ID…" value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleUserSearch()} />
                  <Button variant="outline" onClick={handleUserSearch} disabled={searching}>
                    {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                  </Button>
                </div>
                {selectedUser ? (
                  <div className="p-3 rounded-lg border border-primary bg-primary/5 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{selectedUser.full_name}</p>
                      <p className="text-xs text-muted-foreground">{selectedUser.email || selectedUser.phone}</p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedUser(null)}>Change</Button>
                  </div>
                ) : (
                  <div className="max-h-48 overflow-y-auto space-y-1.5">
                    {users.map((u) => (
                      <div key={u.id} className="p-2 rounded-md border border-border hover:bg-muted/40 cursor-pointer" onClick={() => setSelectedUser(u)}>
                        <p className="text-sm font-medium">{u.full_name}</p>
                        <p className="text-xs text-muted-foreground">{u.email || u.phone}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">3. Paste Orders</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  One order per line: <code className="bg-muted px-1 rounded">phone_number bundle_value</code>. Example:
                </p>
                <pre className="text-xs bg-muted/40 rounded p-2 mt-1 leading-tight">
{`0241234567 5
0551234567 10
0201234567 5`}
                </pre>
              </CardHeader>
              <CardContent className="space-y-3">
                <Textarea rows={8} value={linesText} onChange={(e) => setLinesText(e.target.value)}
                  placeholder="0241234567 5"
                  className="font-mono text-sm" />
                {parsed.length > 0 && (
                  <div className="text-xs space-y-1">
                    <div className="flex gap-2">
                      <Badge variant="outline">{parsed.length} parsed</Badge>
                      <Badge variant="outline" className="text-emerald-600">{validRows.length} valid</Badge>
                      {errorRows.length > 0 && <Badge variant="destructive">{errorRows.length} error{errorRows.length === 1 ? '' : 's'}</Badge>}
                    </div>
                    {errorRows.length > 0 && (
                      <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 space-y-0.5 max-h-40 overflow-y-auto">
                        {errorRows.map((r) => (
                          <div key={r.line} className="text-xs flex gap-2">
                            <AlertCircle className="w-3 h-3 text-destructive shrink-0 mt-0.5" />
                            <span><b>Line {r.line}:</b> {r.error} <span className="text-muted-foreground">— "{r.raw}"</span></span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => navigate('/admin/bulk-orders')}>Cancel</Button>
              <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-1.5">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <PackagePlus className="w-4 h-4" />}
                Dispatch {validRows.length || ''} Order{validRows.length === 1 ? '' : 's'}
              </Button>
            </div>
          </>
        )}

        {results && (
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Bulk Dispatch Result
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
                <div className="p-2 rounded-md bg-muted/40"><div className="text-muted-foreground">Parsed</div><div className="font-bold text-base">{results.total_lines}</div></div>
                <div className="p-2 rounded-md bg-muted/40"><div className="text-muted-foreground">Valid</div><div className="font-bold text-base">{results.valid_lines}</div></div>
                <div className="p-2 rounded-md bg-muted/40"><div className="text-muted-foreground">Created</div><div className="font-bold text-base">{results.created_count}</div></div>
                <div className="p-2 rounded-md bg-emerald-500/10"><div className="text-muted-foreground">Dispatched</div><div className="font-bold text-base text-emerald-600">{results.dispatched_count}</div></div>
                <div className="p-2 rounded-md bg-destructive/10"><div className="text-muted-foreground">Failed</div><div className="font-bold text-base text-destructive">{results.failed_count}</div></div>
              </div>

              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyOrderIds} className="gap-1.5"><Copy className="w-3.5 h-3.5" /> Copy Order IDs</Button>
                <Button size="sm" variant="outline" onClick={() => { setResults(null); setLinesText(''); }}>New Bulk</Button>
                <Button size="sm" onClick={() => navigate('/admin/bulk-orders')}>View Bulk Orders</Button>
              </div>

              <div className="border border-border rounded-md max-h-[420px] overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left">#</th>
                      <th className="px-2 py-1.5 text-left">Order</th>
                      <th className="px-2 py-1.5 text-left">Phone</th>
                      <th className="px-2 py-1.5 text-right">GB</th>
                      <th className="px-2 py-1.5 text-left">Status</th>
                      <th className="px-2 py-1.5 text-left">Supplier Msg</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {results.results.map((r) => (
                      <tr key={r.line} className={r.dispatched ? '' : 'bg-destructive/5'}>
                        <td className="px-2 py-1.5">{r.line}</td>
                        <td className="px-2 py-1.5 font-mono">{r.order_id || '—'}</td>
                        <td className="px-2 py-1.5 font-mono">{r.phone}</td>
                        <td className="px-2 py-1.5 text-right">{r.gb}</td>
                        <td className="px-2 py-1.5">
                          {r.dispatched
                            ? <Badge variant="outline" className="text-emerald-600">Dispatched</Badge>
                            : r.created
                              ? <Badge variant="destructive">Failed dispatch</Badge>
                              : <Badge variant="destructive">Not created</Badge>}
                        </td>
                        <td className="px-2 py-1.5 text-muted-foreground truncate max-w-[260px]">{r.supplier_message || r.error || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
};

export default AdminBulkCreateOrder;
