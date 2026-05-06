import { Users, PackageCheck, Activity, Star } from 'lucide-react';

const stats = [
  { icon: Users, value: '47K+', label: 'Ghanaians on YieGo' },
  { icon: PackageCheck, value: '250K+', label: 'Orders delivered' },
  { icon: Activity, value: '99.7%', label: 'Delivery success' },
  { icon: Star, value: '4.9', label: 'Average rating' },
];

const TrustBand = () => {
  return (
    <section className="container -mt-2 md:-mt-4">
      <div className="relative overflow-hidden rounded-[1.75rem] border border-border/70 bg-card/60 backdrop-blur-md">
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-primary/[0.06] via-transparent to-accent/[0.05]" />
        <div className="noise-overlay" />

        <div className="relative grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-border/60">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-3 px-5 py-5 md:py-6">
              <div className="w-9 h-9 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
                <s.icon className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xl md:text-2xl font-display font-extrabold tracking-[-0.02em] tabular leading-none">
                  {s.value}
                </p>
                <p className="text-[11px] md:text-[11.5px] text-muted-foreground mt-1 leading-tight">
                  {s.label}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TrustBand;
