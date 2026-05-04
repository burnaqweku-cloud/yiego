import { AlertTriangle } from 'lucide-react';

interface NetworkUnavailableBannerProps {
  network: string;
  message: string;
}

const NetworkUnavailableBanner = ({ network, message }: NetworkUnavailableBannerProps) => {
  return (
    <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 flex items-start gap-3">
      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-semibold text-foreground">{network} Temporarily Unavailable</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          {message || `${network} orders are temporarily unavailable. Please try again later.`}
        </p>
      </div>
    </div>
  );
};

export default NetworkUnavailableBanner;
