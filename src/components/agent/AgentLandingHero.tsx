import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { ArrowRight, Zap } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSystemStatus } from '@/hooks/useSystemStatus';

const AgentLandingHero = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { status } = useSystemStatus();
  const isOnline = status.online;

  const handleStart = () => {
    if (user) {
      navigate('/become-an-agent');
    } else {
      navigate('/auth?redirect=/become-an-agent');
    }
  };

  return (
    <section className="relative overflow-hidden">
      {/* Background shimmer blobs */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="agent-blob agent-blob-1" />
        <div className="agent-blob agent-blob-2" />
      </div>

      <div className="relative z-10 text-center max-w-2xl mx-auto px-4 pt-12 pb-8 sm:pt-16 sm:pb-12">
        {/* System status pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border card-shadow text-xs font-medium text-muted-foreground mb-6 animate-hero-in hero-stagger-1">
          <span className={`w-2 h-2 rounded-full ${isOnline ? 'bg-emerald-500 pulse-dot' : 'bg-muted-foreground'}`} />
          {isOnline ? `${status.statusText || 'System Online'} • Orders processing normally` : 'Checking status…'}
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-foreground tracking-tight leading-tight animate-hero-in hero-stagger-2">
          Become a{' '}
          <span className="text-gradient">DataSika Agent</span>
        </h1>

        <p className="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed animate-hero-in hero-stagger-3">
          Sell data bundles at discounted agent rates and earn profit on every sale.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8 animate-hero-in hero-stagger-4">
          <Button onClick={handleStart} size="lg" className="w-full sm:w-auto gap-2 btn-press text-base">
            <Zap className="w-4 h-4" />
            Start Application
            <ArrowRight className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
            className="w-full sm:w-auto btn-press text-base"
          >
            Learn how it works
          </Button>
        </div>
      </div>
    </section>
  );
};

export default AgentLandingHero;
