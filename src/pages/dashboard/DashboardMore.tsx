import { Link, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import SEOHead from '@/components/seo/SEOHead';
import { useAuth } from '@/hooks/useAuth';
import { useAgent } from '@/hooks/useAgent';
import {
  ClipboardList, Receipt, Bell, Search, User, Settings, Shield, LogOut,
  ChevronRight, Smartphone, Package, LucideIcon, ArrowRight, BadgeCheck,
  HelpCircle, LifeBuoy, Activity, Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { getDisplayName, getUsernameDisplay, getInitials } from '@/lib/user-display';

type Item = {
  to?: string;
  onClick?: () => void;
  icon: LucideIcon;
  label: string;
  desc: string;
  tone?: 'primary' | 'emerald' | 'amber' | 'rose' | 'sky' | 'violet';
};

const toneTile: Record<NonNullable<Item['tone']>, string> = {
  primary: 'bg-gradient-to-br from-primary/20 to-primary/5 text-primary ring-primary/25',
  emerald: 'bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 text-emerald-500 ring-emerald-500/25',
  amber: 'bg-gradient-to-br from-amber-500/20 to-amber-500/5 text-amber-500 ring-amber-500/25',
  rose: 'bg-gradient-to-br from-rose-500/20 to-rose-500/5 text-rose-500 ring-rose-500/25',
  sky: 'bg-gradient-to-br from-sky-500/20 to-sky-500/5 text-sky-500 ring-sky-500/25',
  violet: 'bg-gradient-to-br from-violet-500/20 to-violet-500/5 text-violet-500 ring-violet-500/25',
};

const DashboardMore = () => {
  const { profile, user, isAdmin, isStaff, signOut } = useAuth();
  const { isActiveAgent } = useAgent();
  const navigate = useNavigate();

  const initials = getInitials(profile, user);
  const displayName = getDisplayName(profile, user);
  const usernameDisplay = getUsernameDisplay(profile, user);
  const avatarUrl = (profile as any)?.avatar_url;
  const isPriv = isAdmin || isStaff;

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out');
    navigate('/');
  };

  const activity: Item[] = [
    { to: '/dashboard/orders', icon: ClipboardList, label: 'My orders', desc: 'Track every purchase', tone: 'primary' },
    { to: '/dashboard/transactions', icon: Receipt, label: 'Transactions', desc: 'Wallet movements & history', tone: 'emerald' },
    { to: '/dashboard/bulk-orders', icon: Package, label: 'Bulk orders', desc: 'Bulk delivery history', tone: 'sky' },
    { to: '/track-order', icon: Search, label: 'Track an order', desc: 'Look up any order ID', tone: 'violet' },
  ];

  const tools: Item[] = [
    { to: '/dashboard/bulk-purchase', icon: Smartphone, label: 'Bulk purchase', desc: 'Send data to many numbers at once', tone: 'primary' },
    { to: '/dashboard/notifications', icon: Bell, label: 'Notifications', desc: 'Alerts, updates & announcements', tone: 'amber' },
  ];

  const help: Item[] = [
    { to: '/support', icon: LifeBuoy, label: 'Support center', desc: 'Live chat, email & help', tone: 'primary' },
    { to: '/faq', icon: HelpCircle, label: 'FAQ', desc: 'Quick answers to common questions', tone: 'sky' },
  ];

  const account: Item[] = [
    { to: '/dashboard/profile', icon: User, label: 'Profile', desc: 'Personal details & avatar', tone: 'primary' },
    { to: '/dashboard/settings', icon: Settings, label: 'Settings', desc: 'Password, theme, notifications', tone: 'emerald' },
    ...(isPriv ? [
      { to: '/admin', icon: Shield as LucideIcon, label: 'Admin Panel', desc: 'Internal tools', tone: 'rose' as const },
    ] : []),
  ];

  return (
    <DashboardLayout>
      <SEOHead title="More | YieGo" description="Tools, help and account shortcuts." path="/dashboard/more" noIndex />

      <div className="px-4 md:px-6 lg:px-8 pt-4 pb-24 md:pb-8 max-w-3xl mx-auto space-y-5">
        {/* ── Header ── */}
        <header>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="h-px w-5 bg-gradient-to-r from-transparent to-primary" />
            <span className="text-[10.5px] font-bold uppercase tracking-[0.2em] text-primary">Hub</span>
          </div>
          <h1 className="text-2xl md:text-[1.85rem] font-display font-extrabold tracking-[-0.025em] leading-[1.05]">
            More
          </h1>
          <p className="text-[12.5px] text-muted-foreground mt-1">Everything else, in one tidy place.</p>
        </header>

        {/* ── Profile snippet ── */}
        <Link
          to="/dashboard/profile"
          className="group relative block rounded-3xl glass-card overflow-hidden p-4 sm:p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_18px_40px_-18px_hsl(var(--primary)/0.3)]"
        >
          <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="absolute -top-16 -right-12 w-44 h-44 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

          <div className="relative flex items-center gap-3.5">
            <div className="relative w-14 h-14 shrink-0">
              <span className="absolute inset-0 rounded-full bg-gradient-to-br from-primary to-[hsl(var(--brand-glow))] p-[1.5px] shadow-[0_8px_20px_-6px_hsl(var(--primary)/0.5)]">
                <span className="block w-full h-full rounded-full overflow-hidden bg-card">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-[hsl(var(--brand-glow))] text-primary-foreground font-display font-extrabold text-base">
                      {initials}
                    </span>
                  )}
                </span>
              </span>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-card" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <p className="text-[14px] font-bold tracking-tight truncate">
                  {displayName === 'there' ? 'YieGo user' : displayName}
                </p>
                {isActiveAgent && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8.5px] font-bold uppercase tracking-wider bg-primary/15 text-primary border border-primary/25 shrink-0">
                    <BadgeCheck className="w-2.5 h-2.5" /> Agent
                  </span>
                )}
              </div>
              <p className="text-[11.5px] text-muted-foreground truncate">
                {usernameDisplay ? `@${usernameDisplay}` : (user?.email?.split('@')[0] || 'set username')}
              </p>
              <p className="text-[10.5px] text-muted-foreground/70 truncate mt-0.5">{user?.email}</p>
            </div>
            <span className="inline-flex items-center gap-1 text-[11px] text-primary font-semibold shrink-0 group-hover:gap-1.5 transition-all">
              View profile
              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </div>
        </Link>

        {/* ── Sections ── */}
        <Section icon={Activity} title="Activity & history" caption="Everything you've done">
          <Grid items={activity} />
        </Section>

        <Section icon={Wrench} title="Tools" caption="Power-user features">
          <Grid items={tools} />
        </Section>

        <Section icon={LifeBuoy} title="Help & resources" caption="Get answers, get going">
          <Grid items={help} />
        </Section>

        <Section icon={User} title="Account" caption="Personal & access">
          <Grid items={account} />
        </Section>

        {/* ── Danger zone — sign out ── */}
        <button
          onClick={handleSignOut}
          className="group relative w-full overflow-hidden rounded-2xl border border-destructive/25 bg-destructive/[0.03] hover:bg-destructive/[0.06] hover:border-destructive/40 transition-all duration-300 hover:-translate-y-0.5"
        >
          <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-destructive/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <div className="flex items-center gap-3 p-4 text-left">
            <div className="w-10 h-10 rounded-xl bg-destructive/10 ring-1 ring-destructive/25 text-destructive flex items-center justify-center shrink-0 shadow-[0_4px_12px_-4px_hsl(var(--destructive)/0.3)]">
              <LogOut className="w-4 h-4" strokeWidth={2} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-bold leading-tight tracking-tight text-destructive">Sign out</p>
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">End this session on this device</p>
            </div>
            <ChevronRight className="w-3.5 h-3.5 text-destructive/50 group-hover:translate-x-0.5 transition-all shrink-0" />
          </div>
        </button>

        <p className="text-center text-[10.5px] text-muted-foreground/70 pt-1">
          YieGo v2.0 · Built for Ghana 🇬🇭
        </p>

        <div aria-hidden className="h-2" />
      </div>
    </DashboardLayout>
  );
};

