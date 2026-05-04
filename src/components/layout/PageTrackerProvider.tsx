import { usePageTracker } from '@/hooks/usePageTracker';

/** Wrapper component that activates page view tracking inside the Router context */
export function PageTrackerProvider({ children }: { children: React.ReactNode }) {
  usePageTracker();
  return <>{children}</>;
}
