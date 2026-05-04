import { AlertTriangle } from 'lucide-react';

interface ImportantNoticeProps {
  compact?: boolean;
  className?: string;
}

const ImportantNotice = ({ compact = false, className = '' }: ImportantNoticeProps) => {
  const items = [
    { text: 'Delivery times may vary based on network conditions and order volume.', bold: true },
    { text: 'Phone number must not owe airtime.' },
    { text: 'This service does not work on Turbonet SIM cards.' },
    { text: 'Do not place another order for the same number until the current order is completed.' },
    { text: 'No refunds for wrong numbers. Double-check the number before you pay.' },
  ];

  if (compact) {
    return (
      <div className={`bg-accent/8 border border-accent/20 rounded-xl p-3 ${className}`}>
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-accent mt-0.5 shrink-0" />
          <div className="space-y-0.5">
            <p className="text-[11px] font-semibold text-foreground">Important Notice</p>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              <strong>Delivery times may vary.</strong> Phone must not owe airtime. No refunds for wrong numbers.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-accent/8 border border-accent/20 rounded-2xl p-4 md:p-5 ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle className="w-4 h-4 text-accent shrink-0" />
        <h3 className="text-sm font-bold text-foreground">Important Notice</h3>
      </div>
      <ul className="space-y-1.5 text-xs text-muted-foreground leading-relaxed">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="text-accent mt-0.5 shrink-0">•</span>
            {item.bold ? (
              <span className="font-semibold text-foreground">{item.text}</span>
            ) : (
              <span>{item.text}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

export default ImportantNotice;
