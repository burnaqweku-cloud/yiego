import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import AdminLayout from '../AdminLayout';
import {
  LayoutDashboard, Users, ShoppingCart, Download, Sparkles, Share2,
  CalendarCheck, Gift, LifeBuoy, Send, Tag, Activity, Settings,
  ScrollText, BarChart3,
} from 'lucide-react';

interface TgTab {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
}

const tabs: TgTab[] = [
  { to: '/admin/tg', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/tg/users', label: 'Users', icon: Users },
  { to: '/admin/tg/orders', label: 'Orders', icon: ShoppingCart },
  { to: '/admin/tg/deposits', label: 'Deposits', icon: Download },
  { to: '/admin/tg/points', label: 'Points', icon: Sparkles },
  { to: '/admin/tg/referrals', label: 'Referrals', icon: Share2 },
  { to: '/admin/tg/checkins', label: 'Check-ins', icon: CalendarCheck },
  { to: '/admin/tg/redemptions', label: 'Redemptions', icon: Gift },
  { to: '/admin/tg/support', label: 'Support Tickets', icon: LifeBuoy },
  { to: '/admin/tg/broadcasts', label: 'Broadcasts', icon: Send },
  { to: '/admin/tg/promotions', label: 'Promotions', icon: Tag },
  { to: '/admin/tg/health', label: 'Bot Health', icon: Activity },
  { to: '/admin/tg/configuration', label: 'Configuration', icon: Settings },
  { to: '/admin/tg/audit', label: 'Audit Log', icon: ScrollText },
  { to: '/admin/tg/reports', label: 'Reports', icon: BarChart3 },
];

interface Props {
  title: string;
  description?: string;
  children: ReactNode;
}

const TgAdminLayout = ({ title, description, children }: Props) => {
  const location = useLocation();
  const isActive = (to: string) =>
    to === '/admin/tg'
      ? location.pathname === '/admin/tg'
      : location.pathname === to || location.pathname.startsWith(to + '/');

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-xl md:text-2xl font-display font-bold">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground mt-1">{description}</p>
          )}
        </div>

        {/* Sub-tab strip */}
        <div className="border-b border-border">
          <div className="flex gap-1 overflow-x-auto pb-px scrollbar-thin">
            {tabs.map((t) => {
              const active = isActive(t.to);
              return (
                <Link
                  key={t.to}
                  to={t.to}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors ${
                    active
                      ? 'border-primary text-primary'
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                  }`}
                >
                  <t.icon className="w-3.5 h-3.5" />
                  {t.label}
                </Link>
              );
            })}
          </div>
        </div>

        <div>{children}</div>
      </div>
    </AdminLayout>
  );
};

export default TgAdminLayout;
