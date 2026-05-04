import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Smartphone, Sparkles } from 'lucide-react';

const FinalCTA = () => {
  return (
    <section className="container py-20 md:py-28">
      <div className="relative overflow-hidden rounded-[2rem] border border-border bg-gradient-to-br from-card via-card to-card/60">
        {/* Decorative layers */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-80 h-80 rounded-full bg-primary/25 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 w-80 h-80 rounded-full bg-accent/15 blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{ backgroundImage: 'radial-gradient(hsl(var(--foreground)) 1px, transparent 1px)', backgroundSize: '28px 28px' }}
          />
        </div>

        <div className="relative grid md:grid-cols-12 gap-8 items-center p-8 md:p-14">
          {/* Left: headline */}
          <div className="md:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 mb-6">
              <Sparkles className="w-3 h-3 text-primary" />
              <span className="text-[10.5px] font-bold tracking-wide text-primary uppercase">Free to join · No subscription</span>
            </div>
            <h2 className="text-3xl md:text-5xl lg:text-[3.4rem] font-display font-extrabold tracking-[-0.03em] leading-[1.05]">
              Ready to ditch <br />
              the <span className="line-through text-muted-foreground/50">old way</span> of <span className="text-gradient">topping up?</span>
            </h2>
            <p className="text-muted-foreground mt-5 max-w-md text-[14.5px] leading-relaxed">
              Open your YieGo wallet in under a minute. Fund once. Order data, airtime, bills and more — all from one place.
            </p>
          </div>

          {/* Right: actions stack */}
          <div className="md:col-span-5">
            <div className="rounded-3xl border border-border/70 bg-background/60 backdrop-blur-md p-5 md:p-6 space-y-3">
              <Link to="/auth?tab=signup" className="block">
                <Button size="lg" className="w-full rounded-2xl h-12 font-bold gap-2 shadow-[0_10px_30px_-12px_hsl(var(--primary)/0.6)]">
                  Create free account <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/buy-data" className="block">
                <Button size="lg" variant="outline" className="w-full rounded-2xl h-12 font-semibold gap-2">
                  <Smartphone className="w-4 h-4" /> Try without an account
                </Button>
              </Link>
              <div className="flex items-center justify-center gap-2 pt-1 text-[11px] text-muted-foreground">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />
                <span>47K+ Ghanaians already use YieGo</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default FinalCTA;
