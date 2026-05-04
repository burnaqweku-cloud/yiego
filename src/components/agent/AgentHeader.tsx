import { Link, useNavigate } from 'react-router-dom';
import { Menu, Bell, ExternalLink, CreditCard, Clock } from 'lucide-react';
import { useAgent } from '@/hooks/useAgent';
import { Button } from '@/components/ui/button';
import { useState } from 'react';
import AgentNotifications from './AgentNotifications';
import { ThemeToggle } from '@/components/layout/ThemeToggle';

interface AgentHeaderProps {
  onMenuClick: () => void;
}

const AgentHeader = ({ onMenuClick }: AgentHeaderProps) => {
  const { agent, isPending, isAwaitingPayment, isActiveAgent } = useAgent();
  const navigate = useNavigate();
  const [showNotifications, setShowNotifications] = useState(false);

  return (
    <>
      {/* Status Banner */}
      {isPending && (
        <div className="bg-primary/5 border-b border-primary/20 px-4 py-2 flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary shrink-0" />
          <span className="text-xs text-primary font-medium">Your application is under review</span>
        </div>
      )}
      {isAwaitingPayment && (
        <div className="bg-info/5 border-b border-info/20 px-4 py-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-info shrink-0" />
            <span className="text-xs text-info font-medium">Approved! Pay activation fee to go live</span>
          </div>
          <Button size="sm" variant="default" onClick={() => navigate('/agent/activate')} className="shrink-0 text-xs h-7">
            Activate
          </Button>
        </div>
      )}

      {/* Main Header */}
      <header className="h-14 border-b border-border bg-card/95 backdrop-blur-md flex items-center px-4 gap-3 shrink-0 sticky top-0 z-30">
        <button onClick={onMenuClick} className="lg:hidden p-1.5 rounded-xl hover:bg-muted transition-colors">
          <Menu className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 lg:hidden">
            {agent?.store_logo_url ? (
              <img src={agent.store_logo_url} alt="" className="w-8 h-8 rounded-xl object-cover" />
            ) : (
              <span className="text-xs font-bold text-primary">{agent?.store_name?.charAt(0) || 'A'}</span>
            )}
          </div>
          <div className="min-w-0 hidden lg:block">
            <h1 className="font-display font-bold text-sm truncate">Agent Portal</h1>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <ThemeToggle size="sm" />
          {agent && isActiveAgent && (
            <Link
              to={`/store/${agent.store_slug}`}
              target="_blank"
              className="hidden sm:flex items-center gap-1.5 text-xs text-primary font-medium hover:underline px-2 py-1.5 rounded-lg hover:bg-primary/5 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" /> View Store
            </Link>
          )}
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="relative p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-destructive rounded-full" />
          </button>
        </div>
      </header>

      {showNotifications && (
        <AgentNotifications onClose={() => setShowNotifications(false)} />
      )}
    </>
  );
};

export default AgentHeader;
