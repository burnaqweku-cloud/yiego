import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Zap, ShieldCheck } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useSiteNotice } from '@/contexts/SiteNoticeContext';

interface DashboardSystemStatusProps {
  status: { online: boolean; message: string; statusText: string };
  loading: boolean;
}

const DashboardSystemStatus = ({ status, loading }: DashboardSystemStatusProps) => {
  const { notice: siteNotice } = useSiteNotice();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (loading) {
    return (
      <div className="rounded-2xl p-4 border border-border bg-card">
        <div className="flex items-center gap-3 mb-3">
          <Skeleton className="w-3 h-3 rounded-full" />
          <Skeleton className="h-4 w-28" />
        </div>
        <Skeleton className="h-3 w-48" />
      </div>
    );
  }

  const isOnline = status.online;

  return (
    <div className={`rounded-2xl p-4 border card-shadow ${
      isOnline ? 'bg-success/5 border-success/20' : 'bg-destructive/5 border-destructive/20'
    }`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 heartbeat-dot ${isOnline ? 'bg-success' : 'bg-destructive'}`} />
            <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${isOnline ? 'bg-success' : 'bg-destructive'}`} />
          </span>
          <span className="text-sm font-bold tracking-wide">
            {isOnline ? (status.statusText || 'SYSTEM ONLINE').toUpperCase() : 'SYSTEM OFFLINE'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full">24/7</span>
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            <span className="blink-colon">:</span>
            {time.toLocaleTimeString('en-GB', { second: '2-digit' }).slice(-2)}
          </span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">{status.message}</p>

      {/* Trust chips */}
      <div className="flex items-center gap-2 mt-3">
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-secondary rounded-full px-2.5 py-1">
          <Zap className="w-3 h-3 text-primary" /> Fast Delivery
        </span>
        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-secondary rounded-full px-2.5 py-1">
          <ShieldCheck className="w-3 h-3 text-success" /> Secure Payments
        </span>
      </div>

      {siteNotice?.enabled && (
        <div className="flex items-center gap-1.5 mt-2.5 text-[10px] text-primary font-semibold">
          <AlertTriangle className="w-3 h-3" />
          <Link to="/support" className="hover:underline">Active service notice</Link>
        </div>
      )}
    </div>
  );
};

export default DashboardSystemStatus;
