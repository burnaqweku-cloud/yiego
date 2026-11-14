import AgentPopup from "@/components/agents/AgentPopup";
import ServicesPopup from "@/components/services/ServicesPopup";
import { AnnouncementStrip } from "@/components/notifications/NotificationBell";
import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import PublicNav from "@/components/layout/PublicNav";
import PublicFooter from "@/components/layout/PublicFooter";
import AppBanner from "@/components/layout/AppBanner";
import PushPrompt from "@/components/layout/PushPrompt";
import FloatingSupport from "@/components/layout/FloatingSupport";
import { TabBarSpace } from "@/components/layout/MobileTabBar";
import { trackPromoEvent } from "@/lib/promotionAnalytics";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  // Promo-link visitors only (a no-op for everyone else): which pages they open.
  useEffect(() => { void trackPromoEvent("page_view", { path: pathname }); }, [pathname]);
  return null;
}

/** Shell for the public site (datayego.com): marketing nav, page, full footer. `.site` scopes its own design. */
export default function PublicShell() {
  // The buy and top-up sheets open outside `.site`; this flag lets the look reach them (styles/look.css).
  useEffect(() => { document.documentElement.classList.add("yg-look"); return () => document.documentElement.classList.remove("yg-look"); }, []);
  return (
    <div className="site onyx-canvas flex min-h-dvh flex-col">
      <ScrollToTop />
      <div className="relative z-10 flex min-h-dvh flex-col">
        <AppBanner />
        <PushPrompt />
        <PublicNav />
        <AnnouncementStrip />
        <main className="flex-1">
          <Outlet />
          <AgentPopup />
        </main>
        <PublicFooter />
        <TabBarSpace className="lg:hidden" />
      </div>
      <FloatingSupport />
      {/* Out here, not inside the page column: that column is its own layer, and the floating help button would sit on top of the pop-up's button. */}
      <ServicesPopup />
    </div>
  );
}
