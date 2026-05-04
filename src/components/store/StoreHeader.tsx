import { MessageCircle, MapPin, Shield, Store as StoreIcon, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface StoreHeaderProps {
  agent: {
    store_name: string;
    store_description?: string;
    store_logo_url?: string | null;
    region?: string;
    whatsapp_number?: string;
    status: string;
  };
}

const StoreHeader = ({ agent }: StoreHeaderProps) => {
  const whatsappLink = agent.whatsapp_number
    ? `https://wa.me/233${agent.whatsapp_number.replace(/^0/, '')}`
    : null;

  return (
    <header className="bg-gradient-to-b from-card to-background border-b border-border/60 animate-hero-in hero-stagger-1 relative overflow-hidden">
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-primary/5 blur-3xl pointer-events-none" />
      <div className="max-w-2xl mx-auto px-4 py-5 relative">
        {/* Logo + info row */}
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-secondary flex items-center justify-center shrink-0 overflow-hidden ring-1 ring-border shadow-[0_4px_16px_-4px_hsl(var(--primary)/0.15)]">
            {agent.store_logo_url ? (
              <img
                src={agent.store_logo_url}
                alt={agent.store_name}
                className="w-full h-full rounded-2xl object-cover"
                loading="eager"
              />
            ) : (
              <StoreIcon className="w-7 h-7 text-muted-foreground/40" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg font-bold truncate leading-tight tracking-tight">
                {agent.store_name}
              </h1>
              {agent.status === 'active' && (
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-success bg-success/10 ring-1 ring-success/20 px-2 py-0.5 rounded-full whitespace-nowrap">
                  <Shield className="w-3 h-3" /> Verified
                </span>
              )}
            </div>

            {agent.store_description && (
              <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                {agent.store_description}
              </p>
            )}

            {/* Inline chips: region + status + trust */}
            <div className="flex items-center gap-2 flex-wrap mt-2">
              {agent.region && (
                <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground font-medium">
                  <MapPin className="w-3 h-3" /> {agent.region}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-success/10 text-success ring-1 ring-success/20">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-success opacity-75 pulse-dot" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-success" />
                </span>
                Online
              </span>
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
                <Zap className="w-2.5 h-2.5 text-primary" /> Fast Delivery
              </span>
            </div>
          </div>
        </div>

        {/* WhatsApp CTA - smaller */}
        {whatsappLink && (
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 block"
          >
            <Button
              variant="outline"
              className="w-full rounded-xl gap-2 border-success/30 text-success hover:bg-success/5 hover:border-success/50 font-semibold"
              size="default"
            >
              <MessageCircle className="w-4 h-4" />
              Chat on WhatsApp
            </Button>
          </a>
        )}
      </div>
    </header>
  );
};

export default StoreHeader;
