import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search, Package, Clock, AlertCircle, CheckCircle, Loader2, XCircle, Info } from 'lucide-react';
import { formatPrice } from '@/data/bundles';
import { supabase } from '@/integrations/supabase/client';
import SEOHead from '@/components/seo/SEOHead';
import NonExpiryBadge from '@/components/bundles/NonExpiryBadge';

interface OrderResult {
  order_id: string;
  recipient_number: string;
  network: string;
  bundle_size_gb: number;
  amount_ghs: number;
  status: string;
  created_at: string;
  updated_at: string;
}

const statusConfig: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  Pending: { icon: Clock, color: 'text-primary', bg: 'bg-primary/10', label: 'Pending' },
  Processing: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Processing' },
  Delivered: { icon: CheckCircle, color: 'text-success', bg: 'bg-success/10', label: 'Delivered' },
  Failed: { icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10', label: 'Failed' },
};

const TrackOrder = () => {
  const [searchParams] = useSearchParams();
  const [orderId, setOrderId] = useState(searchParams.get('orderId') || '');
  const [result, setResult] = useState<OrderResult | null>(null);
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    setError('');
    setResult(null);

    if (!orderId.trim()) {
      setError('Please enter your Order ID');
      return;
    }

    setSearching(true);
    
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke('lookup-order', {
        body: { order_id: orderId.trim().toUpperCase() },
      });

      if (fnError) {
        console.error('Order lookup error:', fnError);
        setError('Something went wrong. Please try again.');
      } else if (fnData?.data) {
        setResult(fnData.data as OrderResult);
      }
    } catch (err) {
      console.error('Order lookup error:', err);
      setError('Something went wrong. Please try again.');
    }

    setSearched(true);
    setSearching(false);
  };

  const StatusIcon = result ? statusConfig[result.status]?.icon : null;

  return (
    <Layout>
      <SEOHead
        title="Track Your Order | YieGo"
        description="Track your data bundle order status in real-time. Enter your Order ID to check delivery status."
        path="/track-order"
      />
      <div className="container py-8 md:py-12 max-w-xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center mx-auto mb-4 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06)]">
            <Package className="w-8 h-8 text-primary" />
          </div>
          <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-primary mb-2">Order Tracker</span>
          <h1 className="text-3xl font-display font-bold mb-2 tracking-tight">Track Your Order</h1>
          <p className="text-muted-foreground text-sm">Enter your Order ID to check delivery status</p>
        </div>

        {/* Search form */}
        <div className="surface-premium rounded-2xl p-6 mb-6 shadow-[0_10px_30px_-15px_hsl(var(--primary)/0.2)]">
          <div className="space-y-4">
            <div>
              <Label htmlFor="orderId" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Order ID</Label>
              <Input
                id="orderId"
                placeholder="YG-XXXXXXXX"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value.toUpperCase())}
                className="mt-2 font-mono h-11 bg-background/50"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>

            {error && (
              <p className="text-sm text-destructive flex items-center gap-1.5 bg-destructive/10 ring-1 ring-destructive/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5" />{error}
              </p>
            )}

            <Button onClick={handleSearch} className="w-full gap-2 h-11 font-bold" disabled={searching}>
              <Search className="w-4 h-4" />
              {searching ? 'Searching...' : 'Track Order'}
            </Button>
          </div>
        </div>

        {/* Results */}
        {searched && !result && !searching && (
          <div className="surface-premium rounded-2xl p-8 text-center animate-page-in">
            <XCircle className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
            <h3 className="font-display font-semibold text-lg mb-1">Order Not Found</h3>
            <p className="text-sm text-muted-foreground">
              Please check your Order ID and try again.
            </p>
          </div>
        )}

        {result && StatusIcon && (
          <div className="surface-premium rounded-2xl p-6 animate-page-in shadow-[0_10px_30px_-15px_hsl(var(--primary)/0.2)]">
            {/* Status banner */}
            <div className={`rounded-xl p-4 flex items-center gap-3 mb-6 ${statusConfig[result.status]?.bg}`}>
              <StatusIcon className={`w-6 h-6 ${statusConfig[result.status]?.color}`} />
              <div>
                <p className={`font-display font-bold ${statusConfig[result.status]?.color}`}>
                  {statusConfig[result.status]?.label}
                </p>
                <p className="text-xs text-muted-foreground">
                  Last updated: {new Date(result.updated_at).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Order ID</span>
                <span className="font-mono font-semibold">{result.order_id}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Recipient</span>
                <span className="font-medium">{result.recipient_number}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Network</span>
                <span className="font-medium">{result.network}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Bundle</span>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{result.bundle_size_gb}GB</span>
                  <NonExpiryBadge size="xs" network={result.network} />
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold">{formatPrice(result.amount_ghs)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Created</span>
                <span className="font-medium">{new Date(result.created_at).toLocaleString()}</span>
              </div>
              {/* Safe status messages only */}
              {result.status === 'Processing' && (
                <div className="border-t border-border pt-3">
                  <p className="text-sm text-muted-foreground">Your order is processing. You will be updated shortly.</p>
                </div>
              )}
              {result.status === 'Failed' && (
                <div className="border-t border-border pt-3">
                  <p className="text-sm text-destructive">We could not complete your purchase right now. Please try again or contact support.</p>
                </div>
              )}
              {result.status === 'Delivered' && (
                <div className="border-t border-border pt-3">
                  <p className="text-sm text-success">Delivered successfully.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default TrackOrder;
