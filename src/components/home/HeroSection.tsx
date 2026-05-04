import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Shield, Zap, CheckCircle } from 'lucide-react';

const HeroSection = () => {
  return (
    <section className="hero-gradient relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="hero-glow hero-glow-1" />
        <div className="hero-glow hero-glow-2" />
        <div className="hero-glow hero-glow-3" />
      </div>

      <div className="container relative py-16 md:py-28 lg:py-36">
        <div className="max-w-3xl mx-auto text-center">
          {/* Trust badge */}
          <div className="hero-stagger-1 animate-hero-in">
            <div className="inline-flex items-center gap-2 bg-white/8 border border-white/10 rounded-full px-5 py-2.5 mb-8">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 pulse-dot bg-success" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              <span className="text-white/70 text-sm font-medium tracking-wide">
                System Online · Fast delivery across Ghana
              </span>
            </div>
          </div>

          <h1 className="hero-stagger-2 animate-hero-in text-4xl md:text-5xl lg:text-6xl font-display font-extrabold text-white leading-[1.08] mb-6 tracking-tight">
            Ghana's Cheapest
            <br />
            <span className="text-gradient">Data Bundles</span>
          </h1>

          <p className="hero-stagger-3 animate-hero-in text-base md:text-lg text-white/55 mb-10 max-w-xl mx-auto leading-relaxed">
            Buy cheap MTN, Telecel & AirtelTigo data bundles. Fast delivery. No account required.
          </p>

          <div className="hero-stagger-4 animate-hero-in flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/buy-data">
              <Button variant="hero" className="gap-2.5 btn-press w-full sm:w-auto">
                Buy Data Now
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/auth?tab=signup">
              <Button variant="hero-outline" className="gap-2.5 btn-press w-full sm:w-auto">
                <Shield className="w-4 h-4" />
                Create Free Account
              </Button>
            </Link>
          </div>

          {/* Trust indicators */}
          <div className="hero-stagger-5 animate-hero-in flex flex-wrap items-center justify-center gap-x-8 gap-y-3 mt-12 text-white/40 text-xs font-medium">
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span>Fast Delivery</span>
            </div>
            <div className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5 text-primary" />
              <span>Secure payments</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-3.5 h-3.5 text-primary" />
              <span>No signup required</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
