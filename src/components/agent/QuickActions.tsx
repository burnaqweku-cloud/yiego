import { useNavigate } from 'react-router-dom';
import { useAgent } from '@/hooks/useAgent';
import { ArrowDownCircle, Share2, Tag, Settings } from 'lucide-react';
import { toast } from 'sonner';

const QuickActions = () => {
  const navigate = useNavigate();
  const { agent, isActiveAgent } = useAgent();

  const handleShareStore = () => {
    if (!agent) return;
    const url = `${window.location.origin}/store/${agent.store_slug}`;
    const text = `Check out my data store: ${agent.store_name}\n${url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    toast.success('Opening WhatsApp...');
  };

  const actions = [
    {
      icon: ArrowDownCircle,
      label: 'Withdraw',
      onClick: () => navigate('/agent/withdrawals'),
      disabled: !isActiveAgent,
    },
    {
      icon: Share2,
      label: 'Share Store',
      onClick: handleShareStore,
      disabled: !isActiveAgent,
    },
    {
      icon: Tag,
      label: 'Pricing',
      onClick: () => navigate('/agent/pricing'),
      disabled: false,
    },
    {
      icon: Settings,
      label: 'Settings',
      onClick: () => navigate('/agent/store-settings'),
      disabled: false,
    },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {actions.map((action) => (
        <button
          key={action.label}
          onClick={action.onClick}
          disabled={action.disabled}
          className="group flex flex-col items-center gap-2 p-3 rounded-2xl surface-premium hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_hsl(var(--primary)/0.3)] transition-all duration-200 active:scale-[0.96] disabled:opacity-40 disabled:pointer-events-none"
        >
          <div className="w-10 h-10 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shadow-[inset_0_1px_0_hsl(0_0%_100%/0.06)] group-hover:bg-primary/15 transition-colors">
            <action.icon className="w-[18px] h-[18px] text-primary" />
          </div>
          <span className="text-[10px] font-semibold text-foreground/80">{action.label}</span>
        </button>
      ))}
    </div>
  );
};

export default QuickActions;
