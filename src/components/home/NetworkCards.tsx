import { Link } from 'react-router-dom';
import { ArrowRight, Signal, Zap } from 'lucide-react';
import { NETWORKS, type Network } from '@/data/bundles';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { useMinNetworkPrices } from '@/hooks/useMinNetworkPrices';

const networkMeta: Record<Network, { tag: string; tagline: string; subs: string; accent: string; dot: string }> = {
  MTN: {
    tag: 'Largest network',
    tagline: '90-day validity bundles',
    subs: '30K+ buyers',
    accent: 'hover:border-mtn/50 hover:shadow-[0_20px_40px_-20px_hsl(var(--mtn)/0.5)]',
    dot: 'bg-mtn',
  },
  Telecel: {
    tag: 'Reliable nationwide',
    tagline: 'Non-expiry data — keeps forever',
    subs: '7K+ buyers',
    accent: 'hover:border-telecel/50 hover:shadow-[0_20px_40px_-20px_hsl(var(--telecel)/0.5)]',
    dot: 'bg-telecel',
  },
  AirtelTigo: {
    tag: 'Best value',
    tagline: '60-day validity bundles',
    subs: '10K+ buyers',
    accent: 'hover:border-airteltigo/50 hover:shadow-[0_20px_40px_-20px_hsl(var(--airteltigo)/0.5)]',
    dot: 'bg-airteltigo',
  },
};

const NetworkCards = () => {
  const ref = useScrollReveal();
  const { prices } = useMinNetworkPrices();

  return (
    <section className="container py-20 md:py-28" ref={ref}>
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12 reveal-on-scroll">
        <div className="max-w-xl">
          <div className="inline-flex items-center gap-2 mb-4">
            <span className="h-px w-8 bg-gradient-to-r from-transparent to-primary" />
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">Choose your network</span>
          </div>
          <h2 className="text-3xl md:text-[2.6rem] font-display font-extrabold tracking-[-0.03em] leading-[1.05]">
            All three networks. <br className="hidden md:inline" />
            <span className="text-gradient">One checkout.</span>
          </h2>
        </div>
        <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
          Pick a network, pick a size, and pay. Same bundle, lower price — delivery usually in minutes.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4 reveal-stagger">
        {NETWORKS.map((network) => {
          const meta = networkMeta[network];
          const minPrice = prices[network];
          return (
            <Link
              key={network}
              to={`/buy-data?network=${network}`}
              className={`reveal-on-scroll group relative block rounded-3xl border border-border bg-card overflow-hidden transition-all duration-500 hover:-translate-y-1.5 ${meta.accent}`}
            >
              {/* Brand color rail */}
              <div className={`absolute inset-x-0 top-0 h-1 ${meta.dot}`} />

              {/* Ambient brand glow on hover */}
              <div className={`absolute -bottom-20 -right-20 w-56 h-56 rounded-full ${meta.dot} opacity-0 group-hover:opacity-[0.18] blur-3xl transition-opacity duration-700`} />
              {/* Top sheen on hover */}
              <div className={`absolute inset-x-0 top-1 h-px bg-gradient-to-r from-transparent via-foreground/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

              <div className="p-6 relative">
                {/* Top row */}
                <div className="flex items-start justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${meta.dot} shadow-[0_0_12px_currentColor] opacity-90 group-hover:opacity-100 transition-opacity`} />
                    <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground/80">{meta.tag}</span>
                  </div>
                  <Signal className="w-4 h-4 text-muted-foreground/40 group-hover:text-foreground/80 group-hover:scale-110 transition-all" />
                </div>

                {/* Network name as display type */}
                <h3 className="font-display font-extrabold text-3xl md:text-[2.15rem] tracking-[-0.035em] leading-none mb-2">
                  {network}
                </h3>
                <p className="text-[12.5px] text-muted-foreground leading-relaxed">{meta.tagline}</p>

                {/* Footer */}
                <div className="flex items-end justify-between mt-7 pt-5 border-t border-border/60">
                  <div>
                    <p className="text-[9.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground/70">Starting from</p>
                    <p className="text-2xl font-display font-extrabold tabular mt-0.5 leading-none">
                      {minPrice != null ? (
                        <>
                          <span className="text-[13px] font-bold text-muted-foreground mr-0.5 align-baseline">GHS</span>
                          {minPrice.toFixed(2)}
                        </>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted/50 group-hover:bg-primary group-hover:text-primary-foreground text-[12px] font-semibold text-foreground/80 transition-all duration-300">
                    Browse
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                </div>

                {/* Stats badge */}
                <div className="absolute top-4 right-4 hidden md:flex items-center gap-1 text-[9.5px] uppercase tracking-wider font-semibold text-muted-foreground/60">
                  <Zap className="w-2.5 h-2.5" />
                  {meta.subs}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
};

export default NetworkCards;
