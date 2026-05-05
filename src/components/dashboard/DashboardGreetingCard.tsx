import { User, ShieldCheck, Sparkles } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface DashboardGreetingCardProps {
  name: string;
  isAgent?: boolean;
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

const DashboardGreetingCard = ({ name, isAgent }: DashboardGreetingCardProps) => {
  const greeting = getGreeting();
  const trimmed = (name || '').trim();
  const firstName = trimmed && trimmed.toLowerCase() !== 'user' ? trimmed.split(/\s+/)[0] : '';

  return (
    <div
      className="relative rounded-2xl p-5 md:p-6 overflow-hidden card-shine-effect"
      style={{
        background: 'linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--gold-glow)) 100%)',
        boxShadow: '0 8px 32px hsl(var(--primary) / 0.25), inset 0 1px 0 hsl(0 0% 100% / 0.15)',
      }}
    >
      {/* Layered decorative elements */}
      <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
      <div className="absolute -bottom-8 -left-8 w-28 h-28 rounded-full bg-black/10 blur-xl" />
      <div className="absolute top-3 right-3 opacity-30">
        <Sparkles className="w-4 h-4 text-primary-foreground" />
      </div>

      <div className="relative flex items-center gap-3.5">
        <div className="w-12 h-12 rounded-xl bg-white/15 flex items-center justify-center shrink-0 backdrop-blur-sm border border-white/10">
          <User className="w-5 h-5 text-primary-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-lg md:text-xl font-display font-bold text-primary-foreground truncate">
            {greeting}, {firstName} <span className="wave-emoji">👋</span>
          </h1>
          <p className="text-xs text-primary-foreground/70 font-medium mt-0.5 tracking-wide">
            Fast Data Delivery Platform
          </p>
        </div>
        {isAgent && (
          <Badge className="bg-white/20 text-primary-foreground border border-white/15 text-[10px] gap-1 shrink-0 backdrop-blur-sm">
            <ShieldCheck className="w-3 h-3" /> Agent
          </Badge>
        )}
      </div>
    </div>
  );
};

export default DashboardGreetingCard;
