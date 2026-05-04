import { useState, useEffect } from 'react';
import { Shield, Zap } from 'lucide-react';
import { useGlobalSystemStatus } from '@/contexts/SystemStatusContext';

const StoreSystemStatus = () => {
  const [time, setTime] = useState(new Date());
  const { status } = useGlobalSystemStatus();

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const hours = time.getHours().toString().padStart(2, '0');
  const mins = time.getMinutes().toString().padStart(2, '0');
  const secs = time.getSeconds().toString().padStart(2, '0');

  return (
    <div className="animate-hero-in hero-stagger-2">
      <div className="bg-card border border-border rounded-2xl p-3.5 card-shadow">
        {/* Status row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`absolute inline-flex h-full w-full rounded-full opacity-75 pulse-dot ${status.online ? 'bg-success' : 'bg-destructive'}`} />
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${status.online ? 'bg-success' : 'bg-destructive'}`} />
            </span>
            <span className={`text-xs font-bold tracking-wide uppercase ${status.online ? 'text-success' : 'text-destructive'}`}>
              {status.online ? (status.statusText || 'System Online') : 'System Offline'}
            </span>
          </div>
          <div className="text-xs font-mono text-muted-foreground tabular-nums">
            {hours}<span className="blink-colon">:</span>{mins}<span className="blink-colon">:</span>{secs}
          </div>
        </div>

        {/* Message + chips */}
        <div className="flex items-center justify-between mt-2.5">
          <p className="text-[11px] text-muted-foreground">
            {status.online ? 'Orders are processing normally.' : status.message}
          </p>
          {status.online && (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/8 text-primary">
                <Zap className="w-2.5 h-2.5" /> Fast Delivery
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-success/8 text-success">
                <Shield className="w-2.5 h-2.5" /> Secure
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StoreSystemStatus;
