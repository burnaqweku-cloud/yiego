import { Zap, Shield, Wallet, MessageCircle, BarChart3, Layers } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

const features = [
  {
    icon: Layers,
    title: 'One wallet, every service',
    description: 'Data, airtime, bills, social boosting and more — managed from one balance, one history, one account.',
  },
  {
    icon: Zap,
    title: 'Built for speed',
    description: 'Most orders complete in seconds. Failed orders are auto-refunded back to your wallet — no chasing.',
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
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 reveal-on-scroll">
        <div className="max-w-xl">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Why YieGo</span>
          <h2 className="text-3xl md:text-4xl font-display font-extrabold tracking-tight mt-3 leading-tight">
            Built for everyday <span className="text-gradient">digital life</span>.
          </h2>
        </div>
        <p className="text-sm text-muted-foreground max-w-sm">
          Not just another data shop. YieGo is a full digital services platform engineered for Ghana.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4 reveal-stagger">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="reveal-on-scroll group relative overflow-hidden rounded-3xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-[0_20px_40px_-20px_hsl(var(--primary)/0.3)]"
          >
            {/* Subtle corner glow on hover */}
            <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-primary/0 group-hover:bg-primary/10 blur-3xl transition-colors duration-500" />

            <div className="relative">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 flex items-center justify-center mb-5">
                <feature.icon className="w-5 h-5 text-primary" />
              </div>
              <h3 className="font-display font-bold text-[15px] tracking-tight mb-1.5">{feature.title}</h3>
              <p className="text-[13px] text-muted-foreground leading-relaxed">{feature.description}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default WhyChooseUs;
