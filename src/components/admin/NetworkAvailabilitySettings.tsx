import { useState, useEffect } from 'react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Wifi, WifiOff, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Network } from '@/data/bundles';

const NETWORKS: Network[] = ['MTN', 'Telecel', 'AirtelTigo'];

const networkColors: Record<Network, string> = {
  MTN: 'bg-mtn/10 border-mtn/20',
  Telecel: 'bg-telecel/10 border-telecel/20',
  AirtelTigo: 'bg-airteltigo/10 border-airteltigo/20',
};

const networkIconColors: Record<Network, string> = {
  MTN: 'text-mtn',
  Telecel: 'text-telecel',
  AirtelTigo: 'text-airteltigo',
};

interface NetworkState {
  available: boolean;
  message: string;
}

const NetworkAvailabilitySettings = () => {
  const [state, setState] = useState<Record<Network, NetworkState>>({
    MTN: { available: true, message: '' },
    Telecel: { available: true, message: '' },
    AirtelTigo: { available: true, message: '' },
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Network | null>(null);

  useEffect(() => {
    const keys = NETWORKS.flatMap(n => [`network_available_${n}`, `network_message_${n}`]);
    supabase
      .from('site_settings')
      .select('key, value')
      .in('key', keys)
      .then(({ data }) => {
        if (data) {
          const map: Record<string, string> = {};
          data.forEach((r: any) => { map[r.key] = r.value; });
          const next = { ...state };
          for (const n of NETWORKS) {
            next[n] = {
              available: map[`network_available_${n}`] !== 'false',
              message: map[`network_message_${n}`] || '',
            };
          }
          setState(next);
        }
        setLoading(false);
      });
  }, []);

  const handleToggle = async (network: Network, checked: boolean) => {
    const prev = state[network].available;
    setState(s => ({ ...s, [network]: { ...s[network], available: checked } }));

    const { error } = await supabase
      .from('site_settings')
      .update({ value: checked ? 'true' : 'false', updated_at: new Date().toISOString() })
      .eq('key', `network_available_${network}`);

    if (error) {
      toast.error(`Failed to update ${network} availability`);
      setState(s => ({ ...s, [network]: { ...s[network], available: prev } }));
    } else {
      toast.success(`${network} ${checked ? 'enabled' : 'disabled'} for new orders`);
    }
  };

  const handleSaveMessage = async (network: Network) => {
    setSaving(network);
    const { error } = await supabase
      .from('site_settings')
      .update({ value: state[network].message, updated_at: new Date().toISOString() })
      .eq('key', `network_message_${network}`);

    if (error) {
      toast.error(`Failed to save ${network} message`);
    } else {
      toast.success(`${network} message saved`);
    }
    setSaving(null);
  };

  if (loading) return <div className="h-32 animate-pulse bg-muted rounded-xl" />;

  return (
    <div className="space-y-4">
      {NETWORKS.map(network => {
        const ns = state[network];
        return (
          <div key={network} className={`rounded-xl border p-4 space-y-3 ${networkColors[network]}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Smartphone className={`w-5 h-5 ${networkIconColors[network]}`} />
                <div>
                  <p className="font-semibold text-sm">{network}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {ns.available ? 'Accepting new orders' : 'Blocked for new orders'}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {ns.available ? (
                  <Wifi className="w-4 h-4 text-success" />
                ) : (
                  <WifiOff className="w-4 h-4 text-destructive" />
                )}
                <Switch checked={ns.available} onCheckedChange={c => handleToggle(network, c)} />
              </div>
            </div>

            {!ns.available && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">Custom unavailable message</Label>
                <div className="flex gap-2">
                  <Input
                    value={ns.message}
                    onChange={e => setState(s => ({ ...s, [network]: { ...s[network], message: e.target.value } }))}
                    placeholder={`${network} orders are temporarily unavailable...`}
                    className="text-sm h-9"
                    maxLength={200}
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleSaveMessage(network)}
                    disabled={saving === network}
                    className="shrink-0"
                  >
                    {saving === network ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default NetworkAvailabilitySettings;
