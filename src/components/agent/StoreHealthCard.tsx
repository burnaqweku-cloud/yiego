import { Card, CardContent } from '@/components/ui/card';
import { useAgent } from '@/hooks/useAgent';
import { Progress } from '@/components/ui/progress';
import { Copy, ExternalLink, Calendar, Users, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface StoreHealthCardProps {
  totalOrders: number;
  totalCustomers: number;
}

const StoreHealthCard = ({ totalOrders, totalCustomers }: StoreHealthCardProps) => {
  const { agent, isActiveAgent, isPending, isAwaitingPayment } = useAgent();

  const storeUrl = agent ? `${window.location.origin}/store/${agent.store_slug}` : '';

  const handleCopyLink = () => {
    navigator.clipboard.writeText(storeUrl);
    toast.success('Store link copied!');
  };

  const status = isActiveAgent ? 'Active' : isPending ? 'Pending' : isAwaitingPayment ? 'Awaiting Payment' : 'Inactive';
  const statusColor = isActiveAgent
    ? 'bg-success/10 text-success'
    : isPending
    ? 'bg-primary/10 text-primary'
    : 'bg-info/10 text-info';

  // Simple performance score based on activity
  const performanceScore = Math.min(100, Math.round((totalOrders * 5) + (totalCustomers * 3)));

  return (
    <Card className="surface-premium border-0">
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold tracking-tight">Store Health</h3>
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ring-1 ${statusColor} ${isActiveAgent ? 'ring-success/20' : isPending ? 'ring-primary/20' : 'ring-info/20'}`}>
            {status}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-muted/30 ring-1 ring-border/60 p-2.5">
            <Calendar className="w-3.5 h-3.5 text-muted-foreground mb-1.5" />
            <p className="text-[10px] text-muted-foreground">Created</p>
            <p className="text-[11px] font-semibold tabular leading-tight mt-0.5">
              {agent?.created_at ? format(new Date(agent.created_at), 'dd MMM yyyy') : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-muted/30 ring-1 ring-border/60 p-2.5">
            <Users className="w-3.5 h-3.5 text-muted-foreground mb-1.5" />
            <p className="text-[10px] text-muted-foreground">Customers</p>
            <p className="text-sm font-bold tabular leading-tight mt-0.5">{totalCustomers}</p>
          </div>
          <div className="rounded-xl bg-muted/30 ring-1 ring-border/60 p-2.5">
            <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground mb-1.5" />
            <p className="text-[10px] text-muted-foreground">Orders</p>
            <p className="text-sm font-bold tabular leading-tight mt-0.5">{totalOrders}</p>
          </div>
        </div>

        {/* Performance Score */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[11px] text-muted-foreground font-medium">Store Performance</p>
            <p className="text-xs font-bold tabular text-primary">{performanceScore}%</p>
          </div>
          <Progress value={performanceScore} className="h-2" />
        </div>

        {/* Store Link */}
        {isActiveAgent && agent && (
          <div className="flex items-center gap-2 bg-muted/40 ring-1 ring-border/60 rounded-xl px-3 py-2">
            <code className="flex-1 text-[11px] truncate text-muted-foreground tabular">
              {storeUrl}
            </code>
            <button onClick={handleCopyLink} className="p-1.5 hover:bg-primary/10 rounded-lg transition-colors shrink-0 active:scale-95">
              <Copy className="w-3.5 h-3.5 text-primary" />
            </button>
            <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-primary/10 rounded-lg transition-colors shrink-0 active:scale-95">
              <ExternalLink className="w-3.5 h-3.5 text-primary" />
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default StoreHealthCard;
