import { Link } from 'react-router-dom';
import { Smartphone, Receipt, Sparkles, Tv, Send, ShoppingBag, ArrowRight } from 'lucide-react';

// NOTE: Gift Cards intentionally excluded from public hub (deferred).
const services = [
  { to: '/buy-data', icon: Smartphone, label: 'Data Bundles', desc: 'MTN · Telecel · AirtelTigo', live: true, accent: 'from-primary/25 to-primary/5' },
  { to: '/dashboard', icon: Sparkles, label: 'Airtime', desc: 'Top up any line in seconds', accent: 'from-accent/25 to-accent/5' },
  { to: '/dashboard', icon: Receipt, label: 'Bill Payments', desc: 'ECG, water, TV & more', accent: 'from-info/25 to-info/5' },
  { to: '/dashboard', icon: Tv, label: 'Subscriptions', desc: 'Netflix, Spotify & more', accent: 'from-primary/15 to-info/10' },
  { to: '/dashboard', icon: Send, label: 'Social Boosting', desc: 'Followers, views, engagement', accent: 'from-accent/20 to-primary/5' },
  { to: '/dashboard', icon: ShoppingBag, label: 'Digital Products', desc: 'Software keys & vouchers', accent: 'from-info/15 to-primary/5' },
];

const ServiceHub = () => {
  return (
    <section className="container py-20 md:py-28">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10">
        <div className="max-w-xl">
          <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">The YieGo hub</span>
          <h2 className="text-3xl md:text-4xl font-display font-extrabold tracking-tight mt-3 leading-tight">
            Every digital service, <br className="hidden md:inline" /> in one familiar wallet.
          </h2>
        </div>
        <p className="text-sm text-muted-foreground max-w-sm">
          Data is just the start. Each new YieGo service plugs into your wallet — no separate accounts, no surprise fees.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        {/* Featured: Data */}
        <Link
          to="/buy-data"
          className="group col-span-2 lg:col-span-2 lg:row-span-2 relative overflow-hidden rounded-3xl border border-border bg-card p-7 hover:border-primary/50 transition-all duration-300"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-primary/15 via-transparent to-transparent opacity-80" />
          <div className="absolute -bottom-12 -right-12 w-48 h-48 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex flex-col h-full min-h-[260px]">
            <div className="flex items-center gap-2 mb-auto">
              <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded-md bg-primary/15 text-primary">Live now</span>
            </div>
            <div className="mt-6">
              <div className="w-14 h-14 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mb-5 shadow-lg shadow-primary/25">
                <Smartphone className="w-7 h-7" />
              </div>
              <h3 className="text-2xl md:text-3xl font-display font-bold tracking-tight">Data Bundles</h3>
              <p className="text-sm text-muted-foreground mt-2 max-w-sm">
                The cheapest MTN, Telecel & AirtelTigo bundles in Ghana. Delivered in seconds, refunded automatically if anything fails.
              </p>
              <div className="mt-6 inline-flex items-center gap-1.5 text-sm font-semibold text-primary group-hover:gap-2.5 transition-all">
                Buy data <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>
        </Link>

        {services.slice(1).map((s) => (
          <Link
            key={s.label}
            to={s.to}
            className="group relative overflow-hidden rounded-3xl border border-border bg-card p-5 hover:border-primary/40 transition-all duration-300 hover:-translate-y-0.5"
          >
            <div className={`absolute inset-0 bg-gradient-to-br ${s.accent} opacity-60`} />
            <div className="relative">
              <div className="flex items-start justify-between mb-4">
                <div className="w-11 h-11 rounded-2xl bg-background/80 backdrop-blur-sm border border-border/60 flex items-center justify-center">
                  <s.icon className="w-5 h-5 text-foreground/80" />
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
