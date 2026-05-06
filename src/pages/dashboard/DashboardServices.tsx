import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import SEOHead from '@/components/seo/SEOHead';
import {
  Smartphone, Phone, Receipt, Gift,
  Tv, Package, Plane, Banknote, Gamepad2, GraduationCap,
  ShoppingBag, Sparkles, Zap, Globe, Wifi, ReceiptText, Layers,
  ArrowRight, Bell, Activity, LucideIcon,
} from 'lucide-react';

type Tone = 'primary' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet' | 'fuchsia' | 'slate' | 'indigo' | 'teal';

type Service = {
  to?: string;
  icon: LucideIcon;
  label: string;
  desc: string;
  status: 'live' | 'soon';
  tone: Tone;
};

type Category = {
  id: string;
  title: string;
  caption: string;
  icon: LucideIcon;
  services: Service[];
};

const categories: Category[] = [
  {
    id: 'connectivity',
    title: 'Connectivity',
    caption: 'Stay online without the stress',
    icon: Wifi,
    services: [
      { to: '/dashboard/buy', icon: Smartphone, label: 'Data Bundles', desc: 'MTN, Telecel, AirtelTigo', status: 'live', tone: 'primary' },
      { icon: Phone, label: 'Airtime Top-up', desc: 'Instant credit to any number', status: 'soon', tone: 'emerald' },
      { icon: Globe, label: 'International Calls', desc: 'Cheap rates worldwide', status: 'soon', tone: 'sky' },
      { icon: Zap, label: 'Roaming Bundles', desc: 'Travel-ready data packs', status: 'soon', tone: 'indigo' },
    ],
  },
  {
    id: 'bills',
    title: 'Bills & Utilities',
    caption: 'Pay everyday bills in seconds',
    icon: ReceiptText,
    services: [
      { icon: Receipt, label: 'Electricity (ECG)', desc: 'Prepaid token top-ups', status: 'soon', tone: 'amber' },
      { icon: Receipt, label: 'Water (GWCL)', desc: 'Pay your water bill', status: 'soon', tone: 'sky' },
      { icon: Tv, label: 'TV Subscriptions', desc: 'DStv, GOtv, StarTimes', status: 'soon', tone: 'violet' },
      { icon: Banknote, label: 'Government Fees', desc: 'NHIS, DVLA, school fees', status: 'soon', tone: 'teal' },
    ],
  },
  {
    id: 'lifestyle',
    title: 'Lifestyle',
    caption: 'Treat yourself or someone special',
    icon: Sparkles,
    services: [
      { icon: Gift, label: 'Gift Cards', desc: 'Amazon, iTunes, Steam', status: 'soon', tone: 'rose' },
      { icon: Gamepad2, label: 'Gaming Credits', desc: 'PlayStation, Xbox, Steam', status: 'soon', tone: 'fuchsia' },
      { icon: ShoppingBag, label: 'Shopping Vouchers', desc: 'Local & global brands', status: 'soon', tone: 'amber' },
      { icon: Plane, label: 'Travel & Flights', desc: 'Book trips & hotels', status: 'soon', tone: 'sky' },
    ],
  },
  {
    id: 'growth',
    title: 'Growth',
    caption: 'Level up your hustle',
    icon: GraduationCap,
    services: [
      { icon: Sparkles, label: 'AI Subscriptions', desc: 'ChatGPT, Midjourney & more', status: 'soon', tone: 'violet' },
      { icon: GraduationCap, label: 'Online Courses', desc: 'Skill-up vouchers', status: 'soon', tone: 'emerald' },
      { icon: Package, label: 'Digital Products', desc: 'Codes, vouchers & licenses', status: 'soon', tone: 'fuchsia' },
    ],
  },
];

const toneTile: Record<Tone, string> = {
  primary: 'bg-gradient-to-br from-primary/22 to-primary/5 text-primary ring-1 ring-primary/25',
  emerald: 'bg-gradient-to-br from-emerald-500/22 to-emerald-500/5 text-emerald-500 ring-1 ring-emerald-500/25',
  amber: 'bg-gradient-to-br from-amber-500/22 to-amber-500/5 text-amber-500 ring-1 ring-amber-500/25',
  rose: 'bg-gradient-to-br from-rose-500/22 to-rose-500/5 text-rose-500 ring-1 ring-rose-500/25',
  sky: 'bg-gradient-to-br from-sky-500/22 to-sky-500/5 text-sky-500 ring-1 ring-sky-500/25',
  violet: 'bg-gradient-to-br from-violet-500/22 to-violet-500/5 text-violet-500 ring-1 ring-violet-500/25',
  fuchsia: 'bg-gradient-to-br from-fuchsia-500/22 to-fuchsia-500/5 text-fuchsia-500 ring-1 ring-fuchsia-500/25',
  slate: 'bg-muted text-muted-foreground ring-1 ring-border/50',
  indigo: 'bg-gradient-to-br from-indigo-500/22 to-indigo-500/5 text-indigo-500 ring-1 ring-indigo-500/25',
  teal: 'bg-gradient-to-br from-teal-500/22 to-teal-500/5 text-teal-500 ring-1 ring-teal-500/25',
};

