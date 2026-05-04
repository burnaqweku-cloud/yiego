import { Link } from 'react-router-dom';
import { Smartphone, ArrowRight } from 'lucide-react';
import { NETWORKS, type Network } from '@/data/bundles';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { useMinNetworkPrices } from '@/hooks/useMinNetworkPrices';

const networkInfo: Record<Network, { description: string; subscribers: string }> = {
  MTN: { description: 'Ghana\'s largest network', subscribers: '30K+ users' },
  Telecel: { description: 'Reliable nationwide coverage', subscribers: '7K+ users' },
  AirtelTigo: { description: 'Best value bundles', subscribers: '10K+ users' },
};

const networkBgClasses: Record<Network, string> = {
  MTN: 'surface-premium hover:border-mtn/40 hover:shadow-[0_10px_30px_-12px_hsl(var(--mtn)/0.35)]',
  Telecel: 'surface-premium hover:border-telecel/40 hover:shadow-[0_10px_30px_-12px_hsl(var(--telecel)/0.35)]',
  AirtelTigo: 'surface-premium hover:border-airteltigo/40 hover:shadow-[0_10px_30px_-12px_hsl(var(--airteltigo)/0.35)]',
};

const networkBarClasses: Record<Network, string> = {
  MTN: 'bg-mtn',
  Telecel: 'bg-telecel',
  AirtelTigo: 'bg-airteltigo',
};

const networkIconClasses: Record<Network, string> = {
  MTN: 'bg-mtn text-mtn-foreground',
  Telecel: 'bg-telecel text-telecel-foreground',
  AirtelTigo: 'bg-airteltigo text-airteltigo-foreground',
};

const NetworkCards = () => {
  const ref = useScrollReveal();
  const { prices } = useMinNetworkPrices();

  return (
    <section className="container py-16 md:py-24" ref={ref}>
      <div className="text-center mb-12 reveal-on-scroll">
        <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary mb-3">Networks</span>
        <h2 className="text-2xl md:text-3xl font-display font-bold mb-3">Choose Your Network</h2>
        <p className="text-muted-foreground max-w-md mx-auto text-sm leading-relaxed">Select your network to browse available data bundles</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 max-w-3xl mx-auto reveal-stagger">
        {NETWORKS.map((network) => {
          const minPrice = prices[network];
          const tagline = minPrice != null ? `From GHS ${minPrice.toFixed(2)}` : 'From GHS —';
          return (
            <Link
              key={network}
              to={`/buy-data?network=${network}`}
              className={`reveal-on-scroll group block p-6 rounded-2xl relative overflow-hidden transition-all duration-300 hover:-translate-y-1 ${networkBgClasses[network]}`}
            >
              <span className={`absolute top-0 left-0 right-0 h-0.5 ${networkBarClasses[network]} opacity-80`} />
              <div className="flex items-center justify-between mb-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${networkIconClasses[network]} shadow-[0_4px_12px_-4px_hsl(var(--primary)/0.2)] ring-1 ring-white/10`}>
                  <Smartphone className="w-6 h-6" />
                </div>
                <ArrowRight className="w-4 h-4 text-primary opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200" />
              </div>
              <h3 className="font-display font-bold text-lg mb-1 tracking-tight">{network}</h3>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">{networkInfo[network].description}</p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-primary tabular">{tagline}</span>
                <span className="text-[10px] text-muted-foreground bg-muted/40 ring-1 ring-border/60 px-2 py-0.5 rounded-full font-medium">{networkInfo[network].subscribers}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
};

export default NetworkCards;
