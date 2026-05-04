import { SupportTicket } from '@/hooks/useSupportTickets';
import { Clock, CheckCircle, Info, MessageSquare, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface TicketListProps {
  tickets: SupportTicket[];
  loading: boolean;
  onSelect: (ticket: SupportTicket) => void;
  emptyMessage?: string;
  showRoleBadge?: boolean;
}

const statusConfig: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  open: { label: 'Open', icon: Info, className: 'bg-sky-500/10 text-sky-600' },
  in_progress: { label: 'In Progress', icon: Clock, className: 'bg-amber-500/10 text-amber-600' },
  resolved: { label: 'Resolved', icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-600' },
  closed: { label: 'Closed', icon: CheckCircle, className: 'bg-muted text-muted-foreground' },
};

const TicketList = ({ tickets, loading, onSelect, emptyMessage = 'No tickets yet', showRoleBadge }: TicketListProps) => {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <div className="text-center py-12">
        <MessageSquare className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tickets.map((ticket) => {
        const st = statusConfig[ticket.status] || statusConfig.open;
        const StatusIcon = st.icon;
        return (
          <button
            key={ticket.id}
            onClick={() => onSelect(ticket)}
            className="w-full text-left bg-card rounded-xl border border-border p-4 hover:bg-muted/30 transition-all duration-150 active:scale-[0.99]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <h4 className="text-sm font-semibold truncate">{ticket.subject}</h4>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${st.className}`}>
                    <StatusIcon className="w-3 h-3" />
                    {st.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground capitalize">{ticket.category?.replace(/_/g, ' ')}</span>
                </div>
              </div>
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true })}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
};

export default TicketList;
