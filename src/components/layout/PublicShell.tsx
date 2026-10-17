import AgentPopup from "@/components/agents/AgentPopup";
import { AnnouncementStrip } from "@/components/notifications/NotificationBell";
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import PublicNav from "@/components/layout/PublicNav";
import PublicFooter from "@/components/layout/PublicFooter";
import FloatingSupport from "@/components/layout/FloatingSupport";
import "@/styles/site.css";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}

/** Shell for the public site (datayego.com): marketing nav, page, full footer. `.site` scopes its own design. */
export default function PublicShell() {
  return (
    <div className="site onyx-canvas flex min-h-dvh flex-col">
      <ScrollToTop />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <PublicNav />
        <AnnouncementStrip />
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
