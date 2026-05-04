import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AgentLayout from './AgentLayout';
import AgentGate from '@/components/agent/AgentGate';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { useAgentSubscriptionState } from '@/hooks/useAgentSubscriptionState';
import { useGlobalSystemStatus } from '@/contexts/SystemStatusContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import {
  Wallet, ShoppingBag, Package, CheckCircle2, Loader2,
  ArrowRight, Trash2, AlertTriangle, Plus, Users, ClipboardPaste
} from 'lucide-react';

const NETWORKS = ['MTN', 'Telecel', 'AirtelTigo'];
const MAX_RECIPIENTS = 50;

function isValidGhanaPhone(phone: string): boolean {
  const cleaned = phone.replace(/[^0-9]/g, '');
  if (/^233[235][0-9]{8}$/.test(cleaned)) return true;
  if (/^0[235][0-9]{8}$/.test(cleaned)) return true;
  return false;
}

function normalizePhone(phone: string): string {
  const cleaned = phone.replace(/[^0-9]/g, '');
  if (/^233/.test(cleaned) && cleaned.length === 12) return '0' + cleaned.slice(3);
  return cleaned;
}

interface Product {
  id: string;
  network: string;
  bundle_size_gb: number;
  description: string;
  price_ghs: number;
  agent_price_ghs: number | null;
  cost_price_ghs: number | null;
  active: boolean;
}

interface AgentPrice {
  product_id: string;
  manual_price: number | null;
}

interface Recipient {
  phone: string;
  productId: string;
}

