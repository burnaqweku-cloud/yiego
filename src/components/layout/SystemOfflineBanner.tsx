import { AlertTriangle } from 'lucide-react';
import { useGlobalSystemStatus } from '@/contexts/SystemStatusContext';

const SystemOfflineBanner = () => {
  const { status, loading } = useGlobalSystemStatus();

  if (loading || status.online) return null;

  return (
    <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4 flex items-start gap-3 animate-fade-in">
      <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-bold text-destructive">System Offline</p>
        <p className="text-xs text-muted-foreground mt-0.5">{status.message}</p>
      </div>
    </div>
  );
};

export default SystemOfflineBanner;
