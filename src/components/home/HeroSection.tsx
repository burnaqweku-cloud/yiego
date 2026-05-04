import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Wallet, Smartphone, Receipt, Gift, Sparkles, Zap, ShieldCheck } from 'lucide-react';

const HeroSection = () => {
  return (
    <section className="relative overflow-hidden border-b border-border/40">
      {/* Layered backdrop */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-card/60" />
        <div className="absolute top-0 right-0 w-[600px] h-[600px] rounded-full blur-3xl opacity-25 bg-primary" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] rounded-full blur-3xl opacity-15 bg-accent" />
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: 'radial-gradient(hsl(var(--foreground)) 1px, transparent 1px)', backgroundSize: '32px 32px' }}
        />
      </div>

      <div className="container py-12 md:py-20 lg:py-24">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          {/* Left: copy */}
          <div className="lg:col-span-7 hero-stagger-1 animate-hero-in">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-1.5 mb-7">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs font-semibold tracking-wide text-primary">YieGo · Ghana's everyday digital wallet</span>
            </div>

            <h1 className="text-[2.4rem] sm:text-5xl lg:text-[4.2rem] font-display font-extrabold tracking-[-0.035em] leading-[1.02] mb-6">
              Pay for the things <br className="hidden sm:inline" />
              you actually use.{' '}
              <span className="text-gradient">In one tap.</span>
            </h1>

            <p className="text-base md:text-lg text-muted-foreground max-w-xl leading-relaxed mb-8">
              Data, airtime, bills, gift cards, social boosting — fund your YieGo wallet once and order in seconds. Built for how Ghana actually spends online.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link to="/auth?tab=signup" className="sm:w-auto">
                <Button size="lg" className="rounded-full px-7 h-12 font-bold gap-2 w-full sm:w-auto shadow-[0_8px_24px_-8px_hsl(var(--primary)/0.6)]">
                  Open my wallet <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/buy-data" className="sm:w-auto">
                <Button size="lg" variant="outline" className="rounded-full px-7 h-12 font-semibold gap-2 w-full sm:w-auto">
                  <Smartphone className="w-4 h-4" /> Buy data now
                </Button>
              </Link>
            </div>

            {/* Trust strip */}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-8 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-primary" /> Paystack-secured</div>
              <div className="flex items-center gap-1.5"><Zap className="w-3.5 h-3.5 text-primary" /> Instant delivery</div>
              <div className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-success" /> 47K+ Ghanaians using YieGo</div>
            </div>
          </div>

          {/* Right: service hub mock */}
          <div className="lg:col-span-5 hero-stagger-3 animate-hero-in">
            <div className="relative">
              {/* Floating wallet card */}
              <div className="rounded-3xl p-6 border border-border bg-gradient-to-br from-card to-card/60 backdrop-blur-xl shadow-2xl">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/70">Wallet balance</p>
                    <p className="text-3xl font-display font-extrabold tabular mt-1">GHS 248.50</p>
                  </div>
                  <div className="w-11 h-11 rounded-2xl bg-primary/15 flex items-center justify-center">
                    <Wallet className="w-5 h-5 text-primary" />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-2 mb-5">
                  {[
                    { icon: Smartphone, label: 'Data', live: true },
                    { icon: Sparkles, label: 'Airtime' },
                    { icon: Receipt, label: 'Bills' },
                    { icon: Gift, label: 'Gifts' },
                  ].map((s) => (
                    <div key={s.label} className="flex flex-col items-center gap-1.5 p-2.5 rounded-xl border border-border/50 bg-background/40 hover:border-primary/40 transition-colors">
                      <s.icon className="w-4 h-4 text-foreground/80" />
                      <span className="text-[10px] font-medium">{s.label}</span>
                      {s.live && <span className="absolute mt-8 w-1 h-1 rounded-full bg-success" />}
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  {[
                    { net: 'MTN', size: '5GB · 7 days', amt: 'GHS 24.00', dot: 'bg-mtn' },
                    { net: 'Telecel', size: '2GB · 30 days', amt: 'GHS 12.50', dot: 'bg-telecel' },
                    { net: 'AirtelTigo', size: '10GB · NoExp', amt: 'GHS 38.00', dot: 'bg-airteltigo' },
                  ].map((o) => (
                    <div key={o.net} className="flex items-center justify-between p-2.5 rounded-xl bg-muted/30">
                      <div className="flex items-center gap-2.5">
                        <span className={`w-2 h-2 rounded-full ${o.dot}`} />
                        <div>
                          <p className="text-xs font-semibold">{o.net}</p>
                          <p className="text-[10px] text-muted-foreground">{o.size}</p>
                        </div>
                      </div>
                      <span className="text-xs font-bold tabular">{o.amt}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Floating badges */}
              <div className="hidden md:flex absolute -top-4 -left-4 items-center gap-2 px-3 py-2 rounded-full bg-card border border-border shadow-lg">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                <span className="text-[11px] font-semibold">Order delivered · 4s</span>
              </div>
              <div className="hidden md:flex absolute -bottom-4 -right-4 items-center gap-2 px-3 py-2 rounded-full bg-card border border-border shadow-lg">
                <Zap className="w-3 h-3 text-accent" />
                <span className="text-[11px] font-semibold">Cheaper than direct top-up</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
