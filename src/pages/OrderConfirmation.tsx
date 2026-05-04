import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import OrderReceiptFull from '@/components/paystack/OrderReceiptFull';
import Logo from '@/components/layout/Logo';
import YieGoLoader from '@/components/ui/YieGoLoader';
import DeliveryStatusPanel from '@/components/delivery/DeliveryStatusPanel';

interface OrderData {
  orderId: string;
  recipientNumber: string;
  network: string;
  bundleSizeGB: number;
  amountGHS: number;
  status: string;
  paymentMethod?: string;
  createdAt: string;
  updatedAt: string;
}

const OrderConfirmation = () => {
  const navigate = useNavigate();
  const [order, setOrder] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = sessionStorage.getItem('yiego_order');
    if (stored) {
      setOrder(JSON.parse(stored));
    } else {
      navigate('/');
    }
    setLoading(false);
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <YieGoLoader size="lg" text="Loading order details…" />
      </div>
    );
  }

  if (!order) return null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Minimal header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container max-w-md py-3 px-4">
          <Logo height="h-7" />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col items-center justify-center py-8 md:py-12 gap-6 px-4">
        <OrderReceiptFull
          orderId={order.orderId}
          orderStatus={'Processing'}
          message={
            order.status === 'Failed'
              ? 'Payment confirmed but delivery failed. Our team will retry shortly.'
              : 'Payment confirmed successfully. Your order is now processing. We\'ll update your order once it\'s completed.'
          }
          network={order.network}
          bundleSizeGB={order.bundleSizeGB}
          recipientPhone={order.recipientNumber}
          amountGHS={order.amountGHS}
          reference={order.paymentMethod === 'wallet' ? 'Wallet Payment' : undefined}
          timestamp={order.createdAt}
        />

        {/* Live delivery status */}
        <div className="w-full max-w-md">
          <DeliveryStatusPanel />
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmation;
