import {
  Tag, Wallet, Percent, CreditCard, Link2, ShieldCheck, Truck, MessageCircle,
} from 'lucide-react';

const benefits = [
  {
    icon: Tag,
    title: 'Discounted Agent Prices',
    desc: 'Buy bundles cheaper than normal users — lower cost, higher margin.',
  },
  {
    icon: Wallet,
    title: 'Auto Profit Tracking',
    desc: 'Your agent wallet tracks every cedis earned automatically per order.',
  },
  {
    icon: Percent,
    title: 'You Set Your Markup',
    desc: 'Choose how much profit you make per bundle — full control.',
  },
  {
    icon: CreditCard,
    title: 'Withdraw Anytime',
    desc: 'Cash out your earnings to Mobile Money whenever you want.',
  },
  {
    icon: Link2,
    title: 'Your Own Store Link',
    desc: 'Share your unique store link with customers — they buy, you earn.',
  },
  {
    icon: ShieldCheck,
    title: 'Verification Badge',
    desc: 'Approved stores get a verified badge for customer trust.',
  },
  {
    icon: Truck,
    title: 'Fast Delivery + Tracking',
    desc: 'Instant data delivery with real-time order status tracking.',
  },
  {
    icon: MessageCircle,
    title: 'WhatsApp on Your Store',
    desc: 'Customers can contact you directly via your own WhatsApp.',
  },
];

const AgentLandingBenefits = () => (
  <section className="px-4 py-10 sm:py-14 max-w-5xl mx-auto">
    <h2 className="text-xl sm:text-2xl font-bold text-foreground text-center mb-2">
      Why become an agent?
    </h2>
    <p className="text-sm text-muted-foreground text-center mb-8 max-w-md mx-auto">
      Everything you need to run a profitable data reselling business.
    </p>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {benefits.map((b, i) => (
        <div
          key={b.title}
          className="bg-card rounded-2xl border border-border p-5 card-shadow interactive-card"
          style={{ animationDelay: `${i * 0.04}s` }}
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-3">
            <b.icon className="w-5 h-5 text-primary" />
          </div>
          <h3 className="text-sm font-bold text-foreground mb-1">{b.title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
        </div>
      ))}
    </div>
  </section>
);

export default AgentLandingBenefits;
