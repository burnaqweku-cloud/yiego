import { Link } from 'react-router-dom';
import { Smartphone, AlertTriangle, ArrowRight } from 'lucide-react';
import { useMinNetworkPrices } from '@/hooks/useMinNetworkPrices';
import { useNetworkAvailability } from '@/hooks/useNetworkAvailability';
import type { Network } from '@/data/bundles';

const networks: { name: Network; bgClass: string; iconBg: string }[] = [
  { name: 'MTN', bgClass: 'bg-mtn/[0.07] border-mtn/25 hover:border-mtn/60', iconBg: 'bg-mtn text-mtn-foreground' },
  { name: 'Telecel', bgClass: 'bg-telecel/[0.07] border-telecel/25 hover:border-telecel/60', iconBg: 'bg-telecel text-telecel-foreground' },
  { name: 'AirtelTigo', bgClass: 'bg-airteltigo/[0.07] border-airteltigo/25 hover:border-airteltigo/60', iconBg: 'bg-airteltigo text-airteltigo-foreground' },
];

const DashboardNetworkCards = () => {
  const { prices } = useMinNetworkPrices();
  const { isNetworkAvailable } = useNetworkAvailability();

  return (
    <div className="surface-premium rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-display font-semibold text-sm tracking-tight">Place New Order</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">Choose a network to get started</p>
        </div>
        <Link to="/dashboard/buy" className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-1">
          See all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-2.5">
        {networks.map((network) => {
          const minPrice = prices[network.name];
          const available = isNetworkAvailable(network.name);
          const subtitle = !available
            ? 'Unavailable'
            : minPrice != null ? `from ₵${minPrice.toFixed(2)}` : 'from ₵—';
          return (
            <Link
              key={network.name}
              to={`/dashboard/buy?network=${network.name}`}
              className={`p-3.5 rounded-xl border-2 text-center interactive-card transition-all ${network.bgClass} ${!available ? 'opacity-50' : ''}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-2 shadow-sm ${network.iconBg}`}>
                {available ? <Smartphone className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
              </div>
              <span className="text-xs font-bold block tracking-tight">{network.name}</span>
              <span className={`text-[9px] mt-0.5 block tabular ${!available ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>{subtitle}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};

export default DashboardNetworkCards;
