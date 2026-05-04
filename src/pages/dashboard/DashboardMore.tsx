import { Link, useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/dashboard/DashboardLayout';
import SEOHead from '@/components/seo/SEOHead';
import { useAuth } from '@/hooks/useAuth';
import {
  ClipboardList, Receipt, Gift, Sparkles, Bell, Search,
  User, Settings, Shield, MessageCircle, LogOut, ChevronRight,
  Smartphone, Package, LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';

type Item = {
  to?: string;
  onClick?: () => void;
  icon: LucideIcon;
  label: string;
  desc?: string;
  tone?: string;
  danger?: boolean;
  external?: boolean;
};

type Group = { title: string; items: Item[] };

const DashboardMore = () => {
  const { profile, user, isAdmin, isStaff, signOut } = useAuth();
  const navigate = useNavigate();

  const initials = (profile?.full_name?.[0] || user?.email?.[0] || 'U').toUpperCase();
  const avatarUrl = (profile as any)?.avatar_url;

  const handleSignOut = async () => {
    await signOut();
    toast.success('Signed out');
    navigate('/');
  };

  const groups: Group[] = [
    {
      title: 'Activity',
      items: [
        { to: '/dashboard/orders', icon: ClipboardList, label: 'My Orders', desc: 'Track every purchase' },
        { to: '/dashboard/transactions', icon: Receipt, label: 'Transactions', desc: 'Wallet movements & history' },
        { to: '/dashboard/bulk-orders', icon: Package, label: 'Bulk Orders', desc: 'Bulk delivery history' },
        { to: '/track-order', icon: Search, label: 'Track Order', desc: 'Look up any order' },
      ],
    },
    {
      title: 'Rewards',
      items: [
        { to: '/dashboard/rewards', icon: Sparkles, label: 'Rewards', desc: 'Loyalty points & perks', tone: 'amber' },
        { to: '/dashboard/referral', icon: Gift, label: 'Refer & Earn', desc: 'Earn up to 25GB free data', tone: 'rose' },
      ],
    },
    {
      title: 'Tools',
      items: [
        { to: '/dashboard/bulk-purchase', icon: Smartphone, label: 'Bulk Purchase', desc: 'Send data to many numbers at once' },
        { to: '/dashboard/connect-telegram', icon: MessageCircle, label: 'Connect Telegram', desc: 'Use YieGo on Telegram' },
        { to: '/dashboard/notifications', icon: Bell, label: 'Notifications', desc: 'In-app alerts & updates' },
      ],
    },
    {
      title: 'Account',
      items: [
        { to: '/dashboard/profile', icon: User, label: 'Profile', desc: 'Personal details & avatar' },
        { to: '/dashboard/settings', icon: Settings, label: 'Settings', desc: 'Password, display, security' },
        ...((isAdmin || isStaff)
          ? [{ to: '/admin', icon: Shield as LucideIcon, label: 'Admin Panel', desc: 'Internal tools', tone: 'primary' }]
          : []),
        { onClick: handleSignOut, icon: LogOut, label: 'Sign Out', desc: 'End this session', danger: true },
      ],
    },
  ];

  const Row = ({ item }: { item: Item }) => {
    const Icon = item.icon;
    const baseTone = item.danger
      ? 'bg-destructive/10 text-destructive'
      : item.tone === 'amber'
        ? 'bg-amber-500/10 text-amber-500'
        : item.tone === 'rose'
          ? 'bg-rose-500/10 text-rose-500'
          : item.tone === 'primary'
            ? 'bg-primary/15 text-primary'
            : 'bg-primary/10 text-primary';

    const content = (
      <div className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${baseTone}`}>
          <Icon className="w-[18px] h-[18px]" />
        </div>
        <div className="flex-1 min-w-0 text-left">
          <p className={`text-sm font-semibold truncate ${item.danger ? 'text-destructive' : ''}`}>{item.label}</p>
          {item.desc && <p className="text-[11px] text-muted-foreground truncate">{item.desc}</p>}
        </div>
        <ChevronRight className="w-4 h-4 text-muted-foreground/60 shrink-0" />
      </div>
    );

    if (item.to) return <Link to={item.to} className="block">{content}</Link>;
    return <button onClick={item.onClick} className="block w-full">{content}</button>;
  };

  return (
    <DashboardLayout>
      <SEOHead title="More | YieGo" description="Access all YieGo account tools and shortcuts." path="/dashboard/more" noIndex />

      <div className="px-4 md:px-6 lg:px-8 pt-4 pb-6 max-w-3xl mx-auto space-y-5">
        {/* Profile summary */}
        <Link
          to="/dashboard/profile"
          className="block rounded-2xl border border-border/70 bg-card p-4 hover:border-primary/40 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full overflow-hidden ring-2 ring-border shrink-0">
              {avatarUrl ? (
                <img src={avatarUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-full h-full gradient-gold flex items-center justify-center text-primary-foreground font-bold">
                  {initials}
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-base font-display font-bold truncate">{profile?.full_name || 'YieGo user'}</p>
              <p className="text-xs text-muted-foreground truncate">@{profile?.username || (user?.email?.split('@')[0])}</p>
              <p className="text-[11px] text-muted-foreground/80 truncate mt-0.5">{user?.email}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/60 shrink-0" />
          </div>
        </Link>

        {groups.map((g) => (
          <section key={g.title}>
            <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground px-2 mb-2">{g.title}</h2>
            <div className="rounded-2xl border border-border/70 bg-card overflow-hidden divide-y divide-border/60">
              {g.items.map((item) => <Row key={item.label} item={item} />)}
            </div>
          </section>
        ))}

        <p className="text-center text-[10.5px] text-muted-foreground/70 pt-2">YieGo v2.0 · Made in Ghana 🇬🇭</p>

        <div aria-hidden className="h-20 md:h-2" />
      </div>
    </DashboardLayout>
  );
};

export default DashboardMore;
