import { Link } from 'react-router-dom';
import {
  Wifi, PhoneCall, ReceiptText,
  PlayCircle, Boxes, ArrowRight, LucideIcon,
} from 'lucide-react';

type Service = {
  to?: string;
  icon: LucideIcon;
  label: string;
  desc: string;
  status: 'live' | 'soon';
  tone: 'primary' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet' | 'fuchsia' | 'slate';
};

const FEATURED: Service = {
  to: '/dashboard/buy',
  icon: Wifi,
  label: 'Data Bundles',
  desc: 'MTN · Telecel · AirtelTigo — fast, cheap, delivered in minutes.',
  status: 'live',
  tone: 'primary',
};

const SECONDARY: Service[] = [
  { icon: PhoneCall, label: 'Airtime', desc: 'Top up any number', status: 'soon', tone: 'emerald' },
  { icon: ReceiptText, label: 'Bills', desc: 'ECG, water & TV', status: 'soon', tone: 'amber' },
  { icon: PlayCircle, label: 'Subscriptions', desc: 'Streaming & SaaS', status: 'soon', tone: 'violet' },
  { icon: Boxes, label: 'Digital Products', desc: 'Vouchers & codes', status: 'soon', tone: 'fuchsia' },
];

const toneStyles: Record<Service['tone'], string> = {
  primary: 'bg-gradient-to-br from-primary/25 to-primary/5 text-primary ring-1 ring-primary/25',
  emerald: 'bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 text-emerald-500 ring-1 ring-emerald-500/20',
  amber: 'bg-gradient-to-br from-amber-500/20 to-amber-500/5 text-amber-500 ring-1 ring-amber-500/20',
  rose: 'bg-gradient-to-br from-rose-500/20 to-rose-500/5 text-rose-500 ring-1 ring-rose-500/20',
  sky: 'bg-gradient-to-br from-sky-500/20 to-sky-500/5 text-sky-500 ring-1 ring-sky-500/20',
  violet: 'bg-gradient-to-br from-violet-500/20 to-violet-500/5 text-violet-500 ring-1 ring-violet-500/20',
  fuchsia: 'bg-gradient-to-br from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-500 ring-1 ring-fuchsia-500/20',
  slate: 'bg-muted text-muted-foreground ring-1 ring-border/50',
};

const FeaturedTile = () => {
  const Icon = FEATURED.icon;
  return (
    <Link
      to={FEATURED.to!}
      className="group relative col-span-2 lg:col-span-2 row-span-2 overflow-hidden rounded-2xl glass-card hover:border-primary/50 hover:-translate-y-1 hover:shadow-[0_28px_60px_-22px_hsl(var(--primary)/0.45)] transition-all duration-500 active:scale-[0.99]"
    >
      <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary/30 blur-3xl glow-drift pointer-events-none" />
      <div className="absolute -bottom-12 -left-12 w-44 h-44 rounded-full bg-accent/15 blur-3xl glow-drift-slow pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent pointer-events-none" />
      <div className="noise-overlay" />

      <div className="relative p-5 sm:p-6 flex flex-col h-full min-h-[230px]">
        <div className="flex items-center gap-2 mb-auto">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md bg-primary/15 text-primary border border-primary/25">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inset-0 rounded-full bg-primary animate-ping opacity-60" />
              <span className="relative w-1.5 h-1.5 rounded-full bg-primary" />
            </span>
            Live now
          </span>
        </div>
        <div className="mt-5">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 shadow-[0_10px_24px_-8px_hsl(var(--primary)/0.5)] ${toneStyles.primary}`}>
            <Icon className="w-6 h-6" strokeWidth={1.9} />
          </div>
          <h3 className="font-display font-extrabold text-xl md:text-[1.4rem] tracking-[-0.025em] leading-tight">
            {FEATURED.label}
          </h3>
          <p className="text-[12.5px] text-muted-foreground mt-1.5 leading-relaxed max-w-[18rem]">
            {FEATURED.desc}
          </p>
          <div className="mt-5 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-primary/10 border border-primary/25 text-[12.5px] font-bold text-primary group-hover:bg-primary group-hover:text-primary-foreground group-hover:border-primary group-hover:shadow-[0_8px_20px_-8px_hsl(var(--primary)/0.55)] transition-all duration-300">
            Buy data <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>
      </div>
    </Link>
  );
};

const SecondaryTile = ({ service }: { service: Service }) => {
  const Icon = service.icon;
  return (
    <div className="group relative h-full p-3.5 rounded-2xl glass-card transition-all duration-500 hover:border-primary/25 hover:-translate-y-0.5 cursor-not-allowed overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${toneStyles[service.tone]} shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.25)] group-hover:scale-105 transition-transform duration-300`}>
          <Icon className="w-[18px] h-[18px]" strokeWidth={1.9} />
        </div>
        <span className="inline-flex items-center gap-1 text-[8.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80 px-1.5 py-0.5 rounded-md bg-muted/60 border border-border/40">
          <span className="w-1 h-1 rounded-full bg-muted-foreground/40" /> Soon
        </span>
      </div>
      <div className="text-[12.5px] font-bold leading-tight tracking-tight">{service.label}</div>
      <div className="text-[10.5px] text-muted-foreground leading-tight line-clamp-1 mt-0.5">{service.desc}</div>
    </div>
  );
};

const ServiceHubGrid = () => (
  <section className="rounded-3xl glass-card p-4 sm:p-5">
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2">
        <span className="h-px w-6 bg-gradient-to-r from-transparent to-primary" />
        <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary">Services hub</h2>
      </div>
      <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/70">Your everyday plug</span>
    </div>

    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3">
      <FeaturedTile />
      {SECONDARY.map((s) => <SecondaryTile key={s.label} service={s} />)}
    </div>
  </section>
);

export default ServiceHubGrid;
