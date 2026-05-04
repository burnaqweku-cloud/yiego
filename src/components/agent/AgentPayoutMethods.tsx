import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAgent } from '@/hooks/useAgent';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Plus, Edit2, Star, Trash2, Phone, User, X, Check } from 'lucide-react';

interface PayoutProfile {
  id: string;
  agent_id: string;
  label: string | null;
  momo_number: string;
  momo_name: string;
  network: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

const NETWORK_PREFIXES: Record<string, string[]> = {
  MTN: ['024', '054', '055', '059', '025'],
  Telecel: ['020', '050'],
  AirtelTigo: ['026', '056', '027', '057'],
};

export const detectNetwork = (number: string): string | null => {
  const cleaned = number.replace(/\D/g, '');
  let local = cleaned;
  if (cleaned.startsWith('233') && cleaned.length === 12) local = '0' + cleaned.slice(3);
  if (local.length < 3) return null;
  const prefix = local.slice(0, 3);
  for (const [network, prefixes] of Object.entries(NETWORK_PREFIXES)) {
    if (prefixes.includes(prefix)) return network;
  }
  return null;
};

const maskNumber = (num: string) => {
  if (num.length <= 4) return num;
  return '•'.repeat(num.length - 4) + num.slice(-4);
};

const AgentPayoutMethods = () => {
  const { agent } = useAgent();
  const [profiles, setProfiles] = useState<PayoutProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formLabel, setFormLabel] = useState('');
  const [formNumber, setFormNumber] = useState('');
  const [formName, setFormName] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchProfiles = useCallback(async () => {
    if (!agent) return;
    setLoading(true);
    const { data } = await supabase
      .from('agent_payout_profiles' as any)
      .select('*')
      .eq('agent_id', agent.id)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (data) setProfiles(data as any);
    setLoading(false);
  }, [agent]);

  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);

  const detectedNetwork = detectNetwork(formNumber);

  const resetForm = () => {
    setShowForm(false);
    setEditId(null);
    setFormLabel('');
    setFormNumber('');
    setFormName('');
  };

  const handleEdit = (p: PayoutProfile) => {
    setEditId(p.id);
    setFormLabel(p.label || '');
    setFormNumber(p.momo_number);
    setFormName(p.momo_name);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!agent) return;
    const cleaned = formNumber.replace(/\D/g, '');
    let local = cleaned;
    if (cleaned.startsWith('233') && cleaned.length === 12) local = '0' + cleaned.slice(3);
    if (!/^0[235]\d{8}$/.test(local)) {
      toast.error('Enter a valid Ghana MoMo number');
      return;
    }
    if (formName.trim().length < 4) {
      toast.error('Name on account must be at least 4 characters');
      return;
    }
    if (!editId && profiles.length >= 3) {
      toast.error('Maximum 3 payout methods allowed');
      return;
    }

    setSaving(true);
    try {
      const network = detectNetwork(local);
      const payload = {
        agent_id: agent.id,
        label: formLabel.trim() || null,
        momo_number: local,
        momo_name: formName.trim(),
        network,
        updated_at: new Date().toISOString(),
      };

      if (editId) {
        await (supabase.from('agent_payout_profiles' as any) as any)
          .update(payload).eq('id', editId);
      } else {
        await (supabase.from('agent_payout_profiles' as any) as any)
          .insert({ ...payload, is_default: profiles.length === 0 });
      }
      toast.success(editId ? 'Payout method updated' : 'Payout method added');
      resetForm();
      fetchProfiles();
    } catch (err: any) {
      toast.error(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (id: string) => {
    if (!agent) return;
    // Clear all defaults first
    await (supabase.from('agent_payout_profiles' as any) as any)
      .update({ is_default: false }).eq('agent_id', agent.id);
    await (supabase.from('agent_payout_profiles' as any) as any)
      .update({ is_default: true }).eq('id', id);
    toast.success('Default payout method set');
    fetchProfiles();
  };

  const handleDeactivate = async (id: string) => {
    await (supabase.from('agent_payout_profiles' as any) as any)
      .update({ is_active: false }).eq('id', id);
    toast.success('Payout method removed');
    fetchProfiles();
  };

  const networkBadge = (network: string | null) => {
    if (!network) return null;
    const colors: Record<string, string> = {
      MTN: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
      Telecel: 'bg-red-500/10 text-red-700 dark:text-red-400',
      AirtelTigo: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
    };
    return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${colors[network] || 'bg-muted text-muted-foreground'}`}>{network}</span>;
  };

  return (
    <Card className="card-shadow border-border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-bold">Payout Methods</CardTitle>
          {!showForm && profiles.length < 3 && (
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)} className="h-7 text-xs gap-1">
              <Plus className="w-3 h-3" /> Add
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="flex justify-center py-6"><div className="spinner" /></div>
        ) : profiles.length === 0 && !showForm ? (
          <div className="text-center py-8">
            <Phone className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No payout methods saved</p>
            <p className="text-xs text-muted-foreground mt-1">Add a payout method to withdraw faster</p>
            <Button size="sm" variant="outline" onClick={() => setShowForm(true)} className="mt-3 text-xs gap-1">
              <Plus className="w-3 h-3" /> Add Payout Method
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {profiles.map((p) => (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl bg-muted/30 border border-border/50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold truncate">{p.label || 'Payout Method'}</p>
                    {p.is_default && (
                      <Badge variant="secondary" className="text-[9px] h-4 px-1.5">Default</Badge>
                    )}
                    {networkBadge(p.network)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    <span className="font-mono">{maskNumber(p.momo_number)}</span> · {p.momo_name}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {!p.is_default && (
                    <button onClick={() => handleSetDefault(p.id)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="Set as default">
                      <Star className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  )}
                  <button onClick={() => handleEdit(p)} className="p-1.5 rounded-lg hover:bg-muted transition-colors" title="Edit">
                    <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                  <button onClick={() => handleDeactivate(p.id)} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors" title="Remove">
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {showForm && (
          <div className="border border-border rounded-xl p-4 space-y-3 bg-card">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold">{editId ? 'Edit Method' : 'Add Payout Method'}</p>
              <button onClick={resetForm} className="p-1 rounded hover:bg-muted"><X className="w-4 h-4" /></button>
            </div>
            <div>
              <Label className="text-xs">Label (optional)</Label>
              <Input value={formLabel} onChange={e => setFormLabel(e.target.value)} placeholder='e.g. "My MTN"' className="mt-1" maxLength={30} />
            </div>
            <div>
              <Label className="text-xs">MoMo Number</Label>
              <Input value={formNumber} onChange={e => setFormNumber(e.target.value)} placeholder="0551234567" maxLength={12} className="mt-1" />
              {detectedNetwork && (
                <div className="mt-1 flex items-center gap-1">
                  {networkBadge(detectedNetwork)}
                  <span className="text-[10px] text-muted-foreground">Auto-detected</span>
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs">Name on Account</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Full name on MoMo" className="mt-1" maxLength={60} />
              {formName.length > 0 && formName.trim().length < 4 && (
                <p className="text-[10px] text-destructive mt-1">Must be at least 4 characters</p>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving} size="sm" className="flex-1 gap-1">
                <Check className="w-3 h-3" /> {saving ? 'Saving...' : editId ? 'Update' : 'Save'}
              </Button>
              <Button onClick={resetForm} variant="outline" size="sm">Cancel</Button>
            </div>
          </div>
        )}

        <p className="text-[10px] text-muted-foreground text-center">
          {profiles.length}/3 payout methods
        </p>
      </CardContent>
    </Card>
  );
};

export default AgentPayoutMethods;
