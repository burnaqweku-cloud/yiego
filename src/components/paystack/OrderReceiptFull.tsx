import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Copy, ArrowRight, LayoutDashboard, AlertTriangle, UserPlus, LogIn, ChevronDown, ChevronUp, Trophy, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { formatPrice } from '@/data/bundles';
import NonExpiryBadge from '@/components/bundles/NonExpiryBadge';

interface OrderReceiptFullProps {
  orderId: string;
  orderStatus: string;
  message: string;
  network?: string;
  bundleSizeGB?: number;
  recipientPhone?: string;
  amountGHS?: number;
  reference?: string;
  timestamp?: string;
  rewardJustActivated?: boolean;
}

const maskPhone = (phone: string) => {
  if (!phone || phone.length < 7) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-3);
};

const statusSteps = [
  { label: 'Payment Verified', key: 'paid' },
  { label: 'Order Processing', key: 'processing' },
  { label: 'Delivery Confirmation', key: 'delivered' },
];

const getStepState = (status: string) => {
  const s = status.toLowerCase();
  if (s === 'delivered') return 3;
  if (s === 'failed') return -1;
  if (s === 'processing' || s === 'paid' || s === 'pending') return 2;
  return 1;
};

const OrderReceiptFull = ({
  orderId,
  orderStatus,
  message,
  network,
  bundleSizeGB,
  recipientPhone,
  amountGHS,
  reference,
  timestamp,
  rewardJustActivated = false,
}: OrderReceiptFullProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [activeStep, setActiveStep] = useState(1);
  const [notesOpen, setNotesOpen] = useState(false);
  const isFailed = orderStatus?.toLowerCase() === 'failed';

  useEffect(() => {
    const target = getStepState(orderStatus || 'processing');
    if (target === -1) {
      setActiveStep(2);
      return;
    }
    const timer = setTimeout(() => setActiveStep(target), 400);
    return () => clearTimeout(timer);
  }, [orderStatus]);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied!`);
  };

  const dateStr = timestamp
    ? new Date(timestamp).toLocaleDateString('en-GH', { year: 'numeric', month: 'short', day: 'numeric' })
    : '';
  const timeStr = timestamp
    ? new Date(timestamp).toLocaleTimeString('en-GH', { hour: '2-digit', minute: '2-digit' })
    : '';

  const statusBadgeClass = isFailed
    ? 'badge-failed'
    : orderStatus?.toLowerCase() === 'delivered'
      ? 'badge-delivered'
      : 'badge-processing';

  const displayStatus = isFailed ? 'Failed' : orderStatus?.toLowerCase() === 'delivered' ? 'Delivered' : 'Processing';

  return (
    <div
      className="w-full max-w-md mx-auto px-4 flex flex-col gap-4"
      style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
    >
      {/* ── Success Header ─────────────────────────── */}
      <div className="text-center pt-2 pb-1">
        <div
          className={`w-[72px] h-[72px] rounded-full flex items-center justify-center mx-auto mb-4 animate-scale-in ${
            isFailed
              ? 'bg-destructive/10 border-2 border-destructive/20'
              : 'bg-success/10 border-2 border-success/20'
          }`}
        >
          {isFailed ? (
            <AlertTriangle className="w-9 h-9 text-destructive" />
          ) : (
            <svg
              className="w-9 h-9 text-success"
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
                style={{ strokeDasharray: 24, strokeDashoffset: 24 }}
              />
            </svg>
          )}
        </div>

        <h1 className="text-[22px] font-display font-bold text-foreground mb-1">
          {isFailed ? 'Delivery Failed' : 'Payment Successful!'}
        </h1>
        <p className="text-muted-foreground text-sm leading-snug max-w-[280px] mx-auto">
          {isFailed
            ? 'Payment confirmed but delivery failed. Our team will retry shortly.'
            : 'Payment confirmed. Your order is now processing.'}
        </p>
      </div>

      {/* ── Step Tracker ───────────────────────────── */}
      {!isFailed && (
        <div className="bg-card border border-border rounded-2xl p-4 card-shadow animate-fade-in">
          <div className="relative flex items-start justify-between">
            {/* Progress line */}
            <div className="absolute top-4 left-[calc(16.67%+8px)] right-[calc(16.67%+8px)] h-[2px] bg-muted -z-0">
              <div
                className="h-full bg-success transition-all duration-700 ease-out"
                style={{ width: activeStep >= 3 ? '100%' : activeStep >= 2 ? '50%' : '0%' }}
              />
            </div>

            {statusSteps.map((step, i) => {
              const stepNum = i + 1;
              const isComplete = activeStep >= stepNum;
              const isCurrent = activeStep === stepNum && activeStep < 3;
              return (
                <div key={step.key} className="flex flex-col items-center flex-1 relative z-10">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-500 border-2 ${
                      isComplete
                        ? 'bg-success border-success text-white shadow-sm'
                        : 'bg-background border-border text-muted-foreground'
                    } ${isCurrent ? 'ring-4 ring-success/15' : ''}`}
                  >
                    {isComplete ? '✓' : stepNum}
                  </div>
                  <span
                    className={`text-[10px] mt-2 text-center leading-tight font-medium px-1 ${
                      isComplete ? 'text-success' : 'text-muted-foreground'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Order Summary Card ─────────────────────── */}
      <div className="bg-card border border-border rounded-2xl card-shadow overflow-hidden animate-[slide-up_0.4s_ease-out_0.2s_both]">
        {/* Header strip */}
        {orderId && (
          <div className="bg-primary/8 border-b border-primary/15 px-5 py-3.5">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mb-1">Order ID</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-display font-bold text-foreground tracking-wide">{orderId}</span>
              <button
                onClick={() => copy(orderId, 'Order ID')}
                className="p-1.5 rounded-lg hover:bg-muted transition-colors"
                aria-label="Copy order ID"
              >
                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>
        )}

        {/* Details */}
        <div className="px-5 py-4 space-y-3">
          {network && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Network</span>
              <span className="text-sm font-bold text-foreground">{network}</span>
            </div>
          )}
          {bundleSizeGB != null && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Bundle</span>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">{bundleSizeGB}GB</span>
                <NonExpiryBadge size="xs" network={network} />
              </div>
            </div>
          )}
          {recipientPhone && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Recipient</span>
              <span className="text-sm font-medium font-mono text-foreground">{maskPhone(recipientPhone)}</span>
            </div>
          )}
          {amountGHS != null && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Amount Paid</span>
              <span className="text-sm font-bold text-foreground">{formatPrice(amountGHS)}</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-medium">Payment Method</span>
            <span className="text-sm font-medium text-foreground">Paystack</span>
          </div>
          {reference && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Reference</span>
              <button
                onClick={() => copy(reference, 'Reference')}
                className="flex items-center gap-1 text-xs font-mono font-medium text-foreground hover:text-primary transition-colors"
              >
                {reference.length > 20 ? `${reference.slice(0, 20)}…` : reference}
                <Copy className="w-3 h-3 text-muted-foreground" />
              </button>
            </div>
          )}
          {dateStr && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground font-medium">Date & Time</span>
              <span className="text-sm font-medium text-foreground">{dateStr}, {timeStr}</span>
            </div>
          )}

          {/* Status */}
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground font-medium">Status</span>
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${statusBadgeClass}`}>
              ● {displayStatus}
            </span>
          </div>
        </div>
      </div>

      {/* ── Failed Guidance ────────────────────────── */}
      {isFailed && (
        <div className="bg-destructive/5 border border-destructive/20 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
          <div>
            <p className="text-sm text-foreground font-semibold mb-1">What happens next?</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Our team has been notified and will retry your delivery shortly. If the issue persists, contact us on WhatsApp with your Order ID.
            </p>
          </div>
        </div>
      )}

      {/* ── Collapsible Important Info ─────────────── */}
      <div className="border border-border rounded-2xl overflow-hidden">
        <button
          onClick={() => setNotesOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-3.5 bg-card text-left hover:bg-muted/50 transition-colors"
        >
          <span className="text-sm font-semibold text-foreground">ℹ️ Important Info</span>
          {notesOpen
            ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </button>
        {notesOpen && (
          <div className="px-4 pb-4 pt-1 bg-card space-y-2.5 border-t border-border">
            {[
              { icon: '⏱', text: 'Delivery time may vary depending on network conditions and order volume.' },
              { icon: '🔁', text: 'Do not place another order for the same number until the current order is completed.' },
              { icon: '⚠️', text: 'No refund for wrong numbers. Confirm the number before ordering.' },
              { icon: '📵', text: 'This service does not work on Turbonet SIM cards.' },
            ].map((note, i) => (
              <p key={i} className="text-xs text-muted-foreground leading-relaxed flex items-start gap-2">
                <span className="shrink-0">{note.icon}</span>
                <span>{note.text}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* ── CTA Buttons ────────────────────────────── */}
      <div className="flex flex-col gap-3">
        {/* Reward Ladder CTA — primary when activated */}
        {rewardJustActivated && (
          <button
            onClick={() => navigate('/reward-unlocked')}
            className="w-full h-12 flex items-center justify-center gap-2 rounded-2xl font-black text-sm text-foreground transition-all active:scale-[0.98] shadow-md"
            style={{
              background: 'linear-gradient(90deg, hsl(45 100% 50%), hsl(45 100% 62%))',
              boxShadow: '0 4px 16px hsl(45 100% 50% / 0.35)',
            }}
          >
            <Trophy className="w-4 h-4" />
            View Your Reward Ladder
            <ArrowRight className="w-4 h-4" />
          </button>
        )}

        {/* Buy More Data */}
        <Link to={user ? '/dashboard/buy-data' : '/buy-data'} className="w-full">
          <Button
            className={`w-full h-12 gap-2 font-semibold rounded-2xl ${rewardJustActivated ? 'bg-secondary text-secondary-foreground hover:bg-secondary/80' : ''}`}
            variant={rewardJustActivated ? 'outline' : 'default'}
          >
            <ShoppingBag className="w-4 h-4" />
            Buy More Data
          </Button>
        </Link>

        {/* Dashboard or auth */}
        {user ? (
          <Button
            variant="ghost"
            onClick={() => navigate('/dashboard')}
            className="w-full h-11 gap-2 text-muted-foreground rounded-2xl"
          >
            <LayoutDashboard className="w-4 h-4" />
            Go to Dashboard
          </Button>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-4 card-shadow">
            <h3 className="text-sm font-bold text-foreground mb-1">Create an account for more benefits</h3>
            <ul className="space-y-1 text-xs text-muted-foreground mb-4">
              <li>✓ Order tracking & history</li>
              <li>✓ Faster checkout</li>
              <li>✓ Wallet for instant payments</li>
              <li>✓ Priority support</li>
            </ul>
            <div className="flex gap-2">
              <Link to="/auth?tab=signup" className="flex-1">
                <Button className="w-full gap-1.5" size="sm">
                  <UserPlus className="w-3.5 h-3.5" />
                  Create Account
                </Button>
              </Link>
              <Link to="/auth" className="flex-1">
                <Button variant="outline" className="w-full gap-1.5" size="sm">
                  <LogIn className="w-3.5 h-3.5" />
                  Log In
                </Button>
              </Link>
            </div>
          </div>
        )}

        {/* WhatsApp for failed orders */}
        {isFailed && (
          <a
            href={`https://wa.me/233275644195?text=${encodeURIComponent(
              'Hi DataSika Support, I need help with my order. Order ID: ' +
                orderId +
                '. Recipient: ' +
                (recipientPhone || '') +
                '. Network: ' +
                (network || '') +
                '. Bundle: ' +
                (bundleSizeGB != null ? bundleSizeGB + 'GB' : '') +
                '.'
            )}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="ghost" className="w-full h-11 gap-2 text-destructive rounded-2xl">
              Chat on WhatsApp
            </Button>
          </a>
        )}
      </div>
    </div>
  );
};

export default OrderReceiptFull;
