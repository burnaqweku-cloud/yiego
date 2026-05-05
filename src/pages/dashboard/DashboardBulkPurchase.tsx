import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import { useAdmin, type DbBundle } from '@/contexts/AdminContext';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { usePricing } from '@/hooks/usePricing';
import { useGlobalSystemStatus } from '@/contexts/SystemStatusContext';
import { NETWORKS, validateGhanaPhone } from '@/data/bundles';
import type { Network } from '@/data/bundles';
import { useNetworkAvailability } from '@/hooks/useNetworkAvailability';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  Wallet, Plus, Trash2, Loader2, AlertTriangle, CheckCircle2, Package, Users, Rows3, ClipboardPaste, X
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';

interface RecipientRow {
  id: string;
  phone: string;
  bundleSizeGb: number;
  productId: string;
  note: string;
}

const DashboardBulkPurchase = () => {
  const navigate = useNavigate();
  const { bundles, loadingBundles } = useAdmin();
  const { user } = useAuth();
  const { wallet, refresh: refreshWallet } = useWallet();
  const { getAgentPrice, loadingPricing } = usePricing();
  const { status: sysStatus } = useGlobalSystemStatus();
  const { isNetworkAvailable, getNetworkMessage } = useNetworkAvailability();

  const [mode, setMode] = useState<'rows' | 'paste'>('rows');
  const [network, setNetwork] = useState('');
  const [recipients, setRecipients] = useState<RecipientRow[]>([]);
  const [addPhone, setAddPhone] = useState('');
  const [addGb, setAddGb] = useState('');
  const [addError, setAddError] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [placing, setPlacing] = useState(false);
  const [results, setResults] = useState<any[] | null>(null);

  // Paste parsing
  type ParsedLine = { line: number; raw: string; phone?: string; gb?: number; productId?: string; ok: boolean; error?: string };
  const parsedLines: ParsedLine[] = useMemo(() => {
    if (!pasteText.trim() || !network) return [];
    const products = bundles.filter(b => b.active && b.network === network);
    return pasteText.split('\n').map((raw, i) => {
      const line = i + 1;
      const trimmed = raw.trim();
      if (!trimmed) return { line, raw, ok: false, error: 'Empty line' };
      const parts = trimmed.split(/[\s,;\t]+/).filter(Boolean);
      if (parts.length < 2) return { line, raw, ok: false, error: 'Need: phone gb' };
      const phone = parts[0].replace(/[^0-9]/g, '');
      const gb = parseFloat(parts[1].replace(/[^0-9.]/g, ''));
      if (!validateGhanaPhone(phone)) return { line, raw, phone, ok: false, error: 'Invalid Ghana number' };
      if (!gb || gb <= 0) return { line, raw, phone, gb, ok: false, error: 'Invalid GB value' };
      const matches = products.filter(p => Number(p.bundle_size_gb) === gb);
      if (matches.length === 0) return { line, raw, phone, gb, ok: false, error: `No ${gb}GB bundle for ${network}` };
      if (matches.length > 1) return { line, raw, phone, gb, ok: false, error: 'Multiple matches — use row entry' };
      return { line, raw, phone, gb, productId: matches[0].id, ok: true };
    });
  }, [pasteText, bundles, network]);

  const validParsed = parsedLines.filter(p => p.ok);
  const invalidParsed = parsedLines.filter(p => !p.ok && p.raw.trim());
  const pasteTotalCost = useMemo(() => {
    return validParsed.reduce((s, p) => {
      const prod = bundles.find(b => b.id === p.productId);
      return prod ? s + getAgentPrice(prod) : s;
    }, 0);
  }, [validParsed, bundles, getAgentPrice]);

  const filteredProducts = useMemo(() =>
    network ? bundles.filter(b => b.active && b.network === network) : [],
    [bundles, network]
  );

  const walletBalance = Number(wallet?.balance_ghs || 0);

  const findProduct = useCallback((gb: number) => {
    return filteredProducts.find(p => p.bundle_size_gb === gb);
  }, [filteredProducts]);

  const getRowPrice = useCallback((row: RecipientRow) => {
    const product = bundles.find(b => b.id === row.productId);
    return product ? getAgentPrice(product) : 0;
  }, [bundles, getAgentPrice]);

  const validRecipients = useMemo(() =>
    recipients.filter(r => r.phone.trim() && validateGhanaPhone(r.phone) && r.productId),
    [recipients]
  );

  const totalCost = useMemo(() =>
    validRecipients.reduce((sum, r) => sum + getRowPrice(r), 0),
    [validRecipients, getRowPrice]
  );

  const handleAddRecipient = () => {
    setAddError('');
    const phone = addPhone.replace(/[^0-9]/g, '');
    if (!phone || !validateGhanaPhone(phone)) {
      setAddError('Enter a valid Ghana number (e.g. 0551234567)');
      return;
    }
    const gb = parseFloat(addGb);
    if (!gb || gb <= 0) {
      setAddError('Enter a valid GB amount');
      return;
    }
    const product = findProduct(gb);
    if (!product) {
      setAddError(`No ${gb}GB bundle available for ${network}`);
      return;
    }
    if (recipients.length >= 50) {
      toast.error('Maximum 50 recipients per batch');
      return;
    }
    if (recipients.some(r => r.phone === phone)) {
      setAddError('Number already added');
      return;
    }
    setRecipients(prev => [...prev, {
      id: crypto.randomUUID(),
      phone,
      bundleSizeGb: gb,
      productId: product.id,
      note: '',
    }]);
    setAddPhone('');
    setAddGb('');
  };

  const removeRow = (id: string) => {
    setRecipients(prev => prev.filter(r => r.id !== id));
  };

  const handleSubmit = async () => {
    const useItems = mode === 'paste' ? validParsed.map(p => ({
      id: crypto.randomUUID(),
      phone: p.phone!,
      bundleSizeGb: p.gb!,
      productId: p.productId!,
    })) : validRecipients;

    if (!user || useItems.length === 0) return;

    if (!isNetworkAvailable(network as Network)) {
      toast.error(`${network} bundles are temporarily paused`);
      return;
    }

    const cost = mode === 'paste' ? pasteTotalCost : totalCost;
    if (walletBalance < cost) {
      toast.error('Insufficient wallet balance');
      return;
    }

    setPlacing(true);
    try {
      const { data: batch } = await supabase.from('wholesale_batches' as any).insert({
        agent_user_id: user.id,
        raw_input_text: useItems.map(r => `${r.phone} ${r.bundleSizeGb}GB ${network}`).join('\n'),
        parsed_count: useItems.length,
        valid_count: useItems.length,
        invalid_count: 0,
        total_cost: cost,
        status: 'pending',
      }).select().single();

      const batchId = (batch as any)?.id;

      const { data, error } = await supabase.functions.invoke('process-wholesale-order', {
        body: {
          action: 'place_bulk',
          batch_id: batchId,
          items: useItems.map(r => {
            const prod = bundles.find(b => b.id === r.productId);
            return {
              network: prod?.network || network,
              bundle_size_gb: prod?.bundle_size_gb || r.bundleSizeGb,
              recipient: r.phone.trim(),
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
      toast.error(err.message || 'Bulk order failed');
    } finally {
      setPlacing(false);
    }
  };

  const isLoading = loadingBundles || loadingPricing;

  if (results) {
    const succeeded = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return (
      <DashboardLayout>
        <div className="p-4 md:p-6 space-y-5 max-w-2xl">
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
                <Button variant="outline" size="sm" onClick={() => navigate('/dashboard/bulk-orders')}>
                  View History
                </Button>
                <Button size="sm" onClick={() => { setResults(null); setRecipients([]); }}>
                  New Order
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-4 md:p-6 space-y-5 max-w-2xl mx-auto">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">Bulk</p>
          <h1 className="text-2xl md:text-3xl font-display font-extrabold tracking-tight mt-1">Bulk Bundles</h1>
          <p className="text-sm text-muted-foreground mt-1">Send data to many numbers at once. Paid from your wallet.</p>
        </div>

        {!sysStatus.online && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">{sysStatus.message}</p>
          </div>
        )}

        {/* Wallet */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              <span className="text-sm font-medium">Wallet Balance</span>
            </div>
            <span className="text-lg font-bold">GHS {walletBalance.toFixed(2)}</span>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}
          </div>
        ) : (
          <>
            {/* Step 1: Network */}
            <Card>
              <CardContent className="p-4 space-y-4">
                <div>
                  <Label className="text-sm font-medium mb-1.5 block">1. Choose network</Label>
                  <Select value={network} onValueChange={(v) => { setNetwork(v); setRecipients([]); setPasteText(''); }}>
                    <SelectTrigger><SelectValue placeholder="Select network" /></SelectTrigger>
                    <SelectContent>
                      {NETWORKS.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Step 2: Mode toggle + entry */}
            {network && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    2. Add recipients
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Mode toggle */}
                  <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-xl">
                    <button
                      onClick={() => setMode('rows')}
                      className={`text-xs font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${mode === 'rows' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
                    >
                      <Rows3 className="w-3.5 h-3.5" /> Add one by one
                    </button>
                    <button
                      onClick={() => setMode('paste')}
                      className={`text-xs font-semibold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 ${mode === 'paste' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}
                    >
                      <ClipboardPaste className="w-3.5 h-3.5" /> Paste list
                    </button>
                  </div>

                  {mode === 'rows' && (
                    <>
                      <div className="flex items-end gap-2">
                        <div className="flex-1 space-y-1">
                          <Label className="text-xs">Phone number</Label>
                          <Input
                            placeholder="0551234567"
                            value={addPhone}
                            onChange={(e) => { setAddPhone(e.target.value.replace(/[^0-9]/g, '')); setAddError(''); }}
                            maxLength={10}
                            inputMode="tel"
                            className="h-10"
                            onKeyDown={(e) => e.key === 'Enter' && handleAddRecipient()}
                          />
                        </div>
                        <div className="w-24 space-y-1">
                          <Label className="text-xs">GB</Label>
                          <Input
                            placeholder="2"
                            value={addGb}
                            onChange={(e) => { setAddGb(e.target.value.replace(/[^0-9.]/g, '')); setAddError(''); }}
                            inputMode="decimal"
                            className="h-10"
                            onKeyDown={(e) => e.key === 'Enter' && handleAddRecipient()}
                          />
                        </div>
                        <Button size="icon" className="shrink-0 h-10 w-10" onClick={handleAddRecipient}>
                          <Plus className="w-4 h-4" />
                        </Button>
                      </div>
                      <p className="text-[10px] text-muted-foreground">Up to 50 numbers per batch. Example: 1 = 1GB.</p>
                      {addError && <p className="text-destructive text-[11px]">{addError}</p>}

                      {recipients.length > 0 && (
                        <div className="max-h-64 overflow-y-auto space-y-1.5 border border-border rounded-lg p-2">
                          <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 text-[10px] font-medium text-muted-foreground border-b border-border pb-1 mb-1">
                            <span>Phone</span><span>GB</span><span>Price</span><span></span>
                          </div>
                          {recipients.map((row) => (
                            <div key={row.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-2 items-center text-xs py-1 border-b border-border/50 last:border-0">
                              <span className="font-mono">{row.phone}</span>
                              <span>{row.bundleSizeGb}GB</span>
                              <span className="text-muted-foreground">GHS {getRowPrice(row).toFixed(2)}</span>
                              <button onClick={() => removeRow(row.id)} className="p-1 hover:bg-destructive/10 rounded transition-colors">
                                <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {mode === 'paste' && (
                    <>
                      <div className="space-y-1">
                        <Label className="text-xs">Paste your list — one order per line</Label>
                        <Textarea
                          value={pasteText}
                          onChange={(e) => setPasteText(e.target.value)}
                          rows={6}
                          placeholder={'0240000000 10\n0550000000 5\n0200000000 2'}
                          className="font-mono text-xs"
                        />
                        <p className="text-[10px] text-muted-foreground">Format: <span className="font-mono">phone gb</span>. Example: <span className="font-mono">0551234567 5</span> = 5GB to that number.</p>
                      </div>

                      {parsedLines.length > 0 && (
                        <div className="rounded-lg border border-border max-h-64 overflow-y-auto divide-y divide-border/50">
                          {parsedLines.filter(p => p.raw.trim()).map(p => (
                            <div key={p.line} className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-xs ${p.ok ? '' : 'bg-destructive/5'}`}>
                              <span className="font-mono truncate flex-1">
                                <span className="text-muted-foreground mr-2">L{p.line}</span>{p.raw.trim()}
                              </span>
                              {p.ok ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-success shrink-0">
                                  <CheckCircle2 className="w-3 h-3" /> {p.gb}GB
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive shrink-0">
                                  <X className="w-3 h-3" /> {p.error}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                      {parsedLines.length > 0 && (
                        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                          <span>{validParsed.length} valid · {invalidParsed.length} invalid</span>
                          <span>Total: <span className="font-bold text-foreground">GHS {pasteTotalCost.toFixed(2)}</span></span>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Summary */}
            {((mode === 'rows' && validRecipients.length > 0) || (mode === 'paste' && validParsed.length > 0)) && (
              <Card>
                <CardContent className="p-4 space-y-2 text-sm">
                  {(() => {
                    const count = mode === 'paste' ? validParsed.length : validRecipients.length;
                    const cost = mode === 'paste' ? pasteTotalCost : totalCost;
                    return (
                      <>
                        <div className="flex justify-between"><span className="text-muted-foreground">Network</span><span className="font-medium">{network}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Recipients</span><span className="font-bold">{count}</span></div>
                        <div className="border-t border-border pt-2 flex justify-between">
                          <span className="font-semibold">Total cost</span>
                          <span className="font-bold text-lg">GHS {cost.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Wallet balance</span><span>GHS {walletBalance.toFixed(2)}</span></div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Balance after</span>
                          <span className={walletBalance - cost < 0 ? 'text-destructive font-bold' : ''}>
                            GHS {(walletBalance - cost).toFixed(2)}
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            )}

            {((mode === 'rows' && validRecipients.length > 0) || (mode === 'paste' && validParsed.length > 0)) && (
              <>
                {network && !isNetworkAvailable(network as Network) && (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <span className="text-muted-foreground">{getNetworkMessage(network as Network)}</span>
                  </div>
                )}
                {(() => {
                  const count = mode === 'paste' ? validParsed.length : validRecipients.length;
                  const cost = mode === 'paste' ? pasteTotalCost : totalCost;
                  return (
                    <Button
                      className="w-full"
                      size="lg"
                      disabled={placing || walletBalance < cost || count === 0 || !sysStatus.online || !isNetworkAvailable(network as Network)}
                      onClick={handleSubmit}
                    >
                      {!sysStatus.online ? (
                        <><AlertTriangle className="w-4 h-4 mr-2" /> System offline</>
                      ) : (
                        <>
                          {placing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Package className="w-4 h-4 mr-2" />}
                          Send {count} bundle{count > 1 ? 's' : ''}
                        </>
                      )}
                    </Button>
                  );
                })()}
              </>
            )}
          </>
        )}
        <div aria-hidden className="h-24 md:h-6" />
      </div>
    </DashboardLayout>
  );
};

export default DashboardBulkPurchase;
