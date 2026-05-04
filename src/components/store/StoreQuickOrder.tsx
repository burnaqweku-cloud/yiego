import { useState, useMemo } from 'react';
import { useDuplicateOrderCheck } from '@/hooks/useDuplicateOrderCheck';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Zap, AlertCircle, AlertTriangle } from 'lucide-react';
import { validateNetworkMatch } from '@/lib/network-detect';
import { getValidityLabel } from '@/components/bundles/ValidityBadge';
import { useGlobalSystemStatus } from '@/contexts/SystemStatusContext';
import { useNetworkAvailability } from '@/hooks/useNetworkAvailability';
import type { Network } from '@/data/bundles';
import DuplicateOrderAlert from '@/components/bundles/DuplicateOrderAlert';

const NETWORK_ORDER = ['MTN', 'Telecel', 'AirtelTigo'];

interface Product {
  id: string;
  network: string;
  bundle_size_gb: number;
  price_ghs: number;
  description: string;
}

interface StoreQuickOrderProps {
  products: Product[];
  getSellingPrice: (product: Product) => number;
  onBuy: (product: Product, phone: string, name: string) => void;
  paying: boolean;
  agentWhatsApp?: string | null;
}

const StoreQuickOrder = ({ products, getSellingPrice, onBuy, paying, agentWhatsApp }: StoreQuickOrderProps) => {
  const { status: sysStatus } = useGlobalSystemStatus();
  const { isNetworkAvailable, getNetworkMessage } = useNetworkAvailability();
  const [network, setNetwork] = useState('MTN');
  const [bundleId, setBundleId] = useState('');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [nameError, setNameError] = useState('');

  const availableNetworks = useMemo(() =>
    NETWORK_ORDER.filter(n => products.some(p => p.network === n)),
    [products]
  );

  const networkBundles = useMemo(() =>
    products
      .filter(p => p.network === network)
      .sort((a, b) => a.bundle_size_gb - b.bundle_size_gb),
    [products, network]
  );

  const selectedBundle = networkBundles.find(b => b.id === bundleId);
  const networkUnavailable = !isNetworkAvailable(network as Network);
  const networkMismatchError = validateNetworkMatch(phone, network);
  const { blocked: duplicateBlocked, existingOrderId } = useDuplicateOrderCheck(phone);

  const handleNetworkChange = (val: string) => {
    setNetwork(val);
    setBundleId('');
  };

  const validatePhone = (p: string) => /^0[2-5][0-9]{8}$/.test(p);

  const handleBuy = () => {
    let hasError = false;
    setPhoneError('');
    setNameError('');

    if (!name.trim() || name.trim().length < 2) {
      setNameError('Full name is required');
      hasError = true;
    }
    if (!phone.trim() || !validatePhone(phone)) {
      setPhoneError('Enter a valid Ghana number (e.g. 0551234567)');
      hasError = true;
    }
    if (hasError || !selectedBundle) return;
    onBuy(selectedBundle, phone, name.trim());
  };

  return (
    <div className="animate-hero-in hero-stagger-3">
      <div className="surface-premium rounded-2xl p-4 relative overflow-hidden">
        <span className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
        <div className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-primary" />
          </div>
          <h2 className="text-sm font-bold tracking-tight">Quick Order</h2>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {/* Network */}
          <div>
            <Label className="text-[11px] text-muted-foreground">Network</Label>
            <Select value={network} onValueChange={handleNetworkChange}>
              <SelectTrigger className="mt-1 h-10 rounded-xl text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {availableNetworks.map(n => (
                  <SelectItem key={n} value={n}>{n}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Bundle */}
          <div>
            <Label className="text-[11px] text-muted-foreground">Bundle</Label>
            <Select value={bundleId} onValueChange={setBundleId}>
              <SelectTrigger className="mt-1 h-10 rounded-xl text-sm">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {networkBundles.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.bundle_size_gb}GB ({getValidityLabel(network)}) — GHS {getSellingPrice(b).toFixed(2)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Full Name */}
        <div className="mt-3">
          <Label className="text-[11px] text-muted-foreground">Full Name *</Label>
          <Input
            value={name}
            onChange={e => { setName(e.target.value); setNameError(''); }}
            placeholder="e.g. Kwame Asante"
            maxLength={100}
            className="mt-1 h-10 rounded-xl"
          />
          {nameError && (
            <p className="text-[11px] text-destructive flex items-center gap-1 mt-1">
              <AlertCircle className="w-3 h-3" /> {nameError}
            </p>
          )}
        </div>

        {/* Phone */}
        <div className="mt-3">
          <Label className="text-[11px] text-muted-foreground">Phone Number *</Label>
          <Input
            value={phone}
            onChange={e => { setPhone(e.target.value.replace(/[^0-9]/g, '')); setPhoneError(''); }}
            placeholder="0551234567"
            maxLength={10}
            className="mt-1 h-10 rounded-xl"
            inputMode="tel"
          />
          {phoneError ? (
            <p className="text-[11px] text-destructive flex items-center gap-1 mt-1">
              <AlertCircle className="w-3 h-3" /> {phoneError}
            </p>
          ) : networkMismatchError ? (
            <div className="mt-1 space-y-0.5">
              <p className="text-[11px] text-destructive flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0" /> {networkMismatchError}
              </p>
              <p className="text-[10px] text-muted-foreground pl-4">Tip: You may want to switch network</p>
            </div>
          ) : duplicateBlocked ? (
            <DuplicateOrderAlert existingOrderId={existingOrderId} agentWhatsApp={agentWhatsApp} />
          ) : null}
        </div>

        {/* Network unavailable notice */}
        {networkUnavailable && (
          <div className="mt-3 bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              {getNetworkMessage(network as Network)}
            </p>
          </div>
        )}

        {/* Buy button */}
        <Button
          onClick={handleBuy}
          disabled={paying || !selectedBundle || !sysStatus.online || networkUnavailable || !!networkMismatchError || duplicateBlocked}
          className="w-full mt-3 rounded-xl btn-press font-semibold"
          size="lg"
        >
          {!sysStatus.online ? 'System Offline' : networkUnavailable ? `${network} Unavailable` : paying ? 'Processing...' : selectedBundle
            ? (() => {
                const base = getSellingPrice(selectedBundle);
                const fee = Math.round(base * 0.04 * 100) / 100;
                const total = Math.round((base + fee) * 100) / 100;
                return `Pay GHS ${total.toFixed(2)}`;
              })()
            : 'Select a bundle'}
        </Button>
      </div>
    </div>
  );
};

export default StoreQuickOrder;
