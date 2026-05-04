import { ClipboardList, Search, CreditCard, Share2 } from 'lucide-react';

const steps = [
  { icon: ClipboardList, title: 'Apply in 3 minutes', desc: 'Fill out a quick form with your store info and identity.' },
  { icon: Search, title: 'Admin reviews & approves', desc: 'Our team verifies your application and activates your store.' },
  { icon: CreditCard, title: 'Pay activation fee', desc: 'One-time setup fee to unlock your store (if enabled).' },
  { icon: Share2, title: 'Share & start earning', desc: 'Share your store link, sell bundles, earn profit per order.' },
];

const AgentLandingHowItWorks = () => (
  <section id="how-it-works" className="px-4 py-10 sm:py-14 max-w-3xl mx-auto">
    <h2 className="text-xl sm:text-2xl font-bold text-foreground text-center mb-2">
      How it works
    </h2>
    <p className="text-sm text-muted-foreground text-center mb-8 max-w-md mx-auto">
      From application to earning — in 4 simple steps.
    </p>

    <div className="relative">
      {/* Vertical line connector */}
      <div className="absolute left-5 top-6 bottom-6 w-0.5 bg-border hidden sm:block" aria-hidden="true" />

      <div className="space-y-4 sm:space-y-6">
        {steps.map((s, i) => (
          <div key={s.title} className="flex items-start gap-4 relative">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 z-10 border-2 border-background">
              <s.icon className="w-5 h-5 text-primary" />
            </div>
            <div className="pt-1">
              <p className="text-xs text-muted-foreground font-semibold mb-0.5">Step {i + 1}</p>
              <h3 className="text-sm font-bold text-foreground">{s.title}</h3>
              <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default AgentLandingHowItWorks;
