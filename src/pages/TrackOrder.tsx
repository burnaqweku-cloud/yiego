import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Search, Package, Clock, AlertCircle, CheckCircle, Loader2, XCircle,
  Smartphone, Hash, Calendar, Receipt, ArrowRight, ShieldCheck,
} from 'lucide-react';
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

const statusConfig: Record<string, { icon: any; color: string; bg: string; ring: string; label: string; copy: string }> = {
  Pending:    { icon: Clock,       color: 'text-amber-500',     bg: 'bg-amber-500/10',     ring: 'ring-amber-500/30',  label: 'Queued',     copy: 'Your order is queued and will be picked up shortly.' },
  Processing: { icon: Loader2,     color: 'text-primary',       bg: 'bg-primary/10',       ring: 'ring-primary/30',    label: 'Processing', copy: 'We\'re processing your order with the network.' },
  Delivered:  { icon: CheckCircle, color: 'text-success',       bg: 'bg-success/10',       ring: 'ring-success/30',    label: 'Delivered',  copy: 'All done — delivered successfully.' },
  Failed:     { icon: XCircle,     color: 'text-destructive',   bg: 'bg-destructive/10',   ring: 'ring-destructive/30', label: 'Failed',     copy: 'We couldn\'t complete this order. Refunds are automatic.' },
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
    if (!orderId.trim()) { setError('Please enter your reference'); return; }
    setSearching(true);
    try {
      const { data: fnData, error: fnError } = await supabase.functions.invoke('lookup-order', {
        body: { order_id: orderId.trim().toUpperCase() },
      });
      if (fnError) {
        setError('Something went wrong. Please try again.');
      } else if (fnData?.data) {
        setResult(fnData.data as OrderResult);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    }
    setSearched(true);
    setSearching(false);
  };

  const status = result ? (statusConfig[result.status] || statusConfig.Pending) : null;
  const StatusIcon = status?.icon;

  return (
    <Layout>
      <SEOHead
        title="Track Your Order | YieGo"
        description="Track any YieGo order in real-time. Enter your reference to check delivery status."
        path="/track-order"
      />

      {/* Hero */}
      <section className="relative border-b border-border/40 overflow-hidden">
        <div className="absolute inset-0 -z-10">
          <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-[600px] h-[400px] rounded-full bg-primary/15 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(hsl(var(--foreground)) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        </div>
        <div className="container py-10 md:py-14 max-w-2xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 mb-4">
            <Package className="w-3 h-3 text-primary" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-primary">Order tracker</span>
          </div>
          <h1 className="text-3xl md:text-[2.4rem] font-display font-extrabold tracking-[-0.025em] leading-[1.1]">
            Track your <span className="text-gradient">YieGo order</span>
          </h1>
          <p className="text-muted-foreground text-[14px] mt-3 leading-relaxed">
            Enter your order reference to check the latest status.
          </p>
        </div>
      </section>

      <div className="container py-8 md:py-10 max-w-2xl">
        {/* Search card */}
        <div className="rounded-3xl border border-border/70 bg-card shadow-[0_20px_50px_-20px_hsl(var(--primary)/0.2)] p-5 md:p-6 mb-6">
          <label htmlFor="orderId" className="text-[10.5px] font-bold uppercase tracking-[0.18em] text-muted-foreground/80">Reference</label>
          <div className="mt-2 flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
              <Input
                id="orderId"
                placeholder="YG-XXXXXXXX"
                value={orderId}
                onChange={(e) => setOrderId(e.target.value.toUpperCase())}
                className="pl-10 font-mono h-12 text-[15px] tracking-wider"
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                autoFocus
              />
            </div>
            <Button onClick={handleSearch} className="h-12 px-6 gap-2 font-bold rounded-xl" disabled={searching}>
              {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
              {searching ? 'Searching' : 'Track'}
            </Button>
          </div>

          {error && (
            <div className="mt-3 flex items-start gap-2 text-[13px] text-destructive bg-destructive/10 ring-1 ring-destructive/20 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
            </div>
          )}

        </div>

        {/* Empty state — first visit */}
        {!searched && !searching && (
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { icon: Search, title: 'Find', desc: 'Paste your reference above' },
              { icon: Loader2, title: 'See status', desc: 'Live progress at a glance' },
              { icon: ShieldCheck, title: 'Stay safe', desc: 'Auto-refunds on any failure' },
            ].map((s) => (
              <div key={s.title} className="rounded-2xl border border-border/60 bg-card/60 p-4">
                <div className="w-8 h-8 rounded-lg bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center mb-2.5">
                  <s.icon className="w-3.5 h-3.5 text-primary" />
                </div>
                <p className="text-[13px] font-semibold">{s.title}</p>
                <p className="text-[11.5px] text-muted-foreground mt-0.5">{s.desc}</p>
              </div>
            ))}
          </div>
        )}

        {/* Not found */}
        {searched && !result && !searching && (
          <div className="rounded-3xl border border-border/70 bg-card p-8 text-center animate-page-in">
            <div className="w-14 h-14 rounded-2xl bg-muted/60 mx-auto mb-4 flex items-center justify-center">
              <XCircle className="w-6 h-6 text-muted-foreground/60" />
            </div>
            <h3 className="font-display font-bold text-lg">Reference not found</h3>
            <p className="text-[13px] text-muted-foreground mt-1.5 max-w-sm mx-auto">
              Double-check the reference and try again — make sure there are no extra spaces.
            </p>
          </div>
        )}

        {/* Result */}
        {result && status && StatusIcon && (
          <div className="rounded-3xl border border-border/70 bg-card overflow-hidden animate-page-in shadow-[0_20px_50px_-20px_hsl(var(--primary)/0.2)]">
            {/* Status banner */}
            <div className={`p-5 md:p-6 flex items-start gap-4 ${status.bg} border-b border-border/40`}>
              <div className={`w-12 h-12 rounded-2xl bg-card ring-1 ${status.ring} flex items-center justify-center shrink-0`}>
                <StatusIcon className={`w-6 h-6 ${status.color} ${result.status === 'Processing' ? 'animate-spin' : ''}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className={`font-display font-bold text-lg ${status.color}`}>{status.label}</p>
                  <span className="font-mono text-[11px] font-semibold px-2 py-0.5 rounded-md bg-background/60 ring-1 ring-border/60">{result.order_id}</span>
                </div>
                <p className="text-[13px] text-foreground/75 mt-1 leading-relaxed">{status.copy}</p>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  Updated {new Date(result.updated_at).toLocaleString()}
                </p>
              </div>
            </div>

            {/* Details */}
            <div className="p-5 md:p-6 grid sm:grid-cols-2 gap-x-6 gap-y-4">
              <Detail icon={Smartphone} label="Recipient" value={result.recipient_number} />
              <Detail icon={Hash} label="Network" value={result.network} />
              <Detail
                icon={Package}
                label="Bundle"
                value={
                  <div className="flex items-center gap-2">
                    <span>{result.bundle_size_gb}GB</span>
                    <NonExpiryBadge size="xs" network={result.network} />
                  </div>
                }
              />
              <Detail icon={Receipt} label="Amount" value={formatPrice(result.amount_ghs)} />
              <Detail icon={Calendar} label="Created" value={new Date(result.created_at).toLocaleString()} />
            </div>
          </div>
        )}

        {/* Helper footer */}
        <div className="mt-8 text-center">
          <a href="/support" className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-primary hover:gap-2.5 transition-all">
            Need a hand? Contact support <ArrowRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </Layout>
  );
};

const Detail = ({ icon: Icon, label, value }: { icon: any; label: string; value: React.ReactNode }) => (
  <div className="flex items-start gap-3">
    <div className="w-8 h-8 rounded-lg bg-muted/50 flex items-center justify-center shrink-0 mt-0.5">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
    </div>
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/70">{label}</p>
      <div className="text-[13.5px] font-semibold mt-0.5 break-words">{value}</div>
    </div>
  </div>
);

export default TrackOrder;