const ServiceTile = ({ service }: { service: Service }) => {
  const isLive = service.status === 'live';
  const Icon = service.icon;

  const inner = (
    <div
      className={`group relative h-full p-3.5 rounded-2xl glass-card overflow-hidden transition-all duration-300 ${
        isLive
          ? 'hover:border-primary/45 hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_hsl(var(--primary)/0.4)]'
          : 'hover:border-primary/25 hover:-translate-y-0.5 cursor-not-allowed'
      }`}
    >
      {/* Top sheen on hover */}
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/45 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      {/* Live indicator brand glow blob */}
      {isLive && (
        <span className="absolute -bottom-12 -right-10 w-32 h-32 rounded-full bg-primary/15 blur-3xl pointer-events-none" />
      )}

      <div className="relative">
        <div className="flex items-start justify-between mb-3">
          <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${toneTile[service.tone]} shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.25)] group-hover:scale-105 transition-transform duration-300`}>
            <Icon className="w-[20px] h-[20px]" strokeWidth={1.9} />
          </div>
          {isLive ? (
            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/25">
              <span className="relative flex w-1.5 h-1.5">
                <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-60" />
                <span className="relative w-1.5 h-1.5 rounded-full bg-primary" />
              </span>
              Live
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80 px-1.5 py-0.5 rounded-md bg-muted/60 border border-border/40">
              <span className="w-1 h-1 rounded-full bg-muted-foreground/40" /> Soon
            </span>
          )}
        </div>
        <div className="text-[13px] font-bold leading-tight tracking-tight">{service.label}</div>
        <div className="text-[10.5px] text-muted-foreground leading-snug mt-1 line-clamp-2">{service.desc}</div>

        {/* Hover footer cue */}
        {isLive ? (
          <div className="mt-3 inline-flex items-center gap-1 text-[10.5px] font-bold text-primary opacity-90 group-hover:gap-1.5 transition-all">
            Open <ArrowRight className="w-2.5 h-2.5" />
          </div>
        ) : (
          <div className="mt-3 inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground/70">
            <Bell className="w-2.5 h-2.5" /> We'll notify you
          </div>
        )}
      </div>
    </div>
  );

  if (isLive && service.to) {
    return <Link to={service.to} className="block h-full">{inner}</Link>;
  }
  return <div className="h-full">{inner}</div>;
};

const DashboardServices = () => {
  const allServices = categories.flatMap((c) => c.services);
  const liveCount = allServices.filter((s) => s.status === 'live').length;
  const soonCount = allServices.length - liveCount;

  return (
    <DashboardLayout>
      <SEOHead title="Services | YieGo" description="All YieGo services in one place." path="/dashboard/services" noIndex />

      <div className="px-4 md:px-6 lg:px-8 pt-4 pb-24 md:pb-8 max-w-6xl mx-auto space-y-6">
        {/* ── Compact header ── */}
        <header>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="h-px w-5 bg-gradient-to-r from-transparent to-primary" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-primary">YieGo hub</span>
          </div>
          <h1 className="text-2xl md:text-[1.85rem] font-display font-extrabold tracking-[-0.025em] leading-[1.05]">
            Every service, <span className="text-gradient">one wallet.</span>
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-1.5 max-w-md leading-relaxed">
            Data, airtime, bills, vouchers and more — added to YieGo as each service goes live.
          </p>
        </header>

        {/* ── Status pill row ── */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/70 bg-card/60 backdrop-blur-sm text-[11px] font-medium text-muted-foreground">
            <Layers className="w-3 h-3 text-primary" />
            <span className="tabular font-bold text-foreground">{allServices.length}</span> total
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-primary/30 bg-primary/10 backdrop-blur-sm text-[11px] font-bold text-primary shadow-[0_4px_16px_-8px_hsl(var(--primary)/0.35)]">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-60" />
              <span className="relative w-1.5 h-1.5 rounded-full bg-primary" />
            </span>
            <span className="tabular">{liveCount}</span> live now
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/70 bg-card/60 backdrop-blur-sm text-[11px] font-medium text-muted-foreground">
            <Activity className="w-3 h-3" />
            <span className="tabular font-bold text-foreground">{soonCount}</span> launching soon
          </span>
        </div>

        {/* ── Category sections ── */}
        {categories.map((cat) => {
          const liveInCat = cat.services.filter((s) => s.status === 'live').length;
          const Icon = cat.icon;
          return (
            <section key={cat.id} className="space-y-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 text-primary flex items-center justify-center shrink-0 shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.3)]">
                    <Icon className="w-4 h-4" strokeWidth={2} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-px w-4 bg-gradient-to-r from-transparent to-primary/70" />
                      <h2 className="text-[12.5px] font-bold uppercase tracking-[0.18em] text-foreground/85">{cat.title}</h2>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{cat.caption}</p>
                  </div>
                </div>
                <span className="text-[9.5px] uppercase tracking-[0.16em] font-bold text-muted-foreground/70 tabular shrink-0">
                  {liveInCat}/{cat.services.length} live
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
                {cat.services.map((s) => <ServiceTile key={s.label} service={s} />)}
              </div>
            </section>
          );
        })}

        <div aria-hidden className="h-2" />
      </div>
    </DashboardLayout>
  );
};

export default DashboardServices;
