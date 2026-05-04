import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import SEOHead from '@/components/seo/SEOHead';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  MessageCircle, Search, Clock, Headphones, ChevronRight,
  ExternalLink, Loader2, CheckCircle, AlertCircle, Info,
  ArrowRight, MessageSquare, RefreshCw, Shield, FileText,
  Smartphone, Camera, Calendar, Hash, User
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';

interface UserTicket {
  id: string;
  ticket_number: number;
  ticket_code: string | null;
  status: string;
  issue_type: string;
  created_at: string;
  updated_at: string;
  resolution_message: string | null;
  resolution_code: string | null;
  ticket_metadata: any;
}

const ISSUE_LABELS: Record<string, string> = {
  order_not_created: 'Order Not Created',
  deposit_not_reflected: 'Deposit Not Reflected',
  order_not_delivered: 'Order Issue',
  account_issue: 'Account / Access',
  other: 'Other',
};

const STATUS_STYLE: Record<string, { label: string; className: string; icon: typeof CheckCircle }> = {
  new: { label: 'Open', className: 'bg-sky-500/10 text-sky-600 border-sky-500/20', icon: Info },
  in_progress: { label: 'In Progress', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20', icon: Loader2 },
  resolved: { label: 'Resolved', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: CheckCircle },
  closed: { label: 'Resolved', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', icon: CheckCircle },
};

const Support = () => {
  const { user, profile } = useAuth();
  const isLoggedIn = !!user;
  const userName = profile?.full_name || profile?.username || '';
  const firstName = userName ? userName.split(' ')[0] : '';

  const [tickets, setTickets] = useState<UserTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  const [trackInput, setTrackInput] = useState('');
  const [trackLoading, setTrackLoading] = useState(false);
  const [trackError, setTrackError] = useState<string | null>(null);
  const [trackedTicket, setTrackedTicket] = useState<UserTicket | null>(null);

  const fetchUserTickets = useCallback(async () => {
    if (!user) return;
    setTicketsLoading(true);
    try {
      const { data } = await supabase
        .from('admin_support_tickets')
        .select('*')
        .or(`linked_user_id.eq.${user.id},customer_email.eq.${profile?.email || ''}`)
        .order('updated_at', { ascending: false })
        .limit(20);
      if (data) setTickets(data as unknown as UserTicket[]);
    } catch {}
    setTicketsLoading(false);
  }, [user, profile?.email]);

  useEffect(() => { fetchUserTickets(); }, [fetchUserTickets]);

  const trackTicket = async () => {
    const code = trackInput.trim().toUpperCase();
    if (!code) return;
    setTrackLoading(true);
    setTrackError(null);
    setTrackedTicket(null);
    try {
      const { data, error } = await supabase
        .from('admin_support_tickets')
        .select('*')
        .eq('ticket_code', code)
        .maybeSingle();
      if (error || !data) {
        setTrackError('Ticket not found. Please check the code and try again.');
      } else {
        setTrackedTicket(data as unknown as UserTicket);
      }
    } catch {
      setTrackError('Something went wrong. Please try again.');
    }
    setTrackLoading(false);
  };

  const openChat = () => {
    const btn = document.querySelector('[aria-label="Open support chat"]') as HTMLButtonElement;
    btn?.click();
  };

  const ticketCounts = {
    open: tickets.filter(t => t.status === 'new').length,
    inProgress: tickets.filter(t => t.status === 'in_progress').length,
    resolved: tickets.filter(t => t.status === 'closed' || t.status === 'resolved').length,
  };

  return (
    <Layout>
      <SEOHead
        title="Support Center — YieGo"
        description="Get help with your data bundle orders, deposits, and account. AI-powered support available 9 AM – 9 PM."
        path="/support"
      />

      <div className="min-h-[80vh]">
        {/* ─── HERO SECTION ─── */}
        <section className="relative overflow-hidden bg-gradient-to-b from-primary/5 via-primary/[0.02] to-transparent">
          <div className="container max-w-3xl py-10 md:py-14 px-4 text-center space-y-4">
            <div className="w-20 h-20 rounded-2xl bg-primary/10 border border-primary/10 flex items-center justify-center mx-auto shadow-lg shadow-primary/5">
              <Headphones className="w-10 h-10 text-primary" />
            </div>
            <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight">
              {isLoggedIn && firstName ? (
                <>Welcome back, <span className="text-primary">{firstName}</span></>
              ) : (
                'Support Center'
              )}
            </h1>
            <p className="text-base text-muted-foreground max-w-md mx-auto leading-relaxed">
              Your one-stop hub for help. Chat with our AI assistant, track tickets, and get instant answers.
            </p>
            <div className="pt-2">
              <Button onClick={openChat} size="lg" className="h-13 px-8 text-sm font-bold gap-2.5 rounded-xl shadow-md shadow-primary/20">
                <MessageCircle className="w-5 h-5" />
                Start Support Chat
              </Button>
            </div>
          </div>
        </section>

        <div className="container max-w-3xl px-4 pb-12 space-y-8">

          {/* ─── LOGGED-IN: TICKET SUMMARY CARDS ─── */}
          {isLoggedIn && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-display font-bold">Your Support Overview</h2>
                <button
                  onClick={fetchUserTickets}
                  className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline"
                >
                  <RefreshCw className="w-3 h-3" /> Refresh
                </button>
              </div>

              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-4 text-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-sky-500/5 to-transparent" />
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-sky-500/10 flex items-center justify-center mx-auto mb-2">
                      <Info className="w-4 h-4 text-sky-600" />
                    </div>
                    <p className="text-2xl font-bold text-sky-600">{ticketCounts.open}</p>
                    <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Open</p>
                  </div>
                </div>
                <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-4 text-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent" />
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center mx-auto mb-2">
                      <Loader2 className="w-4 h-4 text-amber-600" />
                    </div>
                    <p className="text-2xl font-bold text-amber-600">{ticketCounts.inProgress}</p>
                    <p className="text-[11px] text-muted-foreground font-medium mt-0.5">In Progress</p>
                  </div>
                </div>
                <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-4 text-center">
                  <div className="absolute inset-0 bg-gradient-to-br from-emerald-500/5 to-transparent" />
                  <div className="relative">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                    </div>
                    <p className="text-2xl font-bold text-emerald-600">{ticketCounts.resolved}</p>
                    <p className="text-[11px] text-muted-foreground font-medium mt-0.5">Resolved</p>
                  </div>
                </div>
              </div>

              {/* Ticket List */}
              <div className="bg-card border border-border rounded-2xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border bg-muted/30">
                  <h3 className="text-sm font-bold flex items-center gap-2">
                    <FileText className="w-4 h-4 text-muted-foreground" />
                    My Tickets
                  </h3>
                </div>

                {ticketsLoading ? (
                  <div className="flex justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="py-10 text-center">
                    <MessageSquare className="w-10 h-10 text-muted-foreground/15 mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground font-medium">No tickets yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Start a support chat to get help with any issue</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {tickets.map(ticket => {
                      const st = STATUS_STYLE[ticket.status] || STATUS_STYLE.new;
                      const displayCode = ticket.ticket_code || `#${ticket.ticket_number}`;
                      return (
                        <div key={ticket.id} className="px-4 py-3.5 hover:bg-muted/20 transition-colors">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-bold font-mono text-foreground">{displayCode}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.className}`}>
                                  {st.label}
                                </span>
                              </div>
                              <p className="text-xs text-muted-foreground">
                                {ISSUE_LABELS[ticket.issue_type] || ticket.issue_type}
                              </p>
                              {ticket.resolution_message && (
                                <p className="text-xs text-foreground/80 bg-emerald-500/5 border border-emerald-500/10 rounded-lg px-3 py-2 leading-relaxed mt-1.5">
                                  {ticket.resolution_message}
                                </p>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-[10px] text-muted-foreground">
                                {formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true })}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}

          {/* ─── TRACK TICKET ─── */}
          <section className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border bg-muted/30">
              <h2 className="text-base font-display font-bold flex items-center gap-2">
                <Search className="w-4 h-4 text-muted-foreground" />
                Track a Ticket
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {isLoggedIn
                  ? 'Look up any ticket by its code.'
                  : 'Enter the ticket code you received to check your issue status.'}
              </p>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="e.g. TK-4F8K2"
                  value={trackInput}
                  onChange={e => setTrackInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && trackTicket()}
                  className="h-11 text-sm flex-1"
                />
                <Button className="h-11 px-6 font-semibold" onClick={trackTicket} disabled={trackLoading}>
                  {trackLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <>Track</>}
                </Button>
              </div>
              {trackError && (
                <div className="flex items-center gap-2 text-destructive text-xs bg-destructive/5 rounded-lg px-3 py-2">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  {trackError}
                </div>
              )}

              {trackedTicket && (
                <div className="border border-border rounded-xl p-4 space-y-2.5 bg-muted/10">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold font-mono">
                      {trackedTicket.ticket_code || `#${trackedTicket.ticket_number}`}
                    </span>
                    {(() => {
                      const st = STATUS_STYLE[trackedTicket.status] || STATUS_STYLE.new;
                      return (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.className}`}>
                          {st.label}
                        </span>
                      );
                    })()}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {ISSUE_LABELS[trackedTicket.issue_type] || trackedTicket.issue_type}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Submitted {format(new Date(trackedTicket.created_at), 'MMM d, yyyy · h:mm a')}
                  </p>
                  {trackedTicket.resolution_message && (
                    <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg px-3 py-2.5">
                      <p className="text-xs text-foreground/80 leading-relaxed">{trackedTicket.resolution_message}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* ─── BEFORE YOU CONTACT SUPPORT ─── */}
          <section className="space-y-4">
            <h2 className="text-lg font-display font-bold">Before You Contact Support</h2>
            <p className="text-sm text-muted-foreground -mt-2">
              Having these details ready will help us resolve your issue faster.
            </p>

            <div className="grid sm:grid-cols-2 gap-3">
              {[
                {
                  icon: <Hash className="w-4 h-4" />,
                  title: 'Order Not Created',
                  details: 'Recipient number, exact date & time of payment, payment screenshot',
                  color: 'text-red-500 bg-red-500/10',
                },
                {
                  icon: <FileText className="w-4 h-4" />,
                  title: 'Deposit Not Reflected',
                  details: 'YieGo deposit ID (DES-... or DEP-...), MoMo screenshot',
                  color: 'text-amber-500 bg-amber-500/10',
                },
                {
                  icon: <Smartphone className="w-4 h-4" />,
                  title: 'Order Delivery Issue',
                  details: 'Order ID or recipient number',
                  color: 'text-sky-500 bg-sky-500/10',
                },
                {
                  icon: <Shield className="w-4 h-4" />,
                  title: 'Account / Access',
                  details: 'Describe the issue clearly; include email if relevant',
                  color: 'text-purple-500 bg-purple-500/10',
                },
              ].map(item => (
                <div key={item.title} className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${item.color}`}>
                      {item.icon}
                    </div>
                    <h3 className="text-sm font-bold">{item.title}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed pl-[42px]">{item.details}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ─── SUPPORT INFO & HOURS ─── */}
          <section className="grid sm:grid-cols-2 gap-3">
            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Clock className="w-4.5 h-4.5 text-primary" />
                </div>
                <h3 className="text-sm font-bold">Support Hours</h3>
              </div>
              <div className="space-y-1.5 pl-[46px]">
                <p className="text-sm font-semibold text-foreground">9:00 AM – 9:00 PM</p>
                <p className="text-xs text-muted-foreground">Ghana time (GMT+0)</p>
                <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                  Tickets reviewed within 10 min – 1 hour during active hours.
                </p>
              </div>
            </div>

            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <MessageCircle className="w-4.5 h-4.5 text-emerald-600" />
                </div>
                <h3 className="text-sm font-bold">AI Always Available</h3>
              </div>
              <div className="space-y-1.5 pl-[46px]">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Our AI assistant can help you anytime — answer questions, guide you, and provide instant support even outside ticket review hours.
                </p>
                <button onClick={openChat} className="text-xs text-primary font-semibold hover:underline inline-flex items-center gap-1 mt-1">
                  Chat now <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          </section>

          {/* ─── GUEST NUDGE ─── */}
          {!isLoggedIn && (
            <section className="bg-gradient-to-br from-primary/5 via-primary/[0.02] to-transparent border border-primary/10 rounded-2xl p-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto">
                <User className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-sm font-bold">Create a Free Account</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto leading-relaxed">
                Save your tickets, track orders, and get faster personalized support — all in one place.
              </p>
              <Link to="/auth?tab=signup">
                <Button variant="outline" size="sm" className="gap-1.5 text-xs font-semibold rounded-lg mt-1">
                  Sign Up Free <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </Link>
            </section>
          )}

          {/* ─── CONTACT FALLBACK ─── */}
          <section className="text-center space-y-2 pt-2 pb-6">
            <p className="text-xs text-muted-foreground">For urgent issues outside support hours:</p>
            <a
              href="mailto:support@yiego.com"
              className="inline-flex items-center gap-1.5 text-sm text-primary font-semibold hover:underline"
            >
              support@yiego.com
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </section>
        </div>
      </div>
    </Layout>
  );
};

export default Support;
