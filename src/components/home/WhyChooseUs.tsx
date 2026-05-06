import { Zap, Shield, Wallet, MessageCircle, BarChart3, Layers } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

const features = [
  {
    icon: Layers,
    title: 'One wallet, every service',
    description: 'Data, airtime, bills, subscriptions and more — managed from one balance, one history, one account.',
  },
  {
    icon: Zap,
    title: 'Fast under normal conditions',
    description: 'Most orders complete within minutes. If a delivery fails, the amount is auto-refunded to your wallet.',
  },
  {
    icon: Wallet,
    title: 'Genuinely cheaper',
    description: 'YieGo prices undercut buying direct from MTN, Telecel and AirtelTigo. Save on every order.',
  },
  {
    icon: Shield,
    title: 'Secure by default',
    description: 'Paystack-grade payments, encrypted wallet, and strict server-side verification on every transaction.',
  },
  {
    icon: BarChart3,
    title: 'Track everything',
    description: 'Live order status, delivery ETAs, and a full transaction history available anytime.',
  },
  {
    icon: MessageCircle,
    title: 'Real human support',
    description: 'Live chat 9am–9pm and AI-assisted help round the clock. Real answers, not scripts.',
  },
];

const WhyChooseUs = () => {
  const ref = useScrollReveal();

  return (
    <section className="container py-16 md:py-24" ref={ref}>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 reveal-on-scroll">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 mb-4">
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-primary" />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Why YieGo</span>
          </div>
          <h2 className="text-3xl md:text-[2.6rem] font-display font-extrabold tracking-[-0.03em] leading-[1.05]">
            Built for everyday <span className="text-gradient">digital life</span>.
          </h2>
        </div>
        <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
          Not just another data shop. YieGo is a full digital services platform engineered for Ghana.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 reveal-stagger">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="reveal-on-scroll group relative overflow-hidden rounded-3xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_24px_48px_-20px_hsl(var(--primary)/0.35)]"
          >
            {/* Top-edge sheen on hover */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            {/* Corner glow on hover */}
            <div className="absolute -top-16 -right-16 w-44 h-44 rounded-full bg-primary/0 group-hover:bg-primary/12 blur-3xl transition-colors duration-700" />

            <div className="relative">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 ring-1 ring-primary/25 flex items-center justify-center mb-5 shadow-[0_4px_16px_-6px_hsl(var(--primary)/0.4)] group-hover:scale-105 group-hover:shadow-[0_8px_24px_-6px_hsl(var(--primary)/0.55)] transition-all duration-300">
                <feature.icon className="w-5 h-5 text-primary" strokeWidth={1.9} />
              </div>
              <h3 className="font-display font-bold text-[15.5px] tracking-tight mb-1.5">{feature.title}</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default WhyChooseUs;
