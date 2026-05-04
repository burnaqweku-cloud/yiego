import { ReactNode } from 'react';
import DashboardHeader from './DashboardHeader';
import DashboardSidebar from './DashboardSidebar';
import BottomNav from './BottomNav';
import LoyaltyPointsEarnedListener from './LoyaltyPointsEarnedListener';

interface DashboardLayoutProps {
  children: ReactNode;
}

const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  // Auth check is handled by PrivateRoute wrapper
  // NOTE: We intentionally use the document/viewport as the scroll container
  // (not a nested overflow-y-auto <main>). This is critical for iOS Safari:
  // a nested scroll container combined with position:fixed children causes the
  // bottom nav to drift / detach as the dynamic browser chrome collapses.
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <DashboardHeader />
      <div className="flex flex-1 w-full">
        <DashboardSidebar />
        <main className="flex-1 min-w-0 pb-[calc(env(safe-area-inset-bottom,0px)+7.5rem)] md:pb-6">
          <div className="animate-page-in">
            {children}
          </div>
        </main>
      </div>
      <BottomNav />
      <LoyaltyPointsEarnedListener />
    </div>
  );
};

export default DashboardLayout;
