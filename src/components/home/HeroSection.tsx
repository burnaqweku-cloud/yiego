import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Wallet, Shield, Smartphone, Receipt, Gift } from 'lucide-react';

const HeroSection = () => {
  return (
    <section className="hero-gradient relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="hero-glow hero-glow-1" style={{ background: 'hsl(156 78% 46%)' }} />
        <div className="hero-glow hero-glow-2" style={{ background: 'hsl(42 96% 58%)' }} />
        <div className="hero-glow hero-glow-3" style={{ background: 'hsl(156 78% 60%)' }} />
      </div>

      <div className="container relative py-16 md:py-28 lg:py-32">
        <div className="max-w-3xl mx-auto text-center">
          <div className="hero-stagger-1 animate-hero-in">
            <div className="inline-flex items-center gap-2 bg-white/8 border border-white/10 rounded-full px-5 py-2.5 mb-8">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full rounded-full opacity-75 pulse-dot bg-success" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success" />
              </span>
              <span className="text-white/70 text-sm font-medium tracking-wide">
                Your everyday digital plug
              </span>
            </div>
          </div>

          <h1 className="hero-stagger-2 animate-hero-in text-4xl md:text-5xl lg:text-6xl font-display font-extrabold text-white leading-[1.08] mb-6 tracking-tight">
            One simple wallet for
            <br />
            <span className="text-gradient">everyday digital services</span>
          </h1>

          <p className="hero-stagger-3 animate-hero-in text-base md:text-lg text-white/60 mb-10 max-w-xl mx-auto leading-relaxed">
            Buy data and airtime, pay bills, get gift cards, boost socials, manage subscriptions and more — all from one secure YieGo account.
          </p>

          <div className="hero-stagger-4 animate-hero-in flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/auth?tab=signup">
              <Button variant="hero" className="gap-2.5 btn-press w-full sm:w-auto">
                Get Started
                <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
            <Link to="/buy-data">
              <Button variant="hero-outline" className="gap-2.5 btn-press w-full sm:w-auto">
                <Smartphone className="w-4 h-4" />
                Explore Services
              </Button>
            </Link>
          </div>

          <div className="hero-stagger-5 animate-hero-in flex flex-wrap items-center justify-center gap-x-6 gap-y-3 mt-12 text-white/50 text-xs font-medium">
            <div className="flex items-center gap-2"><Smartphone className="w-3.5 h-3.5 text-primary" /><span>Data &amp; Airtime</span></div>
            <div className="flex items-center gap-2"><Receipt className="w-3.5 h-3.5 text-primary" /><span>Bills</span></div>
            <div className="flex items-center gap-2"><Gift className="w-3.5 h-3.5 text-primary" /><span>Gift Cards</span></div>
            <div className="flex items-center gap-2"><Wallet className="w-3.5 h-3.5 text-primary" /><span>Wallet</span></div>
            <div className="flex items-center gap-2"><Shield className="w-3.5 h-3.5 text-primary" /><span>Secure payments</span></div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
