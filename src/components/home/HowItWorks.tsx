import { Wallet, MousePointer2, Send, BellRing } from 'lucide-react';

const steps = [
  { n: '01', icon: Wallet, title: 'Fund your wallet', desc: 'Top up securely with Paystack — Mobile Money, card or bank.' },
  { n: '02', icon: MousePointer2, title: 'Pick a service', desc: 'Data and airtime — pick your network and bundle in seconds.' },
  { n: '03', icon: Send, title: 'Order in seconds', desc: 'One tap to confirm. We handle delivery, supplier routing and retries.' },
  { n: '04', icon: BellRing, title: 'Get notified', desc: 'Live status, push & SMS alerts, plus full history in your dashboard.' },
];

const HowItWorks = () => {
  return (
    <section className="relative border-y border-border/40 bg-card/40">
      <div className="container py-20 md:py-24">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">How YieGo works</span>
          <h2 className="text-3xl md:text-4xl font-display font-extrabold tracking-tight mt-3">From sign-up to delivered, in under a minute.</h2>
        </div>

        <div className="relative grid md:grid-cols-4 gap-6 md:gap-4">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-7 left-[12%] right-[12%] h-px bg-gradient-to-r from-transparent via-border to-transparent" />

          {steps.map((s) => (
            <div key={s.n} className="relative">
              <div className="relative w-14 h-14 rounded-2xl bg-background border border-border flex items-center justify-center mx-auto md:mx-0 shadow-sm">
                <s.icon className="w-5 h-5 text-primary" />
                <span className="absolute -top-2 -right-2 text-[9px] font-bold tabular px-1.5 py-0.5 rounded bg-primary text-primary-foreground">{s.n}</span>
              </div>
              <h3 className="font-display font-bold text-base mt-5 tracking-tight text-center md:text-left">{s.title}</h3>
              <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed text-center md:text-left">{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
