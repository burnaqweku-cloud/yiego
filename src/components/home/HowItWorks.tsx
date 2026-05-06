import { Wallet, MousePointer2, Send, BellRing } from 'lucide-react';

const steps = [
  { n: '01', icon: Wallet, title: 'Fund your wallet', desc: 'Top up securely with Paystack — Mobile Money, card or bank.' },
  { n: '02', icon: MousePointer2, title: 'Pick a service', desc: 'Data and airtime — pick your network and bundle in seconds.' },
  { n: '03', icon: Send, title: 'Order in seconds', desc: 'One tap to confirm. We handle delivery, supplier routing and retries.' },
  { n: '04', icon: BellRing, title: 'Get notified', desc: 'Live status, push & SMS alerts, plus full history in your dashboard.' },
];

const HowItWorks = () => {
  return (
    <section className="relative border-y border-border/40 bg-card/40 overflow-hidden">
      {/* Ambient background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full bg-primary/[0.04] blur-3xl" />
        <div className="noise-overlay" />
      </div>

      <div className="container py-20 md:py-28 relative">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 mb-4">
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-primary" />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">How YieGo works</span>
            <span className="h-px w-8 bg-gradient-to-l from-transparent to-primary" />
          </div>
          <h2 className="text-3xl md:text-[2.6rem] font-display font-extrabold tracking-[-0.03em] leading-[1.05]">
            From sign-up to delivered, <br className="hidden sm:inline" />
            <span className="text-gradient">in under a minute.</span>
          </h2>
        </div>

        <div className="relative grid md:grid-cols-4 gap-8 md:gap-6">
          {/* Animated gradient connecting line */}
          <div className="hidden md:block absolute top-8 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
          <div className="hidden md:block absolute top-8 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-primary/0 to-transparent" />

          {steps.map((s, i) => (
            <div key={s.n} className="relative group">
              <div className="relative w-16 h-16 rounded-2xl bg-card border border-border flex items-center justify-center mx-auto md:mx-0 shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.3)] group-hover:shadow-[0_12px_32px_-12px_hsl(var(--primary)/0.45)] group-hover:border-primary/40 group-hover:-translate-y-1 transition-all duration-300">
                {/* gradient ring */}
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-primary/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <s.icon className="w-6 h-6 text-primary relative" strokeWidth={1.8} />
                <span className="absolute -top-2 -right-2 text-[10px] font-extrabold tabular px-1.5 py-0.5 rounded-md bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.6)] tracking-wider">
                  {s.n}
                </span>
              </div>
              <h3 className="font-display font-bold text-[17px] mt-6 tracking-tight text-center md:text-left">{s.title}</h3>
              <p className="text-[13.5px] text-muted-foreground mt-2 leading-relaxed text-center md:text-left max-w-[240px] mx-auto md:mx-0">
                {s.desc}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
