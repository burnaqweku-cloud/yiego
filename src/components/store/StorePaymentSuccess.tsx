import { CheckCircle, Copy, ArrowLeft, ShoppingBag, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import NonExpiryBadge from '@/components/bundles/NonExpiryBadge';

interface StorePaymentSuccessProps {
  orderId: string;
  storeName: string;
  network: string;
  bundleSizeGb: number;
  amountPaid: number;
  recipientPhone: string;
  paystackReference?: string;
  slug: string;
  onBackToStore: () => void;
}


const StorePaymentSuccess = ({
  orderId,
  storeName,
  network,
  bundleSizeGb,
  amountPaid,
  recipientPhone,
  paystackReference,
  slug,
  onBackToStore,
}: StorePaymentSuccessProps) => {
  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  const handleShare = async () => {
    const text = `✅ Order Confirmed\n\n📦 ${bundleSizeGb > 0 ? `${bundleSizeGb}GB` : '—'} ${network || '—'}\n📱 To: ${recipientPhone || '—'}\n💰 ${amountPaid > 0 ? `GHS ${amountPaid.toFixed(2)}` : '—'}\n🆔 ${orderId}\n\nPurchased from ${storeName}`;
    if (navigator.share) {
      try { await navigator.share({ title: 'Order Receipt', text }); } catch {}
    } else {
      navigator.clipboard.writeText(text);
      toast.success('Receipt copied to clipboard!');
    }
  };

  const dateStr = new Date().toLocaleDateString('en-GH', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = new Date().toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-5 animate-hero-in">
        {/* Success icon */}
        <div className="text-center space-y-3">
          <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center mx-auto payment-success-icon">
            <CheckCircle className="w-10 h-10 text-success" />
          </div>
          <h2 className="text-xl font-bold">Payment Successful!</h2>
          <p className="text-sm text-muted-foreground">
            Your order has been received and is now processing. We'll update your order once it's completed.
          </p>
        </div>

        {/* Order Summary Card — receipt style */}
        <div className="bg-card border border-border rounded-2xl card-shadow overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-secondary/30">
            <h3 className="text-sm font-bold">Order Summary</h3>
          </div>
          <div className="px-5 py-4 space-y-3">
            {/* Order ID */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Order ID</span>
              <button
                onClick={() => handleCopy(orderId, 'Order ID')}
                className="flex items-center gap-1.5 text-sm font-mono font-bold hover:text-primary transition-colors"
              >
                {orderId}
                <Copy className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>

            {/* Store */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Store</span>
              <span className="text-sm font-semibold">{storeName}</span>
            </div>

            {/* Network */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Network</span>
              <span className="text-sm font-semibold">{network}</span>
            </div>

            {/* Bundle */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Bundle</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{bundleSizeGb > 0 ? `${bundleSizeGb}GB` : '—'}</span>
                {bundleSizeGb > 0 && <NonExpiryBadge size="xs" network={network} />}
              </div>
            </div>

            {/* Recipient */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Recipient</span>
              <span className="text-sm font-semibold">{recipientPhone || '—'}</span>
            </div>

            {/* Amount */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Amount Paid</span>
              <span className="text-sm font-bold">{amountPaid > 0 ? `GHS ${amountPaid.toFixed(2)}` : '—'}</span>
            </div>

            {/* Paystack Reference */}
            {paystackReference && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Reference</span>
                <button
                  onClick={() => handleCopy(paystackReference, 'Reference')}
                  className="flex items-center gap-1 text-xs font-mono font-medium hover:text-primary transition-colors"
                >
                  {paystackReference.length > 20 ? `${paystackReference.slice(0, 20)}…` : paystackReference}
                  <Copy className="w-3 h-3 text-muted-foreground" />
                </button>
              </div>
            )}

            {/* Date/Time */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Date & Time</span>
              <span className="text-sm font-medium">{dateStr}, {timeStr}</span>
            </div>

            {/* Status */}
            <div className="flex items-center justify-between pt-1 border-t border-border">
              <span className="text-xs text-muted-foreground">Status</span>
              <span className="badge-processing px-2.5 py-0.5 rounded-full text-[11px] font-bold">
                Processing
              </span>
            </div>
          </div>
        </div>

        {/* Delivery notice */}
        <div className="bg-primary/8 border border-primary/20 rounded-xl p-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your bundle will be delivered shortly. Delivery time may vary depending on network conditions and order volume.
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            <li className="flex items-start gap-1.5">
              <span className="text-primary mt-0.5">•</span>
              Phone number must not owe airtime.
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-primary mt-0.5">•</span>
              Turbonet SIM cards are not supported.
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-primary mt-0.5">•</span>
              Do not place another order for the same number until completed.
            </li>
            <li className="flex items-start gap-1.5">
              <span className="text-primary mt-0.5">•</span>
              No refunds for wrong numbers.
            </li>
          </ul>
        </div>

        {/* Actions */}
        <div className="space-y-2.5">
          <Button
            variant="outline"
            onClick={handleShare}
            className="w-full rounded-xl btn-press gap-2 text-sm"
            size="lg"
          >
            <Share2 className="w-4 h-4" /> Share Receipt
          </Button>

          <Button
            onClick={onBackToStore}
            className="w-full rounded-xl btn-press font-semibold gap-2"
            size="lg"
          >
            <ShoppingBag className="w-4 h-4" /> Buy Another Bundle
          </Button>
          <Button
            variant="ghost"
            onClick={onBackToStore}
            className="w-full rounded-xl btn-press gap-2 text-muted-foreground"
            size="lg"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Store
          </Button>
        </div>
      </div>
    </div>
  );
};

export default StorePaymentSuccess;
