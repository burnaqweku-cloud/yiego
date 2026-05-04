/**
 * YieGo Premium Loading Indicator
 * A branded pulse-ring animation with gold accents
 */

import { cn } from '@/lib/utils';

export interface YieGoLoaderProps {
  size?: 'sm' | 'md' | 'lg';
  text?: string;
  label?: string;
  className?: string;
  fullScreen?: boolean;
}

const sizeMap = {
  sm: { ring: 'w-8 h-8', dot: 'w-2.5 h-2.5', text: 'text-xs' },
  md: { ring: 'w-14 h-14', dot: 'w-4 h-4', text: 'text-sm' },
  lg: { ring: 'w-20 h-20', dot: 'w-5 h-5', text: 'text-base' },
};

const YieGoLoader = ({ size = 'md', text, label, className, fullScreen }: YieGoLoaderProps) => {
  const s = sizeMap[size];
  const displayText = text || label;

  const loader = (
    <div className={cn('flex flex-col items-center justify-center gap-3', className)}>
      <div className={cn('datasika-loader relative', s.ring)}>
        {/* Outer spinning ring */}
        <div className="datasika-ring absolute inset-0 rounded-full" />
        {/* Inner pulsing dot */}
        <div className={cn('datasika-dot absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary', s.dot)} />
      </div>
      {displayText && (
        <p className={cn('text-muted-foreground font-medium animate-pulse', s.text)}>{displayText}</p>
      )}
    </div>
  );

  if (fullScreen) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        {loader}
      </div>
    );
  }

  return loader;
};

export default YieGoLoader;
