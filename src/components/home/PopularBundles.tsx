import { Link } from 'react-router-dom';
import { formatPrice, NETWORK_COLORS, type Network } from '@/data/bundles';
import { useAdmin, type DbBundle } from '@/contexts/AdminContext';
import { usePricing } from '@/hooks/usePricing';
import { Button } from '@/components/ui/button';
import { ArrowRight, Zap } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { Skeleton } from '@/components/ui/skeleton';
import NonExpiryBadge from '@/components/bundles/NonExpiryBadge';

const PopularBundles = () => {
  const { bundles, loadingBundles } = useAdmin();
  const { getSellingPrice } = usePricing();
  const popular = bundles.filter((b) => b.popular && b.active).slice(0, 6);
  const ref = useScrollReveal();

  return (
    <section className="bg-secondary/50 py-16 md:py-24" ref={ref}>
      <div className="container">
        <div className="text-center mb-12 reveal-on-scroll">
          <span className="inline-block text-xs font-bold uppercase tracking-widest text-primary mb-3">Top Picks</span>
          <h2 className="text-2xl md:text-3xl font-display font-bold mb-3">Popular Bundles</h2>
          <p className="text-muted-foreground max-w-md mx-auto text-sm leading-relaxed">Our most purchased data packages across all networks</p>
        </div>

        {loadingBundles ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-[180px] w-full rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto reveal-stagger">
            {popular.map((bundle) => (
              <BundlePreviewCard key={bundle.id} bundle={bundle} getSellingPrice={getSellingPrice} />
            ))}
          </div>
        )}

        <div className="text-center mt-12 reveal-on-scroll">
          <Link to="/buy-data">
            <Button variant="outline" className="gap-2 btn-press">
              View All Bundles
              <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
};

const BundlePreviewCard = ({ bundle, getSellingPrice }: { bundle: DbBundle; getSellingPrice: (b: DbBundle) => number }) => {
  const network = bundle.network as Network;
  const price = getSellingPrice(bundle);
  return (
    <div className="reveal-on-scroll bg-card rounded-2xl p-5 interactive-card border border-border card-shadow group">
      <div className="flex items-center justify-between mb-4">
        <span className={`text-xs font-bold px-3 py-1 rounded-full ${NETWORK_COLORS[network]}`}>
          {bundle.network}
        </span>
        <NonExpiryBadge size="xs" network={bundle.network} />
      </div>
      <div className="mb-4">
        <h3 className="text-3xl font-display font-bold tracking-tight">{bundle.bundle_size_gb}<span className="text-lg text-muted-foreground ml-0.5">GB</span></h3>
      </div>
      <div className="flex items-center justify-between pt-3 border-t border-border">
        <span className="text-lg font-bold text-foreground">{formatPrice(price)}</span>
        <Link to={`/buy-data?network=${bundle.network}`}>
          <Button size="sm" className="btn-press gap-1.5 font-bold">
            Buy Now
            <ArrowRight className="w-3 h-3" />
          </Button>
        </Link>
      </div>
    </div>
  );
};

export default PopularBundles;
