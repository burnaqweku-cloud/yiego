import { Shield, Zap, Globe } from 'lucide-react';

const TRUST_ITEMS = [
  { icon: Shield, label: 'Secure Payment' },
  { icon: Zap, label: 'Fast Delivery' },
  { icon: Globe, label: 'Ghana Networks' },
];

const StoreTrustBar = () => (
  <div className="animate-hero-in hero-stagger-3">
    <div className="flex items-center justify-center gap-4 py-1">
      {TRUST_ITEMS.map(({ icon: Icon, label }) => (
        <div key={label} className="flex items-center gap-1.5">
          <Icon className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground font-medium">{label}</span>
        </div>
      ))}
    </div>
  </div>
);

export default StoreTrustBar;
