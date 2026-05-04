import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ShoppingCart, Wallet, ArrowDownCircle, Settings,
  Tag, ArrowLeft, ExternalLink, Receipt, Share2, HelpCircle, LogOut, X, Users, Megaphone, Lock, Package, CreditCard
} from 'lucide-react';
import { useAgent } from '@/hooks/useAgent';
import { useSubscription } from '@/hooks/useSubscription';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getWhatsAppSupportLink } from '@/lib/whatsapp-support';

interface AgentSidebarProps {
  open: boolean;
  onClose: () => void;
}

const AgentSidebar = ({ open, onClose }: AgentSidebarProps) => {
  const location = useLocation();
  const { agent, isActiveAgent } = useAgent();
  const { subscriptionState } = useSubscription();

  const isSubActive = subscriptionState === 'active';

  // All items always visible, but some are locked
  const mainItems = [
    { to: '/agent/dashboard', icon: LayoutDashboard, label: 'Dashboard', exact: true, locked: false },
    { to: '/agent/orders', icon: ShoppingCart, label: 'Orders', locked: !isSubActive },
    { to: '/agent/earnings', icon: Wallet, label: 'Earnings', locked: !isSubActive },
    { to: '/agent/withdrawals', icon: ArrowDownCircle, label: 'Withdrawals', locked: !isSubActive },
    { to: '/agent/transactions', icon: Receipt, label: 'Transactions', locked: !isSubActive },
    { to: '/agent/customers', icon: Users, label: 'Customers', locked: !isSubActive },
    { to: '/agent/bulk-purchase', icon: Package, label: 'Bulk Orders', locked: !isSubActive },
  ];

  const storeItems = [
    { to: '/agent/store-settings', icon: Settings, label: 'Store Settings', locked: false },
    { to: '/agent/pricing', icon: Tag, label: 'Pricing', locked: !isSubActive },
    { to: '/agent/marketing', icon: Megaphone, label: 'Marketing Tools', locked: !isSubActive },
    { to: '/agent/subscription', icon: CreditCard, label: 'Subscription', locked: false },
  ];

  const navSections = [
    { label: 'Main', items: mainItems },
    { label: 'Store', items: storeItems },
  ];

  const isActive = (path: string, exact?: boolean) =>
    exact ? location.pathname === path : location.pathname.startsWith(path);

  const handleShareStore = () => {
    if (!agent) return;
    const url = `${window.location.origin}/store/${agent.store_slug}`;
    const text = `Check out my store: ${agent.store_name} - ${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/';
  };

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 bg-foreground/40 z-40 lg:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col transition-transform duration-300 ease-out lg:relative lg:translate-x-0 ${
        open ? 'translate-x-0' : '-translate-x-full'
      }`}>
        {/* Sidebar Header */}
        <div className="h-16 px-4 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              {agent?.store_logo_url ? (
                <img src={agent.store_logo_url} alt="" className="w-9 h-9 rounded-xl object-cover" />
              ) : (
                <span className="text-sm font-bold text-primary">
                  {agent?.store_name?.charAt(0) || 'A'}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{agent?.store_name || 'Agent'}</p>
              <span className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                isSubActive
                  ? 'bg-success/10 text-success'
                  : 'bg-primary/10 text-primary'
              }`}>
                {isSubActive ? 'Active' : 'Pending'}
              </span>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden p-1.5 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          <nav className="p-3 space-y-4 pt-4">
            {navSections.map((section) => (
              <div key={section.label}>
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-3 mb-1.5">
                  {section.label}
                </p>
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={onClose}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                        isActive(item.to, (item as any).exact)
                          ? 'bg-primary/10 text-primary font-semibold'
                          : item.locked
                            ? 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/40'
                            : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                      }`}
                    >
                      <item.icon className={`w-[18px] h-[18px] ${isActive(item.to, (item as any).exact) ? '' : 'opacity-60'}`} />
                      {item.label}
                      {item.locked && <Lock className="w-3 h-3 ml-auto text-muted-foreground/40" />}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          {/* Bottom Actions */}
          <div className="p-3 border-t border-border space-y-0.5 pb-[calc(0.75rem+4.5rem+env(safe-area-inset-bottom))] lg:pb-3">
            {agent && isSubActive && (
              <>
                <Link
                  to={`/store/${agent.store_slug}`}
                  target="_blank"
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-primary hover:bg-primary/5 transition-colors font-medium"
                >
                  <ExternalLink className="w-4 h-4" /> View My Store
                </Link>
                <button
                  onClick={() => { handleShareStore(); onClose(); }}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors w-full"
                >
                  <Share2 className="w-4 h-4" /> Share Store Link
                </button>
              </>
            )}
            <Link
              to="/support"
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <HelpCircle className="w-4 h-4" /> Support
            </Link>
            <Link
              to="/dashboard"
              onClick={onClose}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Dashboard
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-destructive hover:bg-destructive/5 transition-colors w-full"
            >
              <LogOut className="w-4 h-4" /> Logout
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default AgentSidebar;
