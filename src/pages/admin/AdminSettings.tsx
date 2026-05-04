import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminLayout from './AdminLayout';
import { useAdmin } from '@/contexts/AdminContext';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { MessageCircle, Settings, Trophy, Smartphone, Banknote, CreditCard, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import NetworkAvailabilitySettings from '@/components/admin/NetworkAvailabilitySettings';

const AdminSettings = () => {
  const { supportSettings, updateSupportSettings } = useAdmin();
  const { user, isAdmin, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && (!user || !isAdmin)) navigate('/auth');
  }, [user, isAdmin, loading, navigate]);

  const [leaderboardEnabled, setLeaderboardEnabled] = useState(false);
  const [leaderboardLoading, setLeaderboardLoading] = useState(true);
  const [paystackWdEnabled, setPaystackWdEnabled] = useState(false);
  const [paystackWdLoading, setPaystackWdLoading] = useState(true);
  const [settlementMode, setSettlementMode] = useState<'main' | 'subaccount'>('main');
  const [settlementLoading, setSettlementLoading] = useState(true);

  // Manual deposit payment details
  const [mdActive, setMdActive] = useState(false);
  const [mdMomo, setMdMomo] = useState('');
  const [mdAccountName, setMdAccountName] = useState('');
  const [mdNetwork, setMdNetwork] = useState('');
  const [mdInstructions, setMdInstructions] = useState('');
  const [mdLoading, setMdLoading] = useState(true);
  const [mdSaving, setMdSaving] = useState(false);

  useEffect(() => {
    supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'weekly_leaderboard_enabled')
      .maybeSingle()
      .then(({ data }) => {
        setLeaderboardEnabled(data?.value === 'true');
        setLeaderboardLoading(false);
      });

    supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'withdrawals_paystack_enabled')
      .maybeSingle()
      .then(({ data }) => {
        setPaystackWdEnabled(data?.value === 'true');
        setPaystackWdLoading(false);
      });

    supabase
      .from('site_settings')
      .select('value')
      .eq('key', 'paystack_settlement_mode')
      .maybeSingle()
      .then(({ data }) => {
        setSettlementMode(data?.value === 'subaccount' ? 'subaccount' : 'main');
        setSettlementLoading(false);
      });

    supabase
      .from('site_settings')
      .select('key, value')
      .in('key', [
        'manual_deposit_active',
        'manual_deposit_momo_number',
        'manual_deposit_account_name',
        'manual_deposit_network',
        'manual_deposit_instructions',
      ])
      .then(({ data }) => {
        const map = Object.fromEntries((data || []).map((r: any) => [r.key, r.value || '']));
        setMdActive(map['manual_deposit_active'] === 'true');
        setMdMomo(map['manual_deposit_momo_number'] || '');
        setMdAccountName(map['manual_deposit_account_name'] || '');
        setMdNetwork(map['manual_deposit_network'] || '');
        setMdInstructions(map['manual_deposit_instructions'] || '');
        setMdLoading(false);
      });
  }, []);

  if (loading || !user || !isAdmin) return null;

  const handleSave = () => {
    toast.success('Support settings saved');
  };

  const saveManualDepositSettings = async () => {
    setMdSaving(true);
    const updates = [
      { key: 'manual_deposit_active', value: mdActive ? 'true' : 'false' },
      { key: 'manual_deposit_momo_number', value: mdMomo.trim() },
      { key: 'manual_deposit_account_name', value: mdAccountName.trim() },
      { key: 'manual_deposit_network', value: mdNetwork.trim() },
      { key: 'manual_deposit_instructions', value: mdInstructions },
    ];
    let ok = true;
    for (const u of updates) {
      const { error } = await supabase.from('site_settings').update({ value: u.value }).eq('key', u.key);
      if (error) ok = false;
    }
    setMdSaving(false);
    if (ok) toast.success('Manual deposit details saved');
    else toast.error('Failed to save some fields');
  };

  const handleLeaderboardToggle = async (checked: boolean) => {
    setLeaderboardEnabled(checked);
    const { error } = await supabase
      .from('site_settings')
      .update({ value: checked ? 'true' : 'false' })
      .eq('key', 'weekly_leaderboard_enabled');
    if (error) {
      toast.error('Failed to update leaderboard setting');
      setLeaderboardEnabled(!checked);
    } else {
      toast.success(`Weekly Leaderboard ${checked ? 'enabled' : 'disabled'}`);
    }
  };

  const handlePaystackWdToggle = async (checked: boolean) => {
    setPaystackWdEnabled(checked);
    const { error } = await supabase
      .from('site_settings')
      .update({ value: checked ? 'true' : 'false' })
      .eq('key', 'withdrawals_paystack_enabled');
    if (error) {
      toast.error('Failed to update payout mode');
      setPaystackWdEnabled(!checked);
    } else {
      toast.success(checked
        ? 'Paystack automatic payouts enabled'
        : 'Manual payout mode enabled');
    }
  };

  const handleSettlementToggle = async (useSubaccount: boolean) => {
    const newMode = useSubaccount ? 'subaccount' : 'main';
    const prev = settlementMode;
    setSettlementMode(newMode);
    const { error } = await supabase
      .from('site_settings')
      .update({ value: newMode })
      .eq('key', 'paystack_settlement_mode');
    if (error) {
      toast.error('Failed to update settlement mode');
      setSettlementMode(prev);
    } else {
      toast.success(useSubaccount
        ? 'Settlement routed to Subaccount'
        : 'Settlement routed to Main Account');
    }
  };

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h2 className="text-2xl font-display font-bold">Settings</h2>
          <p className="text-muted-foreground text-sm">Configure support and platform settings</p>
        </div>

        {/* Network Availability */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-semibold">Network Availability</h3>
              <p className="text-xs text-muted-foreground">Control which networks accept new orders</p>
            </div>
          </div>
          <NetworkAvailabilitySettings />
        </div>

        {/* Agent Withdrawal Payout Mode */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Banknote className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-semibold">Agent Withdrawal Payouts</h3>
              <p className="text-xs text-muted-foreground">
                {paystackWdEnabled ? 'Paystack automatic mode active' : 'Manual payout mode active'}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="pr-4">
              <p className="text-sm font-semibold">Paystack Withdrawals</p>
              <p className="text-xs text-muted-foreground">
                When disabled, withdrawals are reviewed and marked paid manually. No Paystack transfer is attempted.
              </p>
            </div>
            <Switch
              checked={paystackWdEnabled}
              onCheckedChange={handlePaystackWdToggle}
              disabled={paystackWdLoading}
            />
          </div>
        </div>

        {/* Payment Settlement Mode */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-semibold">Payment Settlement Mode</h3>
              <p className="text-xs text-muted-foreground">
                Currently routing to: <span className="font-semibold text-foreground">{settlementMode === 'subaccount' ? 'Subaccount' : 'Main Account'}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <div className="pr-4">
              <p className="text-sm font-semibold">Use Subaccount</p>
              <p className="text-xs text-muted-foreground">
                When ON, payments settle to the configured Paystack subaccount (subaccount bears charge). When OFF, payments settle to your Main Paystack account. Applies to all checkout flows: guest, logged-in, wallet deposits, agent stores, and subscriptions.
              </p>
            </div>
            <Switch
              checked={settlementMode === 'subaccount'}
              onCheckedChange={handleSettlementToggle}
              disabled={settlementLoading}
            />
          </div>
        </div>

        {/* Manual Deposit Payment Details */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Wallet className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-semibold">Manual Deposit Payment Details</h3>
              <p className="text-xs text-muted-foreground">
                Shown to enabled users when they submit a manual transfer deposit. Disabled by default.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between py-2">
            <div className="pr-4">
              <p className="text-sm font-semibold">Manual Deposit Active</p>
              <p className="text-xs text-muted-foreground">
                When OFF, no user — even those with access — can submit manual deposit requests.
              </p>
            </div>
            <Switch checked={mdActive} onCheckedChange={setMdActive} disabled={mdLoading} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>MoMo Number</Label>
              <Input
                value={mdMomo}
                onChange={e => setMdMomo(e.target.value)}
                placeholder="0241234567"
                className="mt-1 font-mono"
                maxLength={20}
              />
            </div>
            <div>
              <Label>Account Name</Label>
              <Input
                value={mdAccountName}
                onChange={e => setMdAccountName(e.target.value)}
                placeholder="YieGo"
                className="mt-1"
                maxLength={80}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Network / Provider</Label>
              <Input
                value={mdNetwork}
                onChange={e => setMdNetwork(e.target.value)}
                placeholder="MTN MoMo"
                className="mt-1"
                maxLength={40}
              />
            </div>
          </div>
          <div>
            <Label>Instructions Shown to Users</Label>
            <Textarea
              value={mdInstructions}
              onChange={e => setMdInstructions(e.target.value)}
              placeholder="Send the exact amount to the MoMo number above..."
              className="mt-1"
              rows={4}
              maxLength={1000}
            />
          </div>
          <Button onClick={saveManualDepositSettings} disabled={mdSaving || mdLoading} className="w-full">
            {mdSaving ? 'Saving…' : 'Save Manual Deposit Details'}
          </Button>
        </div>

        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <Trophy className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-display font-semibold">Referral & Rewards</h3>
              <p className="text-xs text-muted-foreground">Control referral features visibility</p>
            </div>
          </div>
          <div className="flex items-center justify-between py-2">
            <div>
              <p className="text-sm font-semibold">Weekly Leaderboard (Bonus Rewards)</p>
              <p className="text-xs text-muted-foreground">Show or hide the weekly referral leaderboard for all users</p>
            </div>
            <Switch
              checked={leaderboardEnabled}
              onCheckedChange={handleLeaderboardToggle}
              disabled={leaderboardLoading}
            />
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-lg bg-[#25D366]/10 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-[#25D366]" />
            </div>
            <div>
              <h3 className="font-display font-semibold">WhatsApp Support</h3>
              <p className="text-xs text-muted-foreground">Configure your WhatsApp support channel</p>
            </div>
          </div>
          <div>
            <Label>WhatsApp Number</Label>
            <Input
              value={supportSettings.whatsapp_number}
              onChange={e => updateSupportSettings({ whatsapp_number: e.target.value })}
              placeholder="233200000000"
              className="mt-1 font-mono"
              maxLength={15}
            />
            <p className="text-xs text-muted-foreground mt-1">Include country code without + (e.g. 233 for Ghana)</p>
          </div>
          <div>
            <Label>Prefilled Message Template</Label>
            <Textarea
              value={supportSettings.whatsapp_message}
              onChange={e => updateSupportSettings({ whatsapp_message: e.target.value })}
              placeholder="Hello YieGo Support, I need help with my order."
              className="mt-1"
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground mt-1">This message will be pre-filled when users click WhatsApp support</p>
          </div>
          <Button onClick={handleSave} className="w-full">Save Settings</Button>
        </div>

        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Settings className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="font-display font-semibold">Platform</h3>
              <p className="text-xs text-muted-foreground">YieGo v1.0</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Admin dashboard for managing orders, products, and service notices.
            Connected to Lovable Cloud for persistent data storage and authentication.
          </p>
        </div>
      </div>
    </AdminLayout>
  );
};

export default AdminSettings;
