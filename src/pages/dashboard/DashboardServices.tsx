import { Link } from 'react-router-dom';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import SEOHead from '@/components/seo/SEOHead';
import {
  Smartphone, Phone, Receipt, Gift, TrendingUp,
  Tv, Package, Plane, Banknote, Gamepad2, GraduationCap,
  ShoppingBag, Sparkles, Zap, Globe, LucideIcon,
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
  title: string;
  caption: string;
  services: Service[];
};

const categories: Category[] = [
  {
    title: 'Connectivity',
    caption: 'Stay online without the stress',
    services: [
      { to: '/dashboard/buy', icon: Smartphone, label: 'Data Bundles', desc: 'MTN, Telecel, AirtelTigo', status: 'live', tone: 'primary' },
      { icon: Phone, label: 'Airtime Top-up', desc: 'Instant credit to any number', status: 'soon', tone: 'emerald' },
      { icon: Globe, label: 'International Calls', desc: 'Cheap rates worldwide', status: 'soon', tone: 'sky' },
      { icon: Zap, label: 'Roaming Bundles', desc: 'Travel-ready data packs', status: 'soon', tone: 'indigo' },
    ],
  },
  {
    title: 'Bills & Utilities',
    caption: 'Pay everyday bills in seconds',
    services: [
      { icon: Receipt, label: 'Electricity (ECG)', desc: 'Prepaid token top-ups', status: 'soon', tone: 'amber' },
      { icon: Receipt, label: 'Water (GWCL)', desc: 'Pay your water bill', status: 'soon', tone: 'sky' },
      { icon: Tv, label: 'TV Subscriptions', desc: 'DStv, GOtv, StarTimes', status: 'soon', tone: 'violet' },
      { icon: Banknote, label: 'Government Fees', desc: 'NHIS, DVLA, school fees', status: 'soon', tone: 'teal' },
    ],
  },
  {
    title: 'Lifestyle',
    caption: 'Treat yourself or someone special',
    services: [
      { icon: Gift, label: 'Gift Cards', desc: 'Amazon, iTunes, Steam', status: 'soon', tone: 'rose' },
      { icon: Gamepad2, label: 'Gaming Credits', desc: 'PlayStation, Xbox, Steam', status: 'soon', tone: 'fuchsia' },
      { icon: ShoppingBag, label: 'Shopping Vouchers', desc: 'Local & global brands', status: 'soon', tone: 'amber' },
      { icon: Plane, label: 'Travel & Flights', desc: 'Book trips & hotels', status: 'soon', tone: 'sky' },
    ],
  },
  {
    title: 'Growth',
    caption: 'Level up your hustle',
    services: [
      { icon: TrendingUp, label: 'Social Boosting', desc: 'Followers & engagement', status: 'soon', tone: 'sky' },
      { icon: Sparkles, label: 'AI Subscriptions', desc: 'ChatGPT, Midjourney & more', status: 'soon', tone: 'violet' },
      { icon: GraduationCap, label: 'Online Courses', desc: 'Skill-up vouchers', status: 'soon', tone: 'emerald' },
      { icon: Package, label: 'Digital Products', desc: 'Codes, vouchers & licenses', status: 'soon', tone: 'fuchsia' },
    ],
  },
];

const toneStyles: Record<Tone, string> = {
  primary: 'bg-primary/10 text-primary',
  emerald: 'bg-emerald-500/10 text-emerald-500',
  amber: 'bg-amber-500/10 text-amber-500',
  rose: 'bg-rose-500/10 text-rose-500',
  sky: 'bg-sky-500/10 text-sky-500',
  violet: 'bg-violet-500/10 text-violet-500',
  fuchsia: 'bg-fuchsia-500/10 text-fuchsia-500',
  slate: 'bg-muted text-muted-foreground',
  indigo: 'bg-indigo-500/10 text-indigo-500',
  teal: 'bg-teal-500/10 text-teal-500',
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

const DashboardServices = () => {
  return (
    <DashboardLayout>
      <SEOHead title="Services | YieGo" description="All YieGo services in one place." path="/dashboard/services" noIndex />

      <div className="px-4 md:px-6 lg:px-8 pt-4 pb-6 max-w-6xl mx-auto space-y-6">
        {/* Hero */}
        <header className="relative overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-6">
          <div className="relative">
            <p className="text-[11px] uppercase tracking-[0.18em] text-primary font-bold">YieGo Hub</p>
            <h1 className="text-2xl sm:text-3xl font-display font-black tracking-tight mt-1">All your services</h1>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-md">
              Data, airtime, bills, gift cards and more — every essential digital service in one premium experience.
            </p>
          </div>
          <div aria-hidden className="absolute -right-10 -bottom-10 w-44 h-44 rounded-full bg-primary/10 blur-2xl" />
        </header>

        {categories.map((cat) => (
          <section key={cat.title}>
            <div className="flex items-end justify-between mb-3">
              <div>
                <h2 className="text-base sm:text-lg font-display font-bold tracking-tight">{cat.title}</h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">{cat.caption}</p>
              </div>
              <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/70">
                {cat.services.filter((s) => s.status === 'live').length}/{cat.services.length} live
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
              {cat.services.map((s) => <ServiceTile key={s.label} service={s} />)}
            </div>
          </section>
        ))}

        <div aria-hidden className="h-20 md:h-2" />
      </div>
    </DashboardLayout>
  );
};

export default DashboardServices;
