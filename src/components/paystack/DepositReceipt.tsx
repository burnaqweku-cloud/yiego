import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Copy, Wallet, ArrowRight, ListOrdered, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface DepositReceiptProps {
  amount: number;
  reference: string;
  newBalance: number | null;
  timestamp: string;
}

const formatPrice = (n: number) =>
  `GHS ${n.toLocaleString('en-GH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DepositReceipt = ({ amount, reference, newBalance, timestamp }: DepositReceiptProps) => {
  const navigate = useNavigate();

  const copyRef = () => {
    navigator.clipboard.writeText(reference);
    toast.success('Reference copied!');
  };

  const dateStr = new Date(timestamp).toLocaleDateString('en-GH', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
  const timeStr = new Date(timestamp).toLocaleTimeString('en-GH', {
    hour: '2-digit', minute: '2-digit',
  });

  return (
    <div className="w-full max-w-md mx-auto px-4">
      {/* Animated Checkmark */}
      <div className="flex justify-center mb-6">
        <div className="w-20 h-20 rounded-full bg-[hsl(142,70%,45%)]/10 flex items-center justify-center animate-scale-in">
          <svg
            className="w-10 h-10 text-[hsl(142,70%,45%)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path
              d="M5 13l4 4L19 7"
              className="animate-[checkmark-draw_0.4s_ease-out_0.3s_both]"
              style={{
                strokeDasharray: 24,
                strokeDashoffset: 24,
              }}
            />
          </svg>
        </div>
      </div>

      <h1 className="text-2xl font-display font-bold text-center mb-1">Top-up Successful</h1>
      <p className="text-muted-foreground text-center text-sm mb-6">Your wallet has been credited.</p>

      {/* Receipt Card */}
      <div
        className="bg-card rounded-2xl border border-border card-shadow overflow-hidden mb-4 animate-[slide-up_0.4s_ease-out_0.2s_both]"
        style={{ opacity: 0 }}
      >
        {/* Amount Header */}
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 px-6 py-5 text-center border-b border-border">
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-1">Amount Credited</p>
          <p className="text-3xl font-display font-bold text-foreground">{formatPrice(amount)}</p>
        </div>

        {/* Details */}
        <div className="px-6 py-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Reference</span>
            <button onClick={copyRef} className="flex items-center gap-1.5 text-sm font-mono font-medium text-foreground hover:text-primary transition-colors">
              {reference.length > 24 ? `${reference.slice(0, 24)}…` : reference}
              <Copy className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Date & Time</span>
            <span className="text-sm font-medium text-foreground">{dateStr}, {timeStr}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Payment Method</span>
            <span className="text-sm font-medium text-foreground">Paystack</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Status</span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[hsl(142,70%,45%)]/10 text-[hsl(142,70%,45%)] text-xs font-bold animate-[pulse-badge_1s_ease-in-out_0.6s_1]">
              ● Credited
            </span>
          </div>

          {newBalance !== null && (
            <>
              <div className="border-t border-dashed border-border my-1" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground font-medium">New Wallet Balance</span>
                <span className="text-lg font-display font-bold text-primary">{formatPrice(newBalance)}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Help Note */}
      <div className="bg-secondary rounded-xl px-4 py-3 mb-6 flex items-start gap-2.5 animate-fade-in">
        <RefreshCw className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          If your balance doesn't update within 1–2 minutes, tap Refresh on your wallet page or chat with us on WhatsApp with your reference.
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-3">
        <Button onClick={() => navigate('/dashboard/wallet')} className="w-full h-11 font-bold gap-2">
          <Wallet className="w-4 h-4" />
          Go to Wallet
          <ArrowRight className="w-4 h-4" />
        </Button>
        <Button variant="outline" onClick={() => navigate('/dashboard/wallet')} className="w-full h-11 font-medium gap-2">
          <ListOrdered className="w-4 h-4" />
          View Transactions
        </Button>
      </div>
    </div>
  );
};

export default DepositReceipt;