const AgentWholesale = () => {
  const { user } = useAuth();
  const { wallet, refresh: refreshWallet } = useWallet();
  const { isStoreActive, displayState, loading: subLoading } = useAgentSubscriptionState();
  const { status: sysStatus } = useGlobalSystemStatus();
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [agentPrices, setAgentPrices] = useState<AgentPrice[]>([]);
  const [loading, setLoading] = useState(true);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [network, setNetwork] = useState('');
  const [defaultProductId, setDefaultProductId] = useState('');

  // Recipients with per-row bundle
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [addNumber, setAddNumber] = useState('');
  const [addError, setAddError] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');

  const [confirmed, setConfirmed] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);

  useEffect(() => { fetchProducts(); }, []);

  const fetchProducts = async () => {
    setLoading(true);
    const [{ data: prods }, { data: overrides }] = await Promise.all([
      supabase.from('products').select('*').eq('active', true).order('network').order('bundle_size_gb'),
      supabase.from('pricing_overrides').select('product_id, manual_price').eq('customer_type', 'agent'),
    ]);
    if (prods) setProducts(prods as any);
    if (overrides) setAgentPrices(overrides as any);
    setLoading(false);
  };

  const getAgentPrice = useCallback((product: Product): number => {
    const override = agentPrices.find(o => o.product_id === product.id);
    if (override?.manual_price && Number(override.manual_price) > 0) return Number(override.manual_price);
    if (product.agent_price_ghs && Number(product.agent_price_ghs) > 0) return Number(product.agent_price_ghs);
    return Number(product.price_ghs);
  }, [agentPrices]);

  const priceForProduct = useCallback((pid: string): number => {
    const p = products.find(x => x.id === pid);
    return p ? getAgentPrice(p) : 0;
  }, [products, getAgentPrice]);

  const filteredProducts = useMemo(() =>
    network ? products.filter(p => p.network === network) : [],
    [products, network]
  );

  const walletBalance = Number(wallet?.balance_ghs || 0);
  const totalCost = recipients.reduce((sum, r) => sum + priceForProduct(r.productId), 0);
  const balanceAfter = walletBalance - totalCost;

  // Add single number
  const handleAddSingle = () => {
    setAddError('');
    const raw = addNumber.replace(/\s/g, '');
    if (!raw) return;
    const normalized = normalizePhone(raw);
    if (!isValidGhanaPhone(normalized)) {
      setAddError('Enter a valid Ghana number (e.g. 0551234567)');
      return;
    }
    if (recipients.some(r => r.phone === normalized)) {
      setAddError('Number already added');
      return;
    }
    if (recipients.length >= MAX_RECIPIENTS) {
      toast.error(`Maximum ${MAX_RECIPIENTS} recipients`);
      return;
    }
    setRecipients(prev => [...prev, { phone: normalized, productId: defaultProductId }]);
    setAddNumber('');
  };

  // Parse paste
  const handleParseNumbers = () => {
    const raw = pasteText
      .split(/[\n,\s]+/)
      .map(s => s.replace(/[^0-9+]/g, '').trim())
      .filter(s => s.length > 0);

    let added = 0, dups = 0, invalid = 0;
    const existing = new Set(recipients.map(r => r.phone));
    const newRecipients: Recipient[] = [];

    for (const num of raw) {
      const normalized = normalizePhone(num);
      if (!isValidGhanaPhone(normalized)) { invalid++; continue; }
      if (existing.has(normalized)) { dups++; continue; }
      existing.add(normalized);
      newRecipients.push({ phone: normalized, productId: defaultProductId });
      added++;
    }

    if (recipients.length + newRecipients.length > MAX_RECIPIENTS) {
      toast.error(`Maximum ${MAX_RECIPIENTS} recipients per batch`);
      return;
    }

    setRecipients(prev => [...prev, ...newRecipients]);
    setPasteText('');
    setShowPaste(false);
    if (added > 0) toast.success(`${added} number(s) added`);
    if (dups > 0) toast(`${dups} duplicate(s) removed`);
    if (invalid > 0) toast.error(`${invalid} invalid number(s) skipped`);
  };

  const removeRecipient = (idx: number) => {
    setRecipients(prev => prev.filter((_, i) => i !== idx));
  };

  const updateRecipientBundle = (idx: number, pid: string) => {
    setRecipients(prev => prev.map((r, i) => i === idx ? { ...r, productId: pid } : r));
  };

  const handlePlaceBulk = async () => {
    if (!confirmed || !user || recipients.length === 0) return;
    setPlacing(true);

    try {
      const { data: batch } = await supabase.from('wholesale_batches' as any).insert({
        agent_user_id: user.id,
        raw_input_text: recipients.map(r => r.phone).join('\n'),
        parsed_count: recipients.length,
        valid_count: recipients.length,
        invalid_count: 0,
        total_cost: totalCost,
        status: 'pending',
      }).select().single();

      const batchId = (batch as any)?.id;

      const { data, error } = await supabase.functions.invoke('process-wholesale-order', {
        body: {
          action: 'place_bulk',
          batch_id: batchId,
          items: recipients.map(r => {
            const prod = products.find(p => p.id === r.productId);
            return {
              network: prod?.network || network,
              bundle_size_gb: prod?.bundle_size_gb || 0,
              recipient: r.phone,
              product_id: r.productId,
            };
          }),
        },
      });

      if (error) throw error;
      setResults(data?.results || []);
      refreshWallet();
      toast.success(`Bulk order complete: ${data?.succeeded || 0} success, ${data?.failed || 0} failed`);
    } catch (err: any) {
      toast.error('Bulk order failed. Please try again or contact support.');
    } finally {
      setPlacing(false);
    }
  };

  // ─── Results screen ────────────────────────────────────────
  if (results) {
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    return (
      <AgentGate>
        <AgentLayout>
          <div className="space-y-5">
            <Card>
              <CardContent className="p-6 text-center space-y-4">
                <CheckCircle2 className="w-12 h-12 text-success mx-auto" />
                <h3 className="font-bold text-lg">Bulk Order Complete</h3>
                <p className="text-sm text-muted-foreground">{succeeded} success, {failed} failed</p>
                <div className="max-h-60 overflow-y-auto space-y-1.5">
                  {results.map((r, i) => (
                    <div key={i} className="flex items-center justify-between text-sm p-2 rounded-lg bg-muted/50">
                      <span className="font-mono text-xs">{r.order_id}</span>
                      <Badge variant={r.success ? 'default' : 'destructive'} className="text-[10px]">
                        {r.status}
                      </Badge>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" size="sm" onClick={() => navigate('/agent/bulk-orders')}>
                    View History
                  </Button>
                  <Button size="sm" onClick={() => { setResults(null); setStep(1); setRecipients([]); setConfirmed(false); }}>
                    New Bulk Order
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </AgentLayout>
      </AgentGate>
    );
  }

  return (
    <AgentGate>
      <AgentLayout>
        <div className="space-y-5">
          {/* Header */}
          <div>
            <h1 className="text-xl font-bold">Bulk Orders</h1>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Paid from your main wallet. Agent pricing applied. Your profit is what you charge customers (offline markup).
            </p>
          </div>

          {!sysStatus.online && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm text-muted-foreground">{sysStatus.message}</p>
            </div>
          )}
          {/* Subscription expired block */}
          {!subLoading && !isStoreActive && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 space-y-2">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Bulk Orders Unavailable</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Bulk orders are unavailable while your agent subscription is inactive. Renew to continue.
                  </p>
                </div>
              </div>
              <Button size="sm" onClick={() => navigate('/agent/dashboard')} className="ml-8">
                Renew Now
              </Button>
            </div>
          )}
          {/* Info chips */}
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1.5 text-xs">
              <Wallet className="w-3 h-3" /> Paid from Main Wallet
            </Badge>
            <Badge variant="secondary" className="gap-1.5 text-xs">
              <ShoppingBag className="w-3 h-3" /> Agent Price
            </Badge>
            <Badge variant="outline" className="gap-1.5 text-xs">
              Profit is your markup
            </Badge>
          </div>

          {/* Wallet Balance */}
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wallet className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">Wallet Balance</span>
              </div>
              <span className="text-lg font-bold">GHS {walletBalance.toFixed(2)}</span>
            </CardContent>
          </Card>

          {/* Step indicators */}
          <div className="flex items-center gap-2 text-xs">
            {[
              { n: 1, label: 'Select' },
              { n: 2, label: 'Recipients' },
              { n: 3, label: 'Confirm' },
            ].map((s, idx) => (
              <div key={s.n} className={`flex items-center gap-1.5 ${step >= s.n ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${step >= s.n ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  {s.n}
                </div>
                <span>{s.label}</span>
                {idx < 2 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
              </div>
            ))}
          </div>

          {/* ─── Step 1: Select Network & Default Bundle ─── */}
          {step === 1 && (
            <Card>
              <CardContent className="p-4 space-y-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Network</label>
                  <Select value={network} onValueChange={(v) => { setNetwork(v); setDefaultProductId(''); }}>
                    <SelectTrigger><SelectValue placeholder="Select network" /></SelectTrigger>
                    <SelectContent>
                      {NETWORKS.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-1.5 block">Default Bundle</label>
                  <p className="text-[11px] text-muted-foreground mb-1">You can change the bundle per recipient in the next step.</p>
                  <Select value={defaultProductId} onValueChange={setDefaultProductId} disabled={!network}>
                    <SelectTrigger><SelectValue placeholder="Select bundle" /></SelectTrigger>
                    <SelectContent>
                      {filteredProducts.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.bundle_size_gb}GB — GHS {getAgentPrice(p).toFixed(2)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full"
                  disabled={!defaultProductId}
                  onClick={() => setStep(2)}
                >
                  Continue <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </CardContent>
            </Card>
          )}

          {/* ─── Step 2: Add Recipients ─── */}
          {step === 2 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  Recipients ({recipients.length}/{MAX_RECIPIENTS})
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Primary: single add */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Recipient number</label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g. 0551234567"
                      value={addNumber}
                      onChange={(e) => { setAddNumber(e.target.value); setAddError(''); }}
                      maxLength={13}
                      inputMode="tel"
                      className="flex-1"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddSingle()}
                    />
                    <Button size="icon" onClick={handleAddSingle} disabled={!addNumber.trim()}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  {addError && <p className="text-destructive text-[11px] mt-1">{addError}</p>}
                </div>

                {/* Optional paste */}
                {!showPaste ? (
                  <button
                    onClick={() => setShowPaste(true)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ClipboardPaste className="w-3 h-3" /> Paste list (optional)
                  </button>
                ) : (
                  <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border">
                    <Textarea
                      placeholder={"0551234567\n0241234567\n0201234567"}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      className="min-h-[80px] font-mono text-xs"
                    />
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1" onClick={() => { setShowPaste(false); setPasteText(''); }}>
                        Cancel
                      </Button>
                      <Button size="sm" className="flex-1" disabled={!pasteText.trim()} onClick={handleParseNumbers}>
                        Add Numbers
                      </Button>
                    </div>
                  </div>
                )}

                {/* Recipients list with per-row bundle */}
                {recipients.length > 0 && (
                  <div className="max-h-64 overflow-y-auto space-y-2 border border-border rounded-lg p-2">
                    {recipients.map((r, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <span className="font-mono shrink-0 w-24">{r.phone}</span>
                        <Select value={r.productId} onValueChange={(v) => updateRecipientBundle(idx, v)}>
                          <SelectTrigger className="h-8 text-xs flex-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredProducts.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.bundle_size_gb}GB — GHS {getAgentPrice(p).toFixed(2)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="text-muted-foreground shrink-0 w-16 text-right">
                          GHS {priceForProduct(r.productId).toFixed(2)}
                        </span>
                        <button onClick={() => removeRecipient(idx)} className="p-1 hover:bg-destructive/10 rounded transition-colors shrink-0">
                          <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Live total */}
                {recipients.length > 0 && (
                  <div className="p-3 rounded-lg bg-muted/50 text-sm flex justify-between">
                    <span className="font-semibold">Total cost ({recipients.length} orders)</span>
                    <span className="font-bold">GHS {totalCost.toFixed(2)}</span>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                    Back
                  </Button>
                  <Button
                    className="flex-1"
                    disabled={recipients.length === 0}
                    onClick={() => setStep(3)}
                  >
                    Review <ArrowRight className="w-4 h-4 ml-1" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ─── Step 3: Review & Confirm ─── */}
          {step === 3 && (
            <>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Review Orders</CardTitle>
                </CardHeader>
                <CardContent className="p-3 max-h-64 overflow-y-auto">
                  <div className="text-[10px] grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 font-medium text-muted-foreground border-b border-border pb-1 mb-1">
                    <span>Recipient</span>
                    <span>Bundle</span>
                    <span>Price</span>
                  </div>
                  {recipients.map((r, idx) => {
                    const prod = products.find(p => p.id === r.productId);
                    return (
                      <div key={idx} className="grid grid-cols-[1fr_auto_auto] gap-x-3 items-center text-xs py-1 border-b border-border/50 last:border-0">
                        <span className="font-mono">{r.phone}</span>
                        <span>{prod?.bundle_size_gb || '?'}GB</span>
                        <span>GHS {priceForProduct(r.productId).toFixed(2)}</span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Totals */}
              <Card>
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total orders</span>
                    <span className="font-bold">{recipients.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Total cost</span>
                    <span className="font-bold text-lg">GHS {totalCost.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Wallet balance</span>
                    <span>GHS {walletBalance.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2">
                    <span className="text-muted-foreground">Balance after purchase</span>
                    <span className={balanceAfter < 0 ? 'text-destructive font-bold' : 'font-medium'}>
                      GHS {balanceAfter.toFixed(2)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              {balanceAfter < 0 && (
                <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-sm flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" /> Insufficient wallet balance. Top up to continue.
                </div>
              )}

              <div className="flex items-start gap-2 p-3 rounded-lg bg-muted/50">
                <Checkbox
                  id="bulk-confirm"
                  checked={confirmed}
                  onCheckedChange={(v) => setConfirmed(!!v)}
                />
                <label htmlFor="bulk-confirm" className="text-xs text-muted-foreground cursor-pointer">
                  I confirm this purchase. Paid from my main wallet. My profit comes from my offline markup.
                </label>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(2)} disabled={placing}>
                  Back
                </Button>
                <Button
                  className="flex-1"
                  disabled={!confirmed || placing || balanceAfter < 0 || !sysStatus.online || !isStoreActive}
                  onClick={handlePlaceBulk}
                >
                  {placing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Package className="w-4 h-4 mr-2" />}
                  Place Bulk Orders
                </Button>
              </div>
            </>
          )}
        </div>
      </AgentLayout>
    </AgentGate>
  );
};

export default AgentWholesale;
