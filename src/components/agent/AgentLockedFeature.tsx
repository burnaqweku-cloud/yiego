import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useStoreStatus } from '@/hooks/useStoreStatus';
import { useAgent } from '@/hooks/useAgent';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useState } from 'react';
import { Lock, CreditCard, Loader2, Rocket, Clock, ShieldOff, XCircle, CheckCircle } from 'lucide-react';

const STANDARD_PRICE = 50;
const PROMO_PRICE = 35;

interface AgentLockedFeatureProps {
  featureName: string;
}

const AgentLockedFeature = ({ featureName }: AgentLockedFeatureProps) => {
  const { agent } = useAgent();
  const { user } = useAuth();
  const { storeStatus, loading } = useStoreStatus();
  const [paying, setPaying] = useState(false);

  // Show skeleton while loading
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
        <Skeleton className="w-16 h-16 rounded-3xl mb-5" />
        <Skeleton className="h-5 w-48 mb-2" />
        <Skeleton className="h-4 w-64 mb-6" />
        <Skeleton className="h-40 w-full max-w-sm rounded-xl" />
      </div>
    );
  }

  // PENDING_REVIEW: show neutral "under review" notice — no payment UI
  if (storeStatus === 'pending_review') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <div className="w-16 h-16 rounded-3xl bg-amber-500/10 flex items-center justify-center mb-5">
          <Clock className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-lg font-bold mb-2">Application Under Review</h2>
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">
          Your application is being reviewed. You'll be notified once approved.
        </p>
        <p className="text-xs text-muted-foreground max-w-sm">
          {featureName} will be available after your application is approved and your store is activated.
        </p>
      </div>
    );
  }

  // APPROVED_NOT_SUBSCRIBED: show subscription paywall
  const handleSubscribe = async () => {
    if (!agent || !user) return;
    if (!user.email) {
      toast.error('Add an email to your profile to subscribe.');
      return;
    }
    setPaying(true);
    try {
      // Refresh session to prevent stale token errors on mobile/PWA
      const { error: refreshErr } = await supabase.auth.refreshSession();
      if (refreshErr) {
        toast.error('Session expired. Please log in again.');
        setPaying(false);
        return;
      }

      const callbackUrl = `${window.location.origin}/agent/subscription/callback`;
      const { data, error } = await supabase.functions.invoke('agent-initialize-payment', {
        body: {
          purpose: 'agent_subscription',
          agent_id: agent.id,
          email: user.email,
          callback_url: callbackUrl,
        },
      });
      if (error || !data?.authorization_url) {
        throw new Error(data?.error || 'Failed to initialize payment');
      }
      window.location.href = data.authorization_url;
    } catch (err: any) {
      toast.error(err.message || 'Payment failed. Please try again.');
      setPaying(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center mb-5">
        <Lock className="w-8 h-8 text-primary" />
      </div>
      <h2 className="text-lg font-bold mb-2">Activate your store to unlock {featureName}</h2>
      <p className="text-sm text-muted-foreground mb-6 max-w-sm">
        Subscribe to access full agent dashboard tools and start receiving customer orders.
      </p>

      <Card className="card-shadow border-primary/20 w-full max-w-sm">
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
              <Rocket className="w-5 h-5 text-primary" />
            </div>
            <div className="text-left">
              <p className="text-sm font-bold">Agent Store Subscription</p>
              <p className="text-[10px] text-muted-foreground">Unlock all agent features</p>
            </div>
          </div>

          <div className="bg-muted/50 rounded-xl p-3 text-center space-y-1">
            <div className="flex items-center justify-center gap-2">
              <span className="text-sm text-muted-foreground line-through">GHS {STANDARD_PRICE.toFixed(2)}</span>
              <span className="text-xl font-bold text-primary">GHS {PROMO_PRICE.toFixed(2)}</span>
              <span className="text-[10px] text-muted-foreground">/mo</span>
            </div>
            <Badge variant="secondary" className="text-[10px]">🔥 Limited Promo</Badge>
          </div>

          <Button onClick={handleSubscribe} disabled={paying} className="w-full" size="lg">
            {paying ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Redirecting...</>
            ) : (
              <><CreditCard className="w-4 h-4 mr-2" /> Subscribe — GHS {PROMO_PRICE.toFixed(2)}/mo</>
            )}
          </Button>
          <p className="text-[10px] text-muted-foreground text-center">
            Trusted payments via Paystack (MoMo, Cards). Instant activation.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentLockedFeature;
