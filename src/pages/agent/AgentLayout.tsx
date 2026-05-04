import { ReactNode, useState } from 'react';
import AgentSidebar from '@/components/agent/AgentSidebar';
import AgentBottomNav from '@/components/agent/AgentBottomNav';
import AgentHeader from '@/components/agent/AgentHeader';
import PageTransition from '@/components/layout/PageTransition';

const AgentLayout = ({ children }: { children: ReactNode }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <AgentHeader onMenuClick={() => setSidebarOpen(true)} />

      <div className="flex flex-1 overflow-hidden">
        <AgentSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main className="flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+80px)] lg:pb-6">
          <PageTransition>
            <div className="p-4 md:p-6 max-w-5xl mx-auto">{children}</div>
          </PageTransition>
        </main>
      </div>

      <AgentBottomNav />
    </div>
  );
};

export default AgentLayout;
