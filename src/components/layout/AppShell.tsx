import { useEffect } from "react";
import { Outlet, useLocation } from "react-router-dom";
import AuroraBackground from "@/components/fx/AuroraBackground";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import BottomNav from "@/components/layout/BottomNav";

/** Start every page at the top — tab switches shouldn't inherit scroll. */
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname]);
  return null;
}

/**
 * The frame of the whole product: dark canvas + ambient aurora, a fixed
 * rail on desktop, a floating pill nav on mobile, and a padded content
 * column with the top bar.
 */
export default function AppShell() {
  return (
    <div className="onyx-canvas">
      <ScrollToTop />
      <AuroraBackground />

      <div className="relative z-10 mx-auto flex w-full max-w-[1440px]">
        <Sidebar />

        <main className="relative min-w-0 flex-1 px-5 pb-32 pt-6 sm:px-8 lg:px-10 lg:pb-14 lg:pt-9">
          <TopBar />
          <div className="mt-7">
            <Outlet />
          </div>
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
