import { useState, useEffect } from 'react';
import { useDuplicateOrderCheck } from '@/hooks/useDuplicateOrderCheck';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Lock, AlertTriangle } from 'lucide-react';
import { validateNetworkMatch } from '@/lib/network-detect';
import NetworkUnavailableBanner from '@/components/bundles/NetworkUnavailableBanner';
import DuplicateOrderAlert from '@/components/bundles/DuplicateOrderAlert';
import type { Network } from '@/data/bundles';
import ImportantNotice from '@/components/bundles/ImportantNotice';
import NonExpiryBadge from '@/components/bundles/NonExpiryBadge';
import { useGlobalSystemStatus } from '@/contexts/SystemStatusContext';
import { useNetworkAvailability } from '@/hooks/useNetworkAvailability';

interface Product {
  id: string;
  network: string;
  bundle_size_gb: number;
  price_ghs: number;
  description: string;
}

interface StoreCheckoutDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: Product | null;
  sellingPrice: number;
  prefillPhone?: string;
  paying: boolean;
  onPay: (phone: string, name: string, email?: string) => void;
  agentWhatsApp?: string | null;
}

const NETWORK_COLORS: Record<string, string> = {
  MTN: 'bg-mtn text-mtn-foreground',
  Telecel: 'bg-telecel text-telecel-foreground',
  AirtelTigo: 'bg-airteltigo text-airteltigo-foreground',
};

const StoreCheckoutDrawer = ({
  open,
  onOpenChange,
  product,
  sellingPrice,
  prefillPhone = '',
  paying,
  onPay,
  agentWhatsApp,
}: StoreCheckoutDrawerProps) => {
  const { status: sysStatus } = useGlobalSystemStatus();
  const { isNetworkAvailable, getNetworkMessage } = useNetworkAvailability();
  const [phone, setPhone] = useState(prefillPhone);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open && prefillPhone) setPhone(prefillPhone);
  }, [open, prefillPhone]);

  // Hide floating WhatsApp + AI Support widgets while checkout drawer is open
  useEffect(() => {
    if (open) {
      document.body.classList.add('modal-open-wa-hide');
    } else {
      document.body.classList.remove('modal-open-wa-hide');
    }
    return () => document.body.classList.remove('modal-open-wa-hide');
  }, [open]);

  const resetForm = () => {
    setPhone(prefillPhone);
    setName('');
    setEmail('');
    setErrors({});
  };

  const handlePhoneChange = (value: string) => {
    const cleaned = value.replace(/[^0-9]/g, '');
    setPhone(cleaned);
    if (errors.phone) setErrors(prev => ({ ...prev, phone: '' }));
  };

  const networkMismatchError = product ? validateNetworkMatch(phone, product.network) : '';
  const { blocked: duplicateBlocked, existingOrderId } = useDuplicateOrderCheck(phone);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim() || name.trim().length < 2) {
      errs.name = 'Full name is required';
    }
    if (!phone.trim() || !/^0[2-5][0-9]{8}$/.test(phone)) {
      errs.phone = 'Enter a valid Ghana number (e.g. 0551234567)';
    }
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = 'Enter a valid email address';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = () => {
    if (!validate()) return;
    onPay(phone, name.trim(), email.trim() || undefined);
  };

  if (!product) return null;

  const processingFee = Math.round(sellingPrice * 0.04 * 100) / 100;
  const totalPayable = Math.round((sellingPrice + processingFee) * 100) / 100;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) resetForm();
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-md rounded-3xl p-0 overflow-hidden">
        <div className="px-6 pt-6 pb-3">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">Complete Purchase</DialogTitle>
          </DialogHeader>
        </div>

        {/* Order summary */}
        <div className="mx-6 p-4 bg-secondary rounded-2xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${NETWORK_COLORS[product.network]}`}>
                {product.network}
              </span>
              <div>
                <p className="font-bold text-sm">{product.bundle_size_gb}GB</p>
                <NonExpiryBadge size="xs" className="mt-0.5" network={product.network} />
              </div>
            </div>
            <p className="text-xl font-bold">GHS {sellingPrice.toFixed(2)}</p>
          </div>
          <div className="mt-2 pt-2 border-t border-border/50 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Bundle Price</span>
              <span>GHS {sellingPrice.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment Fee (4%)</span>
              <span>GHS {processingFee.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Total Payable</span>
              <span>GHS {totalPayable.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className="px-6 py-4 space-y-3">
          <div>
            <Label className="text-xs font-medium">Full Name *</Label>
            <Input
              value={name}
              onChange={e => { setName(e.target.value); if (errors.name) setErrors(prev => ({ ...prev, name: '' })); }}
              placeholder="e.g. Ama Serwaa"
              maxLength={100}
              className="mt-1 h-11 rounded-xl"
            />
            {errors.name && (
              <p className="text-[11px] text-destructive flex items-center gap-1 mt-1">
                <AlertCircle className="w-3 h-3" /> {errors.name}
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs font-medium">Recipient Phone *</Label>
            <Input
              value={phone}
              onChange={e => handlePhoneChange(e.target.value)}
              placeholder="0551234567"
              maxLength={10}
              className="mt-1 h-11 rounded-xl"
              inputMode="tel"
            />
            {errors.phone ? (
              <p className="text-[11px] text-destructive flex items-center gap-1 mt-1">
                <AlertCircle className="w-3 h-3" /> {errors.phone}
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
            ) : (
              <p className="text-[10px] text-muted-foreground mt-1">
                ⚠️ Check number carefully — no refunds for wrong numbers.
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs font-medium">Email (optional)</Label>
            <Input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="your@email.com"
              type="email"
              className="mt-1 h-11 rounded-xl"
              maxLength={255}
            />
            {errors.email && (
              <p className="text-[11px] text-destructive flex items-center gap-1 mt-1">
                <AlertCircle className="w-3 h-3" /> {errors.email}
              </p>
            )}
          </div>

          <ImportantNotice compact />

          {/* Network unavailable banner */}
          {sysStatus.online && product && !isNetworkAvailable(product.network as any) && (
            <NetworkUnavailableBanner network={product.network} message={getNetworkMessage(product.network as any)} />
          )}
        </div>

        {/* Pay button */}
        <div className="px-6 pb-6">
          <Button
            onClick={handleSubmit}
            disabled={paying || !sysStatus.online || (product ? !isNetworkAvailable(product.network as any) : false) || !!networkMismatchError || duplicateBlocked}
            className="w-full h-12 rounded-xl btn-press font-bold text-base gap-2"
            size="lg"
          >
            <Lock className="w-4 h-4" />
            {!sysStatus.online ? 'System Offline' : (product && !isNetworkAvailable(product.network as any)) ? `${product.network} Unavailable` : paying ? 'Redirecting to Paystack...' : `Pay Securely — GHS ${totalPayable.toFixed(2)}`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default StoreCheckoutDrawer;
