import { Zap, Shield, Wallet, MessageCircle, Clock, BarChart3 } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

const features = [
  {
    icon: Zap,
    title: 'Fast Delivery',
    description: 'Most bundles arrive within a few minutes. In rare cases delivery may take longer — failed orders are auto-refunded.',
  },
  {
    icon: Shield,
    title: 'Secure Checkout',
    description: 'Payments processed securely via Paystack. Your details stay protected.',
  },
  {
    icon: Wallet,
    title: 'Genuinely Cheaper',
    description: 'YieGo prices are much cheaper than buying direct from MTN, Telecel or AirtelTigo.',
  },
  {
    icon: MessageCircle,
    title: 'Live Chat Support',
    description: 'Talk to our team in-app or by email at support@yiego.com.',
  },
  {
    icon: Clock,
    title: '24/7 Availability',
    description: 'Our platform is always online. Buy data bundles anytime, anywhere.',
  },
  {
    icon: BarChart3,
    title: 'Order Tracking',
    description: 'Track every order in your dashboard or with your Order ID.',
  },
];

const WhyChooseUs = () => {
  const ref = useScrollReveal();

  return (
    <section className="container py-16 md:py-24" ref={ref}>
      <div className="text-center mb-12 reveal-on-scroll">
        <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary mb-3">Why YieGo</span>
        <h2 className="text-2xl md:text-3xl font-display font-bold mb-3">Why Choose YieGo</h2>
        <p className="text-muted-foreground max-w-md mx-auto text-sm leading-relaxed">We make buying data bundles fast, simple, and reliable</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5 max-w-4xl mx-auto reveal-stagger">
        {features.map((feature) => (
          <div
            key={feature.title}
            className="reveal-on-scroll group p-5 md:p-6 rounded-2xl surface-premium transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_12px_32px_-12px_hsl(var(--primary)/0.3)]"
          >
            <div className="w-11 h-11 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center mb-4 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06)] group-hover:bg-primary/15 transition-colors">
              <feature.icon className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-display font-semibold text-sm md:text-base mb-2 tracking-tight">{feature.title}</h3>
            <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default WhyChooseUs;
