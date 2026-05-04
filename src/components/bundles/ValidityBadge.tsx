import { CalendarDays, Infinity } from 'lucide-react';

interface ValidityBadgeProps {
  network?: string;
  /** @deprecated Use `network` instead */
  days?: number;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}

const sizeClasses = {
  xs: 'text-[9px] px-1.5 py-0.5 gap-0.5',
  sm: 'text-[10px] px-2 py-0.5 gap-1',
  md: 'text-xs px-2.5 py-1 gap-1',
};

const iconSizes = {
  xs: 'w-2.5 h-2.5',
  sm: 'w-3 h-3',
  md: 'w-3.5 h-3.5',
};

/** Returns the validity info for a given network (single source of truth) */
export function getNetworkValidity(network?: string): { label: string; days: number | null } {
  switch (network) {
    case 'MTN':
      return { label: '90-Day Validity', days: 90 };
    case 'AirtelTigo':
      return { label: '60-Day Validity', days: 60 };
    case 'Telecel':
      return { label: 'Non-Expiry', days: null };
    default:
      return { label: '90-Day Validity', days: 90 };
  }
}

/** Returns the validity label for a given network */
export function getValidityLabel(network?: string): string {
  return getNetworkValidity(network).label;
}

/** Returns true if the network's bundles are non-expiry */
export function isNonExpiry(network?: string): boolean {
  return getNetworkValidity(network).days === null;
}

const ValidityBadge = ({ network, days, size = 'sm', className = '' }: ValidityBadgeProps) => {
  // Derive label from network (preferred) or legacy days prop
  let label: string;
  let useInfinityIcon = false;

  if (network) {
    label = getValidityLabel(network);
    useInfinityIcon = isNonExpiry(network);
  } else if (days != null) {
    label = `${days}-Day Validity`;
    useInfinityIcon = false;
  } else {
    label = '90-Day Validity';
    useInfinityIcon = false;
  }

  const Icon = useInfinityIcon ? Infinity : CalendarDays;

  return (
    <span
      className={`inline-flex items-center font-semibold rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ${sizeClasses[size]} ${className}`}
    >
      <Icon className={iconSizes[size]} />
      {label}
    </span>
  );
};

export default ValidityBadge;
