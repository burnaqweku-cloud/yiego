import { Outlet } from "react-router-dom";
import TopBar from "@/components/layout/TopBar";
import Sidebar from "@/components/layout/Sidebar";
import BottomNav from "@/components/layout/BottomNav";

/**
 * The frame of the whole product: fixed Sidebar (lg+), sticky TopBar,
 * fixed BottomNav (< lg) and a centered, padded content area.
 */
export default function AppShell() {
  return (
    <div className="min-h-dvh bg-background">
      <Sidebar />

      <div className="lg:pl-[264px]">
        <TopBar />
        <main className="mx-auto w-full max-w-[1240px] px-4 pb-28 pt-5 lg:px-10 lg:pb-16 lg:pt-8">
          <Outlet />
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
