import { Link } from 'react-router-dom';
import {
  Wifi, PhoneCall, ReceiptText, Gift, Rocket,
  PlayCircle, Boxes, Layers3, LucideIcon,
} from 'lucide-react';

type Service = {
  to?: string;
  icon: LucideIcon;
  label: string;
  desc: string;
  status: 'live' | 'soon';
  tone: 'primary' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet' | 'fuchsia' | 'slate';
};

const SERVICES: Service[] = [
  { to: '/dashboard/buy', icon: Wifi, label: 'Data Bundles', desc: 'MTN, Telecel, AirtelTigo', status: 'live', tone: 'primary' },
  { icon: PhoneCall, label: 'Airtime', desc: 'Top up any number', status: 'soon', tone: 'emerald' },
  { icon: ReceiptText, label: 'Bills', desc: 'Electricity, water & TV', status: 'soon', tone: 'amber' },
  { icon: Gift, label: 'Gift Cards', desc: 'Global brands', status: 'soon', tone: 'rose' },
  { icon: Rocket, label: 'Social Boosting', desc: 'Followers & engagement', status: 'soon', tone: 'sky' },
  { icon: PlayCircle, label: 'Subscriptions', desc: 'Streaming & SaaS', status: 'soon', tone: 'violet' },
  { icon: Boxes, label: 'Digital Products', desc: 'Vouchers & codes', status: 'soon', tone: 'fuchsia' },
  { icon: Layers3, label: 'More Services', desc: 'Coming soon', status: 'soon', tone: 'slate' },
];

const toneStyles: Record<Service['tone'], string> = {
  primary: 'bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-1 ring-primary/20',
  emerald: 'bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 text-emerald-500 ring-1 ring-emerald-500/20',
  amber: 'bg-gradient-to-br from-amber-500/20 to-amber-500/5 text-amber-500 ring-1 ring-amber-500/20',
  rose: 'bg-gradient-to-br from-rose-500/20 to-rose-500/5 text-rose-500 ring-1 ring-rose-500/20',
  sky: 'bg-gradient-to-br from-sky-500/20 to-sky-500/5 text-sky-500 ring-1 ring-sky-500/20',
  violet: 'bg-gradient-to-br from-violet-500/20 to-violet-500/5 text-violet-500 ring-1 ring-violet-500/20',
  fuchsia: 'bg-gradient-to-br from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-500 ring-1 ring-fuchsia-500/20',
  slate: 'bg-muted text-muted-foreground ring-1 ring-border/50',
};

const ServiceTile = ({ service }: { service: Service }) => {
  const isLive = service.status === 'live';
  const Icon = service.icon;

  const inner = (
    <div className="relative h-full p-3.5 sm:p-4 rounded-2xl border border-border/70 bg-card hover:border-primary/40 hover:shadow-sm transition-all duration-150 active:scale-[0.98]">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${toneStyles[service.tone]}`}>
          <Icon className="w-5 h-5" strokeWidth={2} />
        </div>
        {isLive ? (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        ) : (
          <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">Soon</span>
        )}
      </div>
      <div className="text-[13px] sm:text-sm font-bold leading-tight mb-0.5">{service.label}</div>
      <div className="text-[10.5px] sm:text-[11px] text-muted-foreground leading-tight line-clamp-2">{service.desc}</div>
    </div>
  );

  if (isLive && service.to) {
    return <Link to={service.to} className="block h-full">{inner}</Link>;
  }
  return <div className="h-full cursor-not-allowed opacity-90">{inner}</div>;
};

const ServiceHubGrid = () => (
  <section className="rounded-2xl border border-border/70 bg-card/40 p-4 sm:p-5">
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-sm sm:text-base font-display font-bold tracking-tight">Services</h2>
        <p className="text-[11px] text-muted-foreground mt-0.5">Your everyday digital plug</p>
      </div>
      <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/70">Hub</span>
    </div>
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
      {SERVICES.map((s) => <ServiceTile key={s.label} service={s} />)}
    </div>
  </section>
);

export default ServiceHubGrid;
