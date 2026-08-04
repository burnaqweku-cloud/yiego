import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import AuroraBackground from "@/components/fx/AuroraBackground";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import MobileSidebar from "@/components/layout/MobileSidebar";
import AppFooter from "@/components/layout/AppFooter";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }); }, [pathname]);
  return null;
}

export default function AppShell() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  return (
    <div className="onyx-canvas">
      <ScrollToTop />
      <AuroraBackground />
      <div className="relative z-10 mx-auto flex w-full max-w-[1440px]">
        <Sidebar />
        <main className="relative min-w-0 flex-1 px-5 pb-14 pt-6 sm:px-8 lg:px-10 lg:pt-9">
          <TopBar onOpenMenu={() => setMobileMenuOpen(true)} />
          <div className="mt-7"><Outlet /></div>
          <AppFooter />
        </main>
      </div>
      <MobileSidebar open={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
    </div>
  );
}
