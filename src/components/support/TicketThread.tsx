import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { TicketMessage, SupportTicket } from '@/hooks/useSupportTickets';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Send, Clock, CheckCircle, AlertCircle, Loader2, Info, User, ShieldCheck, Store } from 'lucide-react';
import { format } from 'date-fns';

interface SenderProfile {
  id: string;
  full_name?: string;
  username?: string;
  email?: string;
}

interface TicketThreadProps {
  ticket: SupportTicket | null;
  messages: TicketMessage[];
  loading: boolean;
  sending?: boolean;
  senderRole: 'user' | 'agent' | 'admin';
  onSend: (msg: string) => Promise<void>;
  onBack: () => void;
  onStatusChange?: (status: string) => Promise<void>;
  ticketOwnerInfo?: { name: string; email?: string; phone?: string; role: string; storeName?: string; storeStatus?: string };
  senderProfiles?: Record<string, SenderProfile>;
}

const statusConfig: Record<string, { label: string; icon: typeof Clock; className: string }> = {
  open: { label: 'Open', icon: Info, className: 'bg-sky-500/10 text-sky-600' },
  in_progress: { label: 'In Progress', icon: Clock, className: 'bg-amber-500/10 text-amber-600' },
  resolved: { label: 'Resolved', icon: CheckCircle, className: 'bg-emerald-500/10 text-emerald-600' },
  closed: { label: 'Closed', icon: CheckCircle, className: 'bg-muted text-muted-foreground' },
};

const roleBadgeStyle: Record<string, string> = {
  user: 'bg-sky-500/10 text-sky-700 border-sky-200',
  agent: 'bg-violet-500/10 text-violet-700 border-violet-200',
  admin: 'bg-emerald-500/10 text-emerald-700 border-emerald-200',
};

const roleBadgeLabel: Record<string, string> = {
  user: 'User',
  agent: 'Agent',
  admin: 'Admin',
};

const getSenderDisplayName = (msg: TicketMessage, profiles?: Record<string, SenderProfile>, currentUserId?: string): string => {
  if (msg.sender_id === currentUserId) return 'You';
  if (msg.sender_type === 'admin') return 'Support Team';
  if (msg.sender_name) return msg.sender_name;
  const profile = profiles?.[msg.sender_id];
  if (profile) {
    return profile.full_name || profile.username || 'User';
  }
  return msg.sender_type === 'agent' ? 'Agent' : 'User';
};

const TicketThread = ({ ticket, messages, loading, sending = false, senderRole, onSend, onBack, onStatusChange, ticketOwnerInfo, senderProfiles }: TicketThreadProps) => {
  const { user } = useAuth();
  const [input, setInput] = useState('');
  const [localSending, setLocalSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isSending = sending || localSending;

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isSending) return;
    const msg = input;
    setInput('');
    setLocalSending(true);
    await onSend(msg);
    setLocalSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const st = statusConfig[ticket?.status || 'open'] || statusConfig.open;
  const StatusIcon = st.icon;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full max-h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border bg-card shrink-0">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold truncate">{ticket?.subject}</h3>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${st.className}`}>
              <StatusIcon className="w-3 h-3" />
              {st.label}
            </span>
            <span className="text-[10px] text-muted-foreground capitalize">{ticket?.category?.replace(/_/g, ' ')}</span>
          </div>
        </div>
        {onStatusChange && senderRole === 'admin' && (
          <div className="flex gap-1.5">
            {['open', 'in_progress', 'resolved', 'closed'].map(s => {
              const sc = statusConfig[s];
              return (
                <button
                  key={s}
                  onClick={() => onStatusChange(s)}
                  disabled={ticket?.status === s}
                  className={`text-[10px] font-bold px-2.5 py-1 rounded-full transition-all ${ticket?.status === s ? sc.className + ' ring-2 ring-offset-1 ring-current/20' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                >
                  {sc.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Ticket owner info (admin view) */}
      {senderRole === 'admin' && ticketOwnerInfo && (
        <div className="px-4 py-3 bg-muted/30 border-b border-border shrink-0">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              {ticketOwnerInfo.role === 'agent' ? <Store className="w-4 h-4 text-primary" /> : <User className="w-4 h-4 text-primary" />}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{ticketOwnerInfo.name}</span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${roleBadgeStyle[ticketOwnerInfo.role]}`}>
                  {roleBadgeLabel[ticketOwnerInfo.role]}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                {ticketOwnerInfo.email && <span>{ticketOwnerInfo.email}</span>}
                {ticketOwnerInfo.phone && <span>{ticketOwnerInfo.phone}</span>}
                {ticketOwnerInfo.storeName && (
                  <span className="text-primary font-medium">{ticketOwnerInfo.storeName}</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expectation note (non-admin) */}
      {senderRole !== 'admin' && (
        <div className="px-4 py-2.5 bg-sky-50 dark:bg-sky-950/20 border-b border-sky-100 dark:border-sky-900/30 shrink-0">
          <p className="text-[11px] text-sky-700 dark:text-sky-400 flex items-center gap-1.5">
            <Clock className="w-3 h-3 shrink-0" />
            Replies are not instant. Our team will respond as soon as possible — typically within a few hours. You will definitely get a reply.
          </p>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">No messages yet</p>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender_id === user?.id;
            const isAdmin = msg.sender_type === 'admin';
            const displayName = getSenderDisplayName(msg, senderProfiles, user?.id);
            const showRoleBadge = msg.sender_id !== user?.id;

            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}
                style={{ animation: 'msgSlideIn 0.25s ease-out' }}
              >
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  isMe
                    ? 'bg-primary text-primary-foreground rounded-br-md'
                    : isAdmin
                      ? 'bg-card border border-emerald-200 dark:border-emerald-900/40 rounded-bl-md shadow-sm'
                      : 'bg-card border border-border rounded-bl-md'
                }`}>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[11px] font-semibold ${isMe ? 'text-primary-foreground/80' : isAdmin ? 'text-emerald-700 dark:text-emerald-400' : 'text-foreground/70'}`}>
                      {displayName}
                    </span>
                    {showRoleBadge && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${roleBadgeStyle[msg.sender_type] || roleBadgeStyle.user}`}>
                        {roleBadgeLabel[msg.sender_type] || 'User'}
                      </span>
                    )}
                  </div>
                  <p className={`text-sm whitespace-pre-wrap break-words ${isMe ? '' : 'text-foreground'}`}>
                    {msg.message_text}
                  </p>
                  <p className={`text-[10px] mt-1 ${isMe ? 'text-primary-foreground/50' : 'text-muted-foreground/70'}`}>
                    {format(new Date(msg.created_at), 'MMM d, h:mm a')}
                  </p>
                </div>
              </div>
            );
          })
        )}
        {isSending && (
          <div className="flex justify-end">
            <div className="bg-primary/20 text-primary rounded-2xl rounded-br-md px-4 py-2.5">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      {ticket?.status !== 'closed' && (
        <div className="p-3 border-t border-border bg-card shrink-0">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your message..."
              className="min-h-[40px] max-h-24 resize-none text-sm"
              rows={1}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              size="icon"
              className="shrink-0 h-10 w-10 rounded-xl"
            >
              {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TicketThread;
