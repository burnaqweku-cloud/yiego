import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePricing, type PricingConfig, type AgentPricingMethod } from '@/hooks/usePricing';
import { useAdmin, type DbBundle } from '@/contexts/AdminContext';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Percent, Save, Calculator, RefreshCw } from 'lucide-react';
import { formatPrice, NETWORKS } from '@/data/bundles';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const AGENT_METHOD_LABELS: Record<AgentPricingMethod, string> = {
  retail_minus_fixed: 'Retail Price - Discount (GHS)',
  retail_minus_percent: 'Retail Price × (1 - Discount%)',
  cost_plus_fixed: 'Supplier Cost + Buffer (GHS)',
  cost_plus_percent: 'Supplier Cost × (1 + Buffer%)',
};

const PricingGlobalSettings = () => {
  const { config, loadingPricing, refreshPricing, getOverride, computeAgentAutoPrice, getSellingPrice, applyRounding } = usePricing();
  const { bundles, refreshBundles } = useAdmin();

  const configToFormState = (c: PricingConfig) => ({
    default_markup_percent: c.default_markup_percent.toString(),
    mtn_markup_percent: c.mtn_markup_percent?.toString() || '',
    telecel_markup_percent: c.telecel_markup_percent?.toString() || '',
    airteltigo_markup_percent: c.airteltigo_markup_percent?.toString() || '',
    rounding_mode: c.rounding_mode,
    rounding_step: c.rounding_step.toString(),
    normal_markup_type: c.normal_markup_type,
    normal_markup_fixed: c.normal_markup_fixed.toString(),
    agent_pricing_method: c.agent_pricing_method,
    agent_discount_fixed: c.agent_discount_fixed.toString(),
    agent_discount_percent: c.agent_discount_percent.toString(),
    agent_buffer_fixed: c.agent_buffer_fixed.toString(),
    agent_buffer_percent: c.agent_buffer_percent.toString(),
    agent_mtn_value: c.agent_mtn_value?.toString() || '',
    agent_telecel_value: c.agent_telecel_value?.toString() || '',
    agent_airteltigo_value: c.agent_airteltigo_value?.toString() || '',
  });

  const [settings, setSettings] = useState(configToFormState(config));
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [previewCost, setPreviewCost] = useState('10');
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const hasSyncedFromDb = useRef(false);

  // Sync form state from DB config when it loads or after save triggers re-fetch
  useEffect(() => {
    if (!loadingPricing && !hasSyncedFromDb.current) {
      setSettings(configToFormState(config));
      hasSyncedFromDb.current = true;
    }
  }, [loadingPricing, config]);

  // Load initial "last saved" timestamp
  useEffect(() => {
    supabase
      .from('site_settings')
      .select('updated_at')
      .eq('key', 'agent_pricing_method')
      .maybeSingle()
      .then(({ data }) => {
        if (data?.updated_at) setLastSaved(data.updated_at);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const rows = Object.entries(settings).map(([key, value]) => ({
        key,
        value: String(value),
        updated_at: new Date().toISOString(),
      }));

      const { error } = await supabase
        .from('site_settings')
        .upsert(rows, { onConflict: 'key' });

      if (error) {
        console.error('[GlobalSettings] Failed to save:', error);
        throw new Error(`Failed to save settings: ${error.message}`);
      }

      // Fetch last updated timestamp
      const { data: tsRow } = await supabase
        .from('site_settings')
        .select('updated_at')
        .eq('key', 'agent_pricing_method')
        .maybeSingle();
      if (tsRow?.updated_at) setLastSaved(tsRow.updated_at);

      toast.success('Global pricing settings saved');
      // Re-fetch from DB and re-sync form
      await refreshPricing();
      hasSyncedFromDb.current = false; // allow next sync
    } catch (err: any) {
      console.error('[GlobalSettings] Save error:', err);
      toast.error(err.message || 'Failed to save settings');
    }
    setSaving(false);
  };

  /**
   * Compute agent auto price using LOCAL form settings (not stale hook config).
   * This avoids the bug where React state hasn't updated after save.
   */
  const computeAgentAutoPriceLocal = (bundle: DbBundle): number => {
    const retailPrice = getSellingPrice(bundle);
    const costPrice = bundle.cost_price_ghs != null ? Number(bundle.cost_price_ghs) : 0;
    const method = settings.agent_pricing_method;

    // Get per-network override from local settings
    const n = bundle.network.toLowerCase();
    const networkOverrideStr = 
      n === 'mtn' ? settings.agent_mtn_value :
      n === 'telecel' ? settings.agent_telecel_value :
      n === 'airteltigo' ? settings.agent_airteltigo_value : '';
    const networkOverride = networkOverrideStr ? parseFloat(networkOverrideStr) : null;

    let basePrice: number;
    switch (method) {
      case 'retail_minus_fixed': {
        const discount = networkOverride ?? (parseFloat(settings.agent_discount_fixed) || 0);
        basePrice = retailPrice - discount;
        break;
      }
      case 'retail_minus_percent': {
        const discountPct = networkOverride ?? (parseFloat(settings.agent_discount_percent) || 0);
        basePrice = retailPrice * (1 - discountPct / 100);
        break;
      }
      case 'cost_plus_fixed': {
        const buffer = networkOverride ?? (parseFloat(settings.agent_buffer_fixed) || 0);
        basePrice = costPrice > 0 ? costPrice + buffer : retailPrice * 0.85;
        break;
      }
      case 'cost_plus_percent': {
        const bufferPct = networkOverride ?? (parseFloat(settings.agent_buffer_percent) || 0);
        basePrice = costPrice > 0 ? costPrice * (1 + bufferPct / 100) : retailPrice * 0.85;
        break;
      }
      default:
        basePrice = retailPrice * 0.9;
    }

    return applyRounding(Math.max(basePrice, 0));
  };

  const handleApplyToAutoBundles = async () => {
    setApplying(true);
    try {
      // First save settings to DB
      await handleSave();
      
      const activeBundles = bundles.filter(b => b.active);
      let updated = 0;
      let skipped = 0;
      
      for (const bundle of activeBundles) {
        const ov = getOverride(bundle.id, 'agent');
        // Only apply to auto bundles (no override or auto mode)
        if (!ov || ov.pricing_mode === 'auto') {
          // Use LOCAL computation to avoid stale hook config
          const agentBasePrice = computeAgentAutoPriceLocal(bundle);
          
          if (ov) {
            await supabase
              .from('pricing_overrides')
              .update({ manual_price: agentBasePrice, pricing_mode: 'auto' })
              .eq('id', ov.id);
          } else {
            await supabase
              .from('pricing_overrides')
              .insert({
                product_id: bundle.id,
                customer_type: 'agent',
                pricing_mode: 'auto',
                manual_price: agentBasePrice,
              });
          }
          updated++;
        } else {
          skipped++;
        }
      }
      
      toast.success(`Updated ${updated} bundles. Skipped ${skipped} manual bundles.`);
      await refreshPricing();
    } catch (err: any) {
      console.error('[ApplyToAuto]', err);
      toast.error(err.message || 'Failed to apply');
    }
    setApplying(false);
  };

  const handleSwitchAllToAuto = async () => {
    setApplying(true);
    try {
      await handleSave();
      
      const activeBundles = bundles.filter(b => b.active);
      for (const bundle of activeBundles) {
        const ov = getOverride(bundle.id, 'agent');
        const agentBasePrice = computeAgentAutoPriceLocal(bundle);
        
        if (ov) {
          await supabase
            .from('pricing_overrides')
            .update({ pricing_mode: 'auto', manual_price: agentBasePrice })
            .eq('id', ov.id);
        } else {
          await supabase
            .from('pricing_overrides')
            .insert({
              product_id: bundle.id,
              customer_type: 'agent',
              pricing_mode: 'auto',
              manual_price: agentBasePrice,
            });
        }
      }
      
      toast.success('All bundles switched to Auto mode');
      await refreshPricing();
    } catch {
      toast.error('Failed to switch');
    }
    setApplying(false);
  };

  const handleSwitchAllToManual = async () => {
    setApplying(true);
    try {
      const activeBundles = bundles.filter(b => b.active);
      for (const bundle of activeBundles) {
        const ov = getOverride(bundle.id, 'agent');
        if (ov && ov.pricing_mode === 'auto') {
          await supabase
            .from('pricing_overrides')
            .update({ pricing_mode: 'manual' })
            .eq('id', ov.id);
        }
      }
      
      toast.success('All auto bundles switched to Manual (prices kept)');
      await refreshPricing();
    } catch {
      toast.error('Failed to switch');
    }
    setApplying(false);
  };

  // Get agent method value description
  const getAgentMethodValueLabel = (): string => {
    switch (settings.agent_pricing_method) {
      case 'retail_minus_fixed': return 'Discount Amount (GHS)';
      case 'retail_minus_percent': return 'Discount (%)';
      case 'cost_plus_fixed': return 'Buffer Amount (GHS)';
      case 'cost_plus_percent': return 'Buffer (%)';
      default: return 'Value';
    }
  };

  const getAgentMethodValue = (): string => {
    switch (settings.agent_pricing_method) {
      case 'retail_minus_fixed': return settings.agent_discount_fixed;
      case 'retail_minus_percent': return settings.agent_discount_percent;
      case 'cost_plus_fixed': return settings.agent_buffer_fixed;
      case 'cost_plus_percent': return settings.agent_buffer_percent;
      default: return '0';
    }
  };

  const setAgentMethodValue = (val: string) => {
    switch (settings.agent_pricing_method) {
      case 'retail_minus_fixed':
        setSettings(s => ({ ...s, agent_discount_fixed: val }));
        break;
      case 'retail_minus_percent':
        setSettings(s => ({ ...s, agent_discount_percent: val }));
        break;
      case 'cost_plus_fixed':
        setSettings(s => ({ ...s, agent_buffer_fixed: val }));
        break;
      case 'cost_plus_percent':
        setSettings(s => ({ ...s, agent_buffer_percent: val }));
        break;
    }
  };

  const getNetworkOverrideLabel = (): string => {
    switch (settings.agent_pricing_method) {
      case 'retail_minus_fixed': return 'Discount (GHS)';
      case 'retail_minus_percent': return 'Discount (%)';
      case 'cost_plus_fixed': return 'Buffer (GHS)';
      case 'cost_plus_percent': return 'Buffer (%)';
      default: return 'Value';
    }
  };

  // Preview calculations
  const cost = parseFloat(previewCost) || 0;
  const normalMarkup = parseFloat(settings.default_markup_percent) || 0;
  const normalPrice = settings.normal_markup_type === 'fixed'
    ? cost + (parseFloat(settings.normal_markup_fixed) || 0)
    : cost * (1 + normalMarkup / 100);
  
  const agentMethodValue = parseFloat(getAgentMethodValue()) || 0;
  let agentPrice: number;
  switch (settings.agent_pricing_method) {
    case 'retail_minus_fixed':
      agentPrice = normalPrice - agentMethodValue;
      break;
    case 'retail_minus_percent':
      agentPrice = normalPrice * (1 - agentMethodValue / 100);
      break;
    case 'cost_plus_fixed':
      agentPrice = cost + agentMethodValue;
      break;
    case 'cost_plus_percent':
      agentPrice = cost * (1 + agentMethodValue / 100);
      break;
    default:
      agentPrice = normalPrice * 0.9;
  }

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Normal Pricing Rules */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Percent className="w-4 h-4 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Normal Customer Markup</h3>
            <p className="text-[10px] text-muted-foreground">Applied when a product uses auto pricing</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Markup Type</Label>
            <Select value={settings.normal_markup_type} onValueChange={v => setSettings(s => ({ ...s, normal_markup_type: v as 'percent' | 'fixed' }))}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="percent">Percentage (%)</SelectItem>
                <SelectItem value="fixed">Fixed Amount (GHS)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {settings.normal_markup_type === 'percent' ? (
            <div>
              <Label className="text-xs">Default Markup (%)</Label>
              <Input type="number" value={settings.default_markup_percent} onChange={e => setSettings(s => ({ ...s, default_markup_percent: e.target.value }))} className="mt-1 h-9" min="0" step="0.5" />
            </div>
          ) : (
            <div>
              <Label className="text-xs">Fixed Markup (GHS)</Label>
              <Input type="number" value={settings.normal_markup_fixed} onChange={e => setSettings(s => ({ ...s, normal_markup_fixed: e.target.value }))} className="mt-1 h-9" min="0" step="0.5" />
            </div>
          )}
        </div>

        {settings.normal_markup_type === 'percent' && (
          <div>
            <Label className="text-xs text-muted-foreground mb-2 block">Per-Network Override (leave empty for default)</Label>
            <div className="grid grid-cols-3 gap-3">
              {NETWORKS.map(n => (
                <div key={n}>
                  <Label className="text-[10px]">{n} (%)</Label>
                  <Input
                    type="number"
                    value={settings[`${n.toLowerCase()}_markup_percent` as keyof typeof settings]}
                    onChange={e => setSettings(s => ({ ...s, [`${n.toLowerCase()}_markup_percent`]: e.target.value }))}
                    placeholder={`${settings.default_markup_percent}%`}
                    className="mt-0.5 h-8 text-xs"
                    min="0"
                    step="0.5"
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Agent Pricing Rules */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-accent/20 flex items-center justify-center">
            <Percent className="w-4 h-4 text-accent-foreground" />
          </div>
          <div>
            <h3 className="font-semibold text-sm">Agent Base Price Method</h3>
            <p className="text-[10px] text-muted-foreground">How agent base prices (what agents buy at) are computed</p>
          </div>
        </div>

        <div>
          <Label className="text-xs">Pricing Method</Label>
          <Select value={settings.agent_pricing_method} onValueChange={v => setSettings(s => ({ ...s, agent_pricing_method: v as AgentPricingMethod }))}>
            <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(AGENT_METHOD_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs">{getAgentMethodValueLabel()}</Label>
          <Input
            type="number"
            value={getAgentMethodValue()}
            onChange={e => setAgentMethodValue(e.target.value)}
            className="mt-1 h-9"
            min="0"
            step="0.5"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            {settings.agent_pricing_method === 'retail_minus_fixed' && `Agent Base = Normal Retail - GHS ${getAgentMethodValue()}`}
            {settings.agent_pricing_method === 'retail_minus_percent' && `Agent Base = Normal Retail × (1 - ${getAgentMethodValue()}%)`}
            {settings.agent_pricing_method === 'cost_plus_fixed' && `Agent Base = Supplier Cost + GHS ${getAgentMethodValue()}`}
            {settings.agent_pricing_method === 'cost_plus_percent' && `Agent Base = Supplier Cost × (1 + ${getAgentMethodValue()}%)`}
          </p>
        </div>

        <div>
          <Label className="text-xs text-muted-foreground mb-2 block">Per-Network Override (leave empty for default)</Label>
          <div className="grid grid-cols-3 gap-3">
            {NETWORKS.map(n => (
              <div key={n}>
                <Label className="text-[10px]">{n} ({getNetworkOverrideLabel()})</Label>
                <Input
                  type="number"
                  value={settings[`agent_${n.toLowerCase()}_value` as keyof typeof settings] || ''}
                  onChange={e => setSettings(s => ({ ...s, [`agent_${n.toLowerCase()}_value`]: e.target.value }))}
                  placeholder="Default"
                  className="mt-0.5 h-8 text-xs"
                  min="0"
                  step="0.5"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Rounding */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-3">
        <h3 className="font-semibold text-sm">Rounding</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Rounding Mode</Label>
            <Select value={settings.rounding_mode} onValueChange={v => setSettings(s => ({ ...s, rounding_mode: v }))}>
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="2_decimals">2 Decimal Places</SelectItem>
                <SelectItem value="nearest_005">Nearest GHS 0.05</SelectItem>
                <SelectItem value="nearest_010">Nearest GHS 0.10</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Rounding Step (GHS)</Label>
            <Input type="number" value={settings.rounding_step} onChange={e => setSettings(s => ({ ...s, rounding_step: e.target.value }))} className="mt-1 h-9" min="0.01" step="0.01" />
          </div>
        </div>
      </div>

      {/* Preview Calculator */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Calculator className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-sm">Preview Calculator</h3>
        </div>
        <div>
          <Label className="text-xs">Supplier Cost (GHS)</Label>
          <Input type="number" value={previewCost} onChange={e => setPreviewCost(e.target.value)} className="mt-1 h-9 w-40" min="0" step="0.5" />
        </div>
        <div className="grid grid-cols-3 gap-4 bg-muted/50 rounded-lg p-4">
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground mb-1">Supplier Cost</p>
            <p className="text-lg font-bold">{formatPrice(cost)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground mb-1">Normal Retail</p>
            <p className="text-lg font-bold text-primary">{formatPrice(Math.round(normalPrice * 100) / 100)}</p>
            <p className="text-[10px] text-muted-foreground">Margin: {formatPrice(Math.round((normalPrice - cost) * 100) / 100)}</p>
          </div>
          <div className="text-center">
            <p className="text-[10px] text-muted-foreground mb-1">Agent Base</p>
            <p className="text-lg font-bold text-emerald-600">{formatPrice(Math.round(agentPrice * 100) / 100)}</p>
            <p className="text-[10px] text-muted-foreground">
              Disc vs Retail: {formatPrice(Math.round((normalPrice - agentPrice) * 100) / 100)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              Supplier Margin: {formatPrice(Math.round((agentPrice - cost) * 100) / 100)}
            </p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="space-y-2">
        <Button onClick={handleSave} disabled={saving || applying} className="w-full gap-2">
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Global Settings'}
        </Button>
        {lastSaved && (
          <p className="text-[10px] text-muted-foreground text-center">
            Last saved: {new Date(lastSaved).toLocaleString()}
          </p>
        )}

        <Button onClick={handleApplyToAutoBundles} disabled={applying} variant="secondary" className="w-full gap-2">
          <RefreshCw className="w-4 h-4" />
          {applying ? 'Applying...' : 'Apply Global Settings to Auto Bundles'}
        </Button>

        <div className="grid grid-cols-2 gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={applying} className="w-full text-xs">
                Switch All to Auto
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Switch all bundles to Auto?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will set ALL agent bundle pricing to Auto mode and recompute prices using the current Global Settings. Manual prices will be overwritten.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleSwitchAllToAuto}>Confirm</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={applying} className="w-full text-xs">
                Switch All to Manual
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Switch all bundles to Manual?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will keep current agent base prices but switch all bundles to Manual mode. Global Settings will no longer auto-update them.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleSwitchAllToManual}>Confirm</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
};

export default PricingGlobalSettings;