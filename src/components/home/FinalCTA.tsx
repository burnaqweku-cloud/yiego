import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Smartphone, Sparkles } from 'lucide-react';

const FinalCTA = () => {
  return (
    <section className="container py-20 md:py-28">
      <div className="relative overflow-hidden rounded-[2rem] glass-hero-emerald text-white">
        {/* Decorative layers */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-white/10 blur-3xl glow-drift" />
          <div className="absolute -bottom-32 -left-24 w-96 h-96 rounded-full bg-accent/20 blur-3xl glow-drift-slow" />
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{ backgroundImage: 'radial-gradient(white 1px, transparent 1px)', backgroundSize: '28px 28px' }}
          />
          <div className="noise-overlay" style={{ mixBlendMode: 'soft-light', opacity: 0.18 }} />
        </div>

        <div className="relative grid md:grid-cols-12 gap-8 items-center p-8 md:p-14 lg:p-16">
          {/* Left: headline */}
          <div className="md:col-span-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 backdrop-blur-md px-3 py-1.5 mb-6">
              <Sparkles className="w-3 h-3 text-accent" />
              <span className="text-[10.5px] font-bold tracking-wide text-white/90 uppercase">Free to join · No subscription</span>
            </div>
            <h2 className="text-3xl md:text-5xl lg:text-[3.6rem] font-display font-extrabold tracking-[-0.035em] leading-[1.02] text-white">
              Ready to ditch <br />
              the <span className="line-through text-white/40">old way</span> of{' '}
              <span className="bg-gradient-to-r from-accent via-white to-accent bg-clip-text text-transparent">topping up?</span>
            </h2>
            <p className="text-white/75 mt-5 max-w-md text-[14.5px] leading-relaxed">
              Open your YieGo wallet in under a minute. Fund once. Order data, airtime, bills and more — all from one place.
            </p>
          </div>

          {/* Right: actions stack */}
          <div className="md:col-span-5">
            <div className="rounded-3xl border border-white/20 bg-white/10 backdrop-blur-xl p-5 md:p-6 space-y-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.5)]">
              <Link to="/auth?tab=signup" className="block">
                <Button size="lg" className="w-full rounded-2xl h-12 font-bold gap-2 bg-white text-foreground hover:bg-white/95 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)]">
                  Create free account <ArrowRight className="w-4 h-4" />
                </Button>
              </Link>
              <Link to="/buy-data" className="block">
                <Button size="lg" variant="outline" className="w-full rounded-2xl h-12 font-semibold gap-2 bg-transparent border-white/30 text-white hover:bg-white/10 hover:text-white">
                  <Smartphone className="w-4 h-4" /> Try without an account
                </Button>
              </Link>
              <div className="flex items-center justify-center gap-2 pt-1 text-[11px] text-white/70">
                <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
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
