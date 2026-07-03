import BalanceCard from "@/components/dashboard/BalanceCard";
import QuickActions from "@/components/dashboard/QuickActions";
import ServicesSection from "@/components/dashboard/ServicesSection";
import PaymentsPromo from "@/components/dashboard/PaymentsPromo";
import RecentActivity from "@/components/dashboard/RecentActivity";

export default function Dashboard() {
  return (
    <div className="space-y-6 lg:grid lg:grid-cols-[1fr_340px] lg:items-start lg:gap-7 lg:space-y-0 xl:grid-cols-[1fr_380px]">
      <div className="space-y-6 lg:space-y-7">
        <div className="animate-fade-up">
          <BalanceCard />
        </div>
        <div className="animate-fade-up" style={{ animationDelay: "60ms" }}>
          <QuickActions />
        </div>
        <div className="animate-fade-up" style={{ animationDelay: "120ms" }}>
          <ServicesSection />
        </div>
      </div>

      <div className="space-y-6 lg:space-y-7">
        <div className="animate-fade-up" style={{ animationDelay: "180ms" }}>
          <PaymentsPromo />
        </div>
        <div className="animate-fade-up" style={{ animationDelay: "240ms" }}>
          <RecentActivity />
        </div>
      </div>
    </div>
  );
}
