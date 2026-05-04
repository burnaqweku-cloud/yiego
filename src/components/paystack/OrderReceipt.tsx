import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Copy, Search, ArrowRight, Zap } from 'lucide-react';
import { toast } from 'sonner';

interface OrderReceiptProps {
  orderId: string;
  orderStatus: string;
  message: string;
}

const OrderReceipt = ({ orderId, orderStatus, message }: OrderReceiptProps) => {
  const copyOrderId = () => {
    navigator.clipboard.writeText(orderId);
    toast.success('Order ID copied!');
  };

  return (
    <div className="w-full max-w-md mx-auto px-4">
      {/* Checkmark */}
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
              style={{ strokeDasharray: 24, strokeDashoffset: 24 }}
            />
          </svg>
        </div>
      </div>

      <h1 className="text-2xl font-display font-bold text-center mb-1">Payment Successful!</h1>
      <p className="text-muted-foreground text-center text-sm mb-6">{message}</p>

      <div className="bg-secondary rounded-xl p-4 mb-4 flex items-center gap-3 justify-center animate-fade-in">
        <Zap className="w-4 h-4 text-primary shrink-0" />
        <p className="text-sm text-muted-foreground font-medium">
          Fast Delivery — delivery times may vary based on network conditions.
        </p>
      </div>

      {/* Order ID Card */}
      {orderId && (
        <div
          className="bg-card rounded-2xl p-6 card-shadow border border-border mb-6 text-left animate-[slide-up_0.4s_ease-out_0.2s_both]"
          style={{ opacity: 0 }}
        >
          <p className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-2">Order ID</p>
          <div className="flex items-center gap-3">
            <span className="text-2xl font-display font-bold text-foreground">{orderId}</span>
            <button onClick={copyOrderId} className="p-2 rounded-lg hover:bg-muted transition-colors" aria-label="Copy order ID">
              <Copy className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          {orderStatus && (
            <div className="mt-3">
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                orderStatus === 'Delivered'
                  ? 'bg-[hsl(142,70%,45%)]/10 text-[hsl(142,70%,45%)]'
                  : 'bg-primary/10 text-primary'
              }`}>
                ● {orderStatus}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3">
        {orderId && (
          <Link to={`/track-order?orderId=${orderId}`} className="flex-1">
            <Button variant="outline" className="w-full gap-2">
              <Search className="w-4 h-4" />
              Track This Order
            </Button>
          </Link>
        )}
        <Link to="/buy-data" className="flex-1">
          <Button className="w-full gap-2">
            Buy More Data
            <ArrowRight className="w-4 h-4" />
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default OrderReceipt;
