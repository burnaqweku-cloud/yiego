import AgentPopup from "@/components/agents/AgentPopup";
import { AnnouncementStrip } from "@/components/notifications/NotificationBell";
import { useAuth } from "@/store/auth-context";
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import AuroraBackground from "@/components/fx/AuroraBackground";
import PublicNav from "@/components/layout/PublicNav";
import PublicFooter from "@/components/layout/PublicFooter";
import FloatingSupport from "@/components/layout/FloatingSupport";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}

/** Shell for the public site: marketing nav, page, full footer. */
export default function PublicShell() {
  const { isAuthenticated } = useAuth();
  return (
    <div className="onyx-canvas flex min-h-dvh flex-col">
      <ScrollToTop />
      <AuroraBackground />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <PublicNav />
        {!isAuthenticated && <AnnouncementStrip />}
        <main className="flex-1">
          <Outlet />
          <AgentPopup />
        </main>
        <PublicFooter />
      </div>
      <FloatingSupport />
    </div>
  );
}
