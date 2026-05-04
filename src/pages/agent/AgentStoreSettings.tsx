import { useState, useEffect } from 'react';
import { useAgent } from '@/hooks/useAgent';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import AgentLayout from './AgentLayout';
import AgentGate from '@/components/agent/AgentGate';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Store, Calendar, Link as LinkIcon, Copy, Camera } from 'lucide-react';

const GHANA_REGIONS = [
  'Greater Accra', 'Ashanti', 'Eastern', 'Central', 'Western', 'Western North',
  'Volta', 'Oti', 'Northern', 'Savannah', 'North East', 'Upper East',
  'Upper West', 'Bono', 'Bono East', 'Ahafo',
];

const AgentStoreSettings = () => {
  const { agent, refresh, isActiveAgent } = useAgent();
  const [storeName, setStoreName] = useState('');
  const [storeDescription, setStoreDescription] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [storeEmail, setStoreEmail] = useState('');
  const [region, setRegion] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (agent) {
      setStoreName(agent.store_name);
      setStoreDescription(agent.store_description);
      setWhatsappNumber(agent.whatsapp_number);
      setStoreEmail(agent.store_email);
      setRegion(agent.region);
    }
  }, [agent]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !agent) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Logo must be under 2MB');
      return;
    }
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      toast.error('Only JPG, PNG, or WebP images are allowed');
      return;
    }
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'webp'];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !allowedExtensions.includes(ext)) {
      toast.error('Invalid file extension. Use JPG, PNG, or WebP.');
      return;
    }
    setUploadingLogo(true);
    try {
      const path = `${agent.id}/logo.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('agent-logos').upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from('agent-logos').getPublicUrl(path);
      await supabase.from('agents' as any).update({ store_logo_url: publicUrl }).eq('id', agent.id);
      toast.success('Logo uploaded!');
      refresh();
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('row-level security') || msg.includes('violates')) {
        toast.error('You are not allowed to edit this store');
      } else {
        toast.error(msg || 'Logo upload failed');
      }
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async () => {
    if (!agent) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('agents' as any)
        .update({
          store_name: storeName,
          store_description: storeDescription,
          whatsapp_number: whatsappNumber,
          store_email: storeEmail,
          region,
        })
        .eq('id', agent.id);
      if (error) throw error;
      toast.success('Store settings saved!');
      refresh();
    } catch (err: any) {
      const msg = err.message || '';
      if (msg.includes('row-level security') || msg.includes('violates')) {
        toast.error('Store settings could not be saved. Permission denied.');
      } else {
        toast.error(msg || 'Failed to save store settings');
      }
    } finally {
      setSaving(false);
    }
  };

  const storeUrl = agent ? `${window.location.origin}/store/${agent.store_slug}` : '';

  return (
    <AgentGate allowRestricted>
      <AgentLayout>
        <div className="space-y-5 max-w-xl">
          <div>
            <h1 className="text-lg font-bold">Store Settings</h1>
            <p className="text-xs text-muted-foreground">Customize your store's appearance</p>
          </div>

          {/* Logo Upload */}
          <Card className="card-shadow border-border">
            <CardContent className="p-5">
              <h3 className="text-sm font-bold mb-3">Store Logo</h3>
              <div className="flex items-center gap-4">
                <div className="relative w-20 h-20 rounded-2xl bg-muted flex items-center justify-center overflow-hidden border-2 border-dashed border-border">
                  {agent?.store_logo_url ? (
                    <img src={agent.store_logo_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <Store className="w-8 h-8 text-muted-foreground/30" />
                  )}
                  <label className="absolute inset-0 flex items-center justify-center bg-foreground/30 opacity-0 hover:opacity-100 transition-opacity cursor-pointer rounded-2xl">
                    <Camera className="w-6 h-6 text-background" />
                    <input type="file" accept=".jpg,.jpeg,.png,.webp" className="hidden" onChange={handleLogoUpload} disabled={uploadingLogo} />
                  </label>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Click to upload</p>
                  <p className="text-[10px] text-muted-foreground">Max 2MB, JPG or PNG</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Store Info Form */}
          <Card className="card-shadow border-border">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold">Store Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs">Store Name</Label>
                <Input value={storeName} onChange={e => setStoreName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Description</Label>
                <Textarea value={storeDescription} onChange={e => setStoreDescription(e.target.value)} rows={3} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">WhatsApp Number</Label>
                <Input value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Email</Label>
                <Input type="email" value={storeEmail} onChange={e => setStoreEmail(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Region</Label>
                <Select value={region} onValueChange={setRegion}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{GHANA_REGIONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full" size="lg">
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </CardContent>
          </Card>

          {/* Store Meta */}
          <Card className="card-shadow border-border">
            <CardContent className="p-5 space-y-3">
              <h3 className="text-sm font-bold">Store Details</h3>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Created:</span>
                  <span className="text-xs font-medium">
                    {agent?.created_at ? format(new Date(agent.created_at), 'dd MMMM yyyy') : '—'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Store className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Status:</span>
                  <span className={`text-xs font-bold ${isActiveAgent ? 'text-success' : 'text-primary'}`}>
                    {agent?.status}
                  </span>
                </div>
                {isActiveAgent && (
                  <div className="flex items-center gap-2 bg-muted/50 rounded-xl p-2.5 mt-2">
                    <LinkIcon className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <code className="flex-1 text-[11px] truncate text-muted-foreground">{storeUrl}</code>
                    <button
                      onClick={() => { navigator.clipboard.writeText(storeUrl); toast.success('Copied!'); }}
                      className="p-1 hover:bg-muted rounded-lg transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5 text-primary" />
                    </button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </AgentLayout>
    </AgentGate>
  );
};

export default AgentStoreSettings;
