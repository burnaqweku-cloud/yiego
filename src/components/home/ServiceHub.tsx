import { Link } from 'react-router-dom';
import { Smartphone, Receipt, Sparkles, Tv, ShoppingBag, ArrowRight } from 'lucide-react';

// NOTE: Gift Cards intentionally excluded from public hub (deferred).
const services = [
  { to: '/buy-data', icon: Smartphone, label: 'Data Bundles', desc: 'MTN · Telecel · AirtelTigo', live: true, accent: 'from-primary/25 to-primary/5' },
  { to: '/dashboard', icon: Sparkles, label: 'Airtime', desc: 'Top up any line in moments', accent: 'from-accent/25 to-accent/5' },
  { to: '/dashboard', icon: Receipt, label: 'Bill Payments', desc: 'ECG, water, TV & more', accent: 'from-info/25 to-info/5' },
  { to: '/dashboard', icon: Tv, label: 'Subscriptions', desc: 'Netflix, Spotify & more', accent: 'from-primary/15 to-info/10' },
  { to: '/dashboard', icon: ShoppingBag, label: 'Digital Products', desc: 'Software keys & vouchers', accent: 'from-info/15 to-primary/5' },
];

const ServiceHub = () => {
  return (
    <section className="container py-20 md:py-28">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 mb-4">
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-primary" />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">The YieGo hub</span>
          </div>
          <h2 className="text-3xl md:text-[2.6rem] font-display font-extrabold tracking-[-0.03em] leading-[1.05]">
            Every digital service, <br className="hidden md:inline" />{' '}
            <span className="text-gradient">in one familiar wallet.</span>
          </h2>
        </div>
        <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
          Data is just the start. Each new YieGo service plugs into your wallet — no separate accounts, no surprise fees.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* Featured: Data */}
        <Link
          to="/buy-data"
          className="group col-span-2 lg:col-span-2 lg:row-span-2 relative overflow-hidden rounded-3xl border border-border bg-card p-7 transition-all duration-500 hover:border-primary/60 hover:-translate-y-1 hover:shadow-[0_28px_60px_-24px_hsl(var(--primary)/0.45)]"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent opacity-90" />
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary/30 blur-3xl glow-drift" />
          <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-accent/15 blur-3xl glow-drift-slow" />
          <div className="noise-overlay" />
          {/* hover sheen */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

          <div className="relative flex flex-col h-full min-h-[280px]">
            <div className="flex items-center gap-2 mb-auto">
              <span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold px-2.5 py-1 rounded-md bg-primary/15 text-primary border border-primary/25">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-60" />
                  <span className="relative w-1.5 h-1.5 rounded-full bg-primary" />
                </span>
                Live now
              </span>
            </div>
            <div className="mt-6">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground flex items-center justify-center mb-6 shadow-[0_12px_30px_-8px_hsl(var(--primary)/0.55)] ring-1 ring-primary/30 group-hover:scale-105 transition-transform duration-500">
                <Smartphone className="w-7 h-7" />
              </div>
              <h3 className="text-2xl md:text-[2rem] font-display font-extrabold tracking-[-0.025em] leading-[1.05]">
                Data Bundles
              </h3>
              <p className="text-[13.5px] text-muted-foreground mt-3 max-w-sm leading-relaxed">
                The cheapest MTN, Telecel & AirtelTigo bundles in Ghana. Most orders complete in minutes — failed orders are auto-refunded.
              </p>
              <div className="mt-7 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/25 text-sm font-semibold text-primary group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary transition-all duration-300">
                Buy data <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </div>
            </div>
          </div>
        </Link>

        {services.slice(1).map((s) => (
          <Link
            key={s.label}
            to={s.to}
            className="group relative overflow-hidden rounded-3xl border border-border bg-card p-5 transition-all duration-300 hover:border-primary/40 hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_hsl(var(--primary)/0.35)]"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${s.accent} opacity-70`} />
            {/* hover sheen */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="w-11 h-11 rounded-2xl bg-background/80 backdrop-blur-sm border border-border/60 flex items-center justify-center group-hover:border-primary/30 group-hover:bg-primary/5 transition-colors">
                  <s.icon className="w-5 h-5 text-foreground/80 group-hover:text-primary transition-colors" />
                </div>
                <span className="text-[9px] uppercase tracking-widest font-bold px-1.5 py-0.5 rounded bg-muted/80 text-muted-foreground">Soon</span>
              </div>
              <h3 className="font-display font-bold text-base tracking-tight">{s.label}</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{s.desc}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
};

export default ServiceHub;
