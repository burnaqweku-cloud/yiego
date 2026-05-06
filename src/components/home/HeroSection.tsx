import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  ArrowRight, Wallet, Smartphone, Receipt, Sparkles, Tv, CheckCircle2, Send,
} from 'lucide-react';

const HeroSection = () => {
  return (
    <section className="relative overflow-hidden border-b border-border/40">
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-card/60" />
        <div className="absolute top-[-14%] right-[-12%] w-[620px] h-[620px] rounded-full blur-3xl opacity-30 bg-primary glow-drift" />
        <div className="absolute bottom-[-22%] left-[-8%] w-[420px] h-[420px] rounded-full blur-3xl opacity-[0.18] bg-accent glow-drift-slow" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{ backgroundImage: 'radial-gradient(hsl(var(--foreground)) 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />
        <div className="noise-overlay" />
      </div>

      <div className="container py-14 md:py-24 lg:py-28">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          {/* Copy */}
          <div className="lg:col-span-7 hero-stagger-1 animate-hero-in">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 backdrop-blur-sm px-3 py-1.5 mb-7 shadow-[0_4px_16px_-8px_hsl(var(--primary)/0.4)]">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-60" />
                <span className="relative w-1.5 h-1.5 rounded-full bg-primary" />
              </span>
              <span className="text-[11px] font-semibold tracking-wide text-primary uppercase">Now serving Ghana</span>
            </div>

            <h1 className="text-[2.75rem] sm:text-[3.4rem] lg:text-[4.8rem] font-display font-extrabold tracking-[-0.04em] leading-[0.98] mb-6">
              Your everyday <br className="hidden sm:inline" />
              <span className="text-gradient">digital plug.</span>
            </h1>

            <p className="text-base md:text-lg text-muted-foreground max-w-xl leading-relaxed mb-9">
              Data, airtime, bills, subscriptions and more — one wallet, one account, built for how Ghana actually spends online.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/auth?tab=signup" className="sm:w-auto">
                <Button size="lg" className="rounded-full px-7 h-12 font-bold gap-2 w-full sm:w-auto shadow-[0_10px_30px_-8px_hsl(var(--primary)/0.65)] hover:shadow-[0_14px_36px_-8px_hsl(var(--primary)/0.75)] hover:-translate-y-0.5 transition-all">
                  Open my wallet <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/buy-data" className="sm:w-auto">
                <Button size="lg" variant="outline" className="rounded-full px-7 h-12 font-semibold gap-2 w-full sm:w-auto backdrop-blur-sm bg-background/40 hover:bg-background/70">
                  <Smartphone className="w-4 h-4" /> Buy data now
                </Button>
              </Link>
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-9">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/70 bg-background/50 backdrop-blur-sm text-[11px] font-medium text-muted-foreground">
                <Sparkles className="w-3.5 h-3.5 text-primary" /> Delivery in minutes
              </span>
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/70 bg-background/50 backdrop-blur-sm text-[11px] font-medium text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-success" /> 47K+ active users
              </span>
            </div>
          </div>

          {/* Mockup */}
          <div className="lg:col-span-5 hero-stagger-3 animate-hero-in">
            <div className="relative">
              {/* Phantom stacked card behind for depth */}
              <div className="absolute inset-0 rounded-[28px] border border-border/40 bg-card/40 backdrop-blur-sm translate-x-3 translate-y-3 -z-10 hidden md:block" aria-hidden />
              <div className="absolute inset-0 rounded-[28px] border border-border/30 bg-card/20 translate-x-6 translate-y-6 -z-20 hidden md:block" aria-hidden />

              <div className="relative rounded-[28px] border border-border bg-gradient-to-br from-card via-card to-card/70 backdrop-blur-xl shadow-[0_40px_100px_-24px_hsl(var(--primary)/0.35),0_12px_36px_-10px_hsl(var(--foreground)/0.2)] overflow-hidden">
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-destructive/60" />
                    <span className="w-2 h-2 rounded-full bg-accent/60" />
                    <span className="w-2 h-2 rounded-full bg-success/60" />
                  </div>
                  <span className="text-[9px] uppercase tracking-[0.2em] font-bold text-muted-foreground/70">Live preview</span>
                </div>

                <div className="px-5 pb-5">
                  <div className="relative rounded-2xl p-5 bg-gradient-to-br from-foreground to-foreground/85 text-background overflow-hidden">
                    <div className="absolute top-2 right-3 text-[8.5px] uppercase tracking-[0.2em] font-bold text-background/50">Demo</div>
                    <div className="absolute -bottom-12 -right-8 w-40 h-40 rounded-full bg-primary/30 blur-2xl" />

                    <div className="relative flex items-center justify-between mb-5">
                      <div>
                        <p className="text-[9.5px] uppercase tracking-[0.18em] font-bold text-background/60">Sample wallet</p>
                        <p className="text-3xl font-display font-extrabold tabular mt-1">GHS 248<span className="text-background/60">.50</span></p>
                      </div>
                      <div className="w-10 h-10 rounded-xl bg-primary/25 ring-1 ring-primary/30 flex items-center justify-center">
                        <Wallet className="w-4 h-4 text-primary" />
                      </div>
                    </div>

                    <div className="relative flex items-center gap-1.5 text-[10px]">
                      <CheckCircle2 className="w-3 h-3 text-primary" />
                      <span className="text-background/70">Funded via Paystack · Mobile Money</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 mt-4">
                    {[
                      { icon: Smartphone, label: 'Data', live: true },
                      { icon: Sparkles, label: 'Airtime' },
                      { icon: Receipt, label: 'Bills' },
                      { icon: Tv, label: 'Subs' },
                    ].map((s) => (
                      <div key={s.label} className="relative flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-border/60 bg-background/50">
                        <s.icon className="w-4 h-4 text-foreground/80" />
                        <span className="text-[10px] font-medium">{s.label}</span>
                        {s.live && <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-success animate-pulse" />}
                      </div>
                    ))}
                  </div>

                  <div className="mt-4">
                    <p className="text-[9.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground/70 mb-2 px-1">Sample orders</p>
                    <div className="space-y-1.5">
                      {[
                        { net: 'MTN', size: '5GB · 90 days', amt: 'GHS 24.00', dot: 'bg-mtn' },
                        { net: 'Telecel', size: '2GB · No expiry', amt: 'GHS 12.50', dot: 'bg-telecel' },
                        { net: 'AirtelTigo', size: '10GB · 60 days', amt: 'GHS 38.00', dot: 'bg-airteltigo' },
                      ].map((o) => (
                        <div key={o.net} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/40 border border-border/40">
                          <div className="flex items-center gap-2.5">
                            <span className={`w-2 h-2 rounded-full ${o.dot}`} />
                            <div>
                              <p className="text-[11.5px] font-semibold leading-tight">{o.net}</p>
                              <p className="text-[9.5px] text-muted-foreground">{o.size}</p>
                            </div>
                          </div>
                          <span className="text-[11.5px] font-bold tabular">{o.amt}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="border-t border-border/50 px-5 py-2.5 flex items-center justify-between bg-muted/30">
                  <span className="text-[9.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground/70">Showcase · Not your balance</span>
                  <Send className="w-3 h-3 text-muted-foreground/60" />
                </div>
              </div>

              <div className="hidden md:flex absolute -top-3 -left-3 items-center gap-2 px-3.5 py-1.5 rounded-full bg-card/80 backdrop-blur-xl border border-primary/25 shadow-[0_12px_28px_-8px_hsl(var(--primary)/0.4)]">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inset-0 rounded-full bg-success animate-ping opacity-60" />
                  <span className="relative w-1.5 h-1.5 rounded-full bg-success" />
                </span>
                <span className="text-[10.5px] font-semibold">Order tracked live</span>
              </div>
              <div className="hidden md:flex absolute -bottom-3 -right-3 items-center gap-2 px-3.5 py-1.5 rounded-full bg-card/80 backdrop-blur-xl border border-accent/30 shadow-[0_12px_28px_-8px_hsl(var(--accent)/0.4)]">
                <Sparkles className="w-3 h-3 text-accent" />
                <span className="text-[10.5px] font-semibold">Up to 22% cheaper</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
