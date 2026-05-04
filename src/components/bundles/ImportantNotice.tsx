import { AlertTriangle, ShieldCheck, Clock, PackageSearch, MessageCircle } from 'lucide-react';

interface ImportantNoticeProps {
  compact?: boolean;
  className?: string;
}

const POINTS = [
  { icon: ShieldCheck, text: 'Double-check the recipient number before paying. Wrong numbers cannot be refunded.' },
  { icon: Clock, text: 'Most orders deliver in a few minutes. During network validation or high traffic, delivery can take longer.' },
  { icon: PackageSearch, text: 'Every order is safely recorded and queued. Track its progress from the Track page or your orders.' },
  { icon: MessageCircle, text: 'Need help? Contact support with your order reference and we\'ll look into it.' },
];

const ImportantNotice = ({ compact = false, className = '' }: ImportantNoticeProps) => {
  if (compact) {
    return (
      <div className={`relative overflow-hidden rounded-2xl border border-border/60 bg-card/70 backdrop-blur-sm p-3.5 ${className}`}>
        <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-primary to-accent/60" />
        <div className="pl-2.5">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary/90">Before you pay</p>
          <p className="text-[11.5px] text-muted-foreground leading-relaxed mt-1">
            Verify the recipient number. Delivery time may vary — your order is safely recorded and trackable.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative overflow-hidden rounded-3xl border border-border/70 bg-card/80 backdrop-blur-md p-5 md:p-6 ${className}`}>
      <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="relative flex items-center gap-2.5 mb-4">
        <div className="w-9 h-9 rounded-xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center">
          <AlertTriangle className="w-4 h-4 text-primary" />
        </div>
        <div>
          <h3 className="text-[15px] font-display font-bold leading-tight">Good to know</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">A quick read before you place an order.</p>
        </div>
      </div>
      <ul className="grid sm:grid-cols-2 gap-2.5">
        {POINTS.map((p, i) => (
          <li key={i} className="flex items-start gap-2.5 p-3 rounded-2xl bg-background/60 border border-border/50">
            <div className="w-7 h-7 rounded-lg bg-primary/8 ring-1 ring-primary/15 flex items-center justify-center shrink-0 mt-0.5">
              <p.icon className="w-3.5 h-3.5 text-primary" />
            </div>
            <span className="text-[12.5px] text-foreground/80 leading-relaxed">{p.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ImportantNotice;
