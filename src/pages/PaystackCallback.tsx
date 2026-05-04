import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { XCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import DepositReceipt from '@/components/paystack/DepositReceipt';
import Logo from '@/components/layout/Logo';
import OrderReceiptFull from '@/components/paystack/OrderReceiptFull';
import DataSikaLoader from '@/components/ui/DataSikaLoader';

type VerifyState = 'loading' | 'success' | 'failed' | 'error';

interface PaymentResult {
  purpose: string;
  orderId?: string;
  orderStatus?: string;
  amountCredited?: number;
  newBalance?: number;
  reference?: string;
  timestamp?: string;
  network?: string;
  bundleSizeGB?: number;
  recipientPhone?: string;
  amountGHS?: number;
  message: string;
}

const PaystackCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [state, setState] = useState<VerifyState>('loading');
  const [errorMessage, setErrorMessage] = useState('Verifying your payment...');
  const [result, setResult] = useState<PaymentResult | null>(null);
  const [rewardJustActivated, setRewardJustActivated] = useState(false);

  useEffect(() => {
    const reference = searchParams.get('reference') || searchParams.get('trxref');
    if (!reference) {
      setState('error');
      setErrorMessage('No payment reference found.');
      return;
    }
    verifyPayment(reference);
  }, [searchParams]);

  const verifyPayment = async (reference: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('paystack-verify', {
        body: { reference },
      });

      if (error) {
        console.error('Verify error:', error);
        setState('error');
        setErrorMessage('Could not verify payment. Please contact support.');
        return;
      }

      if (data?.verified) {
        setState('success');

        const purpose = data.purpose || '';
        const orderId = data.order_id || '';
        const orderStatus = data.order_status || '';

        let message = 'Payment verified successfully!';

        if (purpose === 'deposit') {
          message = 'Your wallet has been credited successfully!';
          toast.success('Deposit confirmed! Wallet has been credited.');
        } else if (purpose === 'order') {
          if (orderStatus === 'Failed') {
            message = 'Payment confirmed but delivery failed. Our team will retry shortly.';
            toast.error('Delivery issue — our team has been notified.');
          } else {
            message = 'Payment confirmed successfully. Your order is now processing.';
            toast.success('Payment confirmed! Order is processing.');
          }
        } else if (purpose === 'agent_activation') {
          message = 'Payment confirmed! Your agent store is now active.';
          toast.success('Agent activation complete!');
        } else if (purpose === 'agent_order') {
          message = 'Payment confirmed successfully. Your order is now processing.';
          toast.success('Payment confirmed! Order is processing.');
        }

        setResult({
          purpose,
          orderId,
          orderStatus,
          amountCredited: data.amount_credited,
          newBalance: data.new_balance,
          reference: data.reference || reference,
          timestamp: data.timestamp || new Date().toISOString(),
          network: data.network,
          bundleSizeGB: data.bundle_size_gb,
          recipientPhone: data.recipient_phone,
          amountGHS: data.amount_ghs,
          message,
        });

        sessionStorage.removeItem('datasika_paystack_meta');

        // ── Reward Activation Check ──────────────────────────────────
        // Backend already sets reward_activated=true after first paid order.
        // Here we just check if it was just activated to show the celebration.
        if (purpose === 'order' && orderStatus !== 'Failed') {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              // Poll briefly to let backend settle (webhook/verify may still be processing)
              await new Promise(r => setTimeout(r, 1200));
              const { data: profile } = await supabase
                .from('profiles')
                .select('reward_activated, referred_by')
                .eq('id', user.id)
                .maybeSingle();

              // Show reward-unlocked CTA if they have a referrer and reward is now activated
              if (profile?.referred_by && profile?.reward_activated) {
                setRewardJustActivated(true);
                sessionStorage.setItem('ds_reward_just_activated', '1');
              }
            }
          } catch { /* non-blocking */ }
        }
      } else {
        setState('failed');
        setErrorMessage(data?.message || 'Payment was not successful. Please try again.');
      }
    } catch (err) {
      console.error('Verification error:', err);
      setState('error');
      setErrorMessage('An unexpected error occurred. Please contact support.');
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Minimal header bar */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm">
        <div className="container max-w-md py-3 px-4">
          <Logo height="h-7" />
        </div>
      </div>

      {/* Main content — centered vertically */}
      <div className="flex-1 flex items-center justify-center py-8 md:py-12">
        {state === 'loading' && (
          <DataSikaLoader size="lg" text="Verifying your payment…" />
        )}

        {state === 'success' && result && (
          <>
            {result.purpose === 'deposit' && (
              <DepositReceipt
                amount={result.amountCredited || 0}
                reference={result.reference || ''}
                newBalance={result.newBalance ?? null}
                timestamp={result.timestamp || new Date().toISOString()}
              />
            )}

            {(result.purpose === 'order' || result.purpose === 'agent_order') && (
              <OrderReceiptFull
                orderId={result.orderId || ''}
                orderStatus={result.orderStatus || 'Processing'}
                message={result.message}
                network={result.network}
                bundleSizeGB={result.bundleSizeGB}
                recipientPhone={result.recipientPhone}
                amountGHS={result.amountGHS}
                reference={result.reference}
                timestamp={result.timestamp}
                rewardJustActivated={rewardJustActivated}
              />
            )}

            {result.purpose === 'agent_activation' && (
              <div className="text-center px-4 w-full max-w-md mx-auto">
                <div className="flex justify-center mb-6">
                  <div className="w-20 h-20 rounded-full bg-success/10 flex items-center justify-center animate-scale-in">
                    <svg className="w-10 h-10 text-success" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 13l4 4L19 7" className="animate-[checkmark-draw_0.4s_ease-out_0.3s_both]" style={{ strokeDasharray: 24, strokeDashoffset: 24 }} />
                    </svg>
                  </div>
                </div>
                <h1 className="text-2xl font-display font-bold mb-1">Agent Store Activated!</h1>
                <p className="text-muted-foreground text-sm mb-6">{result.message}</p>
                <Button onClick={() => navigate('/agent/dashboard')} className="w-full h-11 font-bold gap-2">
                  Go to Agent Dashboard
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            )}

            {!['deposit', 'order', 'agent_activation', 'agent_order'].includes(result.purpose) && (
              <div className="text-center px-4">
                <h1 className="text-2xl font-display font-bold mb-2">Payment Verified</h1>
                <p className="text-muted-foreground mb-6">{result.message}</p>
                <Button onClick={() => navigate('/dashboard')} className="w-full gap-2">
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </Button>
              </div>
            )}
          </>
        )}

        {(state === 'failed' || state === 'error') && (
          <div className="text-center px-4 w-full max-w-md mx-auto">
            <div className="w-20 h-20 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-6">
              <XCircle className="w-10 h-10 text-destructive" />
            </div>
            <h1 className="text-2xl font-display font-bold mb-2">
              {state === 'failed' ? 'Payment Not Completed' : 'Verification Error'}
            </h1>
            <p className="text-muted-foreground mb-8 text-sm">{errorMessage}</p>
            <div className="flex flex-col gap-3">
              <Button onClick={() => navigate('/buy-data')} className="w-full">
                Try Again
              </Button>
              <Button variant="outline" onClick={() => navigate('/support')} className="w-full">
                Contact Support
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaystackCallback;