const Section = ({
  icon: Icon,
  title,
  caption,
  children,
}: {
  icon: typeof Activity;
  title: string;
  caption: string;
  children: React.ReactNode;
}) => (
  <section className="space-y-3">
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/20 text-primary flex items-center justify-center shrink-0 shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.3)]">
        <Icon className="w-4 h-4" strokeWidth={2} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="h-px w-4 bg-gradient-to-r from-transparent to-primary" />
          <h2 className="text-[12.5px] font-bold uppercase tracking-[0.18em] text-foreground/85">{title}</h2>
        </div>
        <p className="text-[11px] text-muted-foreground leading-tight">{caption}</p>
      </div>
    </div>
    {children}
  </section>
);

const Grid = ({ items }: { items: Item[] }) => (
  <div className="grid sm:grid-cols-2 gap-2.5">
    {items.map((item) => <Row key={item.label} item={item} />)}
  </div>
);

const Row = ({ item }: { item: Item }) => {
  const Icon = item.icon;
  const tone = toneTile[item.tone || 'primary'];
  const inner = (
    <div className="group relative h-full overflow-hidden rounded-2xl glass-card transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/35 hover:shadow-[0_18px_40px_-18px_hsl(var(--primary)/0.3)]">
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="flex items-center gap-3 p-3.5">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-1 ${tone} shadow-[inset_0_1px_0_0_hsl(0_0%_100%/0.25)] group-hover:scale-105 transition-transform`}>
          <Icon className="w-[18px] h-[18px]" strokeWidth={1.9} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold leading-tight tracking-tight">{item.label}</p>
          <p className="text-[10.5px] text-muted-foreground leading-tight mt-0.5 truncate">{item.desc}</p>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
      </div>
    </div>
  );
  if (item.to) return <Link to={item.to} className="block h-full">{inner}</Link>;
  return <button onClick={item.onClick} className="block w-full text-left h-full">{inner}</button>;
};

export default DashboardMore;
