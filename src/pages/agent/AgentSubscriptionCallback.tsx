import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAgent } from '@/hooks/useAgent';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Layout from '@/components/layout/Layout';
import { CheckCircle, XCircle, Loader2 } from 'lucide-react';

const AgentSubscriptionCallback = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refresh } = useAgent();
  const [status, setStatus] = useState<'verifying' | 'success' | 'failed'>('verifying');
  const [details, setDetails] = useState<{
    expiresAt?: string;
    reference?: string;
    errorMessage?: string;
  }>({});
  const verifiedRef = useRef(false);

  useEffect(() => {
    const reference = searchParams.get('trxref') || searchParams.get('reference');
    if (reference && !verifiedRef.current) {
      verifiedRef.current = true;
      verifyPayment(reference);
    } else if (!reference) {
      setStatus('failed');
      setDetails({ errorMessage: 'No payment reference found.' });
    }
  }, [searchParams]);

  const verifyPayment = async (reference: string) => {
    try {
      console.log('[SubscriptionCallback] Verifying reference:', reference);

      const { data, error } = await supabase.functions.invoke('paystack-verify', {
        body: { reference },
      });

      console.log('[SubscriptionCallback] Verify response:', data, error);

      if (error) {
        throw new Error('Failed to connect to verification service');
      }

      if (data?.verified && data?.processed) {
        setStatus('success');
        setDetails({
          expiresAt: data.expires_at,
          reference,
        });
        // Refresh agent data to pick up active status
        await refresh();
      } else {
        setStatus('failed');
        setDetails({
          reference,
          errorMessage: 'Payment verification failed. Please try again.',
        });
      }
    } catch (err: any) {
      console.error('[SubscriptionCallback] Error:', err);
      setStatus('failed');
      setDetails({
        reference,
        errorMessage: 'Could not verify payment. Please try again.',
      });
    }
  };

  if (status === 'verifying') {
    return (
      <Layout>
        <div className="min-h-[60vh] flex items-center justify-center">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
            <p className="text-sm text-muted-foreground">Verifying your payment...</p>
            <p className="text-xs text-muted-foreground">Please do not close this page.</p>
          </div>
        </div>
      </Layout>
    );
  }

  if (status === 'success') {
    return (
      <Layout>
        <div className="max-w-md mx-auto px-4 py-12">
          <Card>
            <CardContent className="p-8 text-center space-y-4">
              <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto" />
              <h2 className="text-2xl font-bold">Store Activated!</h2>
              <p className="text-muted-foreground text-sm">
                Your subscription is now active and your store is live.
              </p>
              {details.expiresAt && (
                <div className="p-3 bg-muted rounded-lg text-sm">
                  <p className="text-muted-foreground">Subscription valid until</p>
                  <p className="font-semibold">
                    {new Date(details.expiresAt).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </p>
                </div>
              )}
              {details.reference && (
                <p className="text-xs text-muted-foreground">
                  Ref: {details.reference}
                </p>
              )}
              <Button onClick={() => navigate('/agent/dashboard')} className="w-full" size="lg">
                Go to Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  // Failed
  return (
    <Layout>
      <div className="max-w-md mx-auto px-4 py-12">
        <Card>
          <CardContent className="p-8 text-center space-y-4">
            <XCircle className="w-16 h-16 text-destructive mx-auto" />
            <h2 className="text-xl font-bold">Payment Failed</h2>
            <p className="text-muted-foreground text-sm">
              {details.errorMessage || 'Your payment could not be verified. Please try again.'}
            </p>
            {details.reference && (
              <p className="text-xs text-muted-foreground">
                Ref: {details.reference}
              </p>
            )}
            <div className="space-y-2">
              <Button onClick={() => navigate('/agent/activate')} className="w-full" size="lg">
                Try Again
              </Button>
              <Button variant="outline" onClick={() => navigate('/support')} className="w-full">
                Contact Support
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default AgentSubscriptionCallback;
