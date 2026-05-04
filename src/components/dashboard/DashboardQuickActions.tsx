import { Link } from 'react-router-dom';
import { ClipboardList, BarChart3, MessageSquare, Search } from 'lucide-react';

const actions = [
  { to: '/dashboard/orders', icon: ClipboardList, label: 'Orders', color: 'bg-info/10 text-info border-info/15' },
  { to: '/dashboard/wallet', icon: BarChart3, label: 'Transactions', color: 'bg-success/10 text-success border-success/15' },
  { to: '/support', icon: MessageSquare, label: 'Support', color: 'bg-primary/10 text-primary border-primary/15' },
  { to: '/track-order', icon: Search, label: 'Track', color: 'bg-secondary text-foreground border-border/60' },
];

const DashboardQuickActions = () => (
  <div className="grid grid-cols-4 gap-2.5">
    {actions.map((action, i) => (
      <Link key={action.label} to={action.to} className={`dash-section dash-stagger-${i + 1}`}>
        <div className="flex flex-col items-center gap-2 p-3 rounded-xl surface-premium interactive-card cursor-pointer tap-target">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${action.color}`}>
            <action.icon className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-semibold text-center leading-tight tracking-tight">{action.label}</span>
        </div>
      </Link>
    ))}
  </div>
);

export default DashboardQuickActions;
