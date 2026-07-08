import BalanceCard from "@/components/dashboard/BalanceCard";
import FlowPanel from "@/components/dashboard/FlowPanel";
import QuickActions from "@/components/dashboard/QuickActions";
import ServicesSection from "@/components/dashboard/ServicesSection";
import DeveloperCard from "@/components/dashboard/DeveloperCard";
import RecentActivity from "@/components/dashboard/RecentActivity";
import { useProfile } from "@/store/profile";

const dateFmt = new Intl.DateTimeFormat("en-GH", {
  weekday: "long",
  day: "numeric",
  month: "long",
});

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const { profile } = useProfile();
  return (
    <div className="space-y-6 lg:space-y-8">
      {/* Personal greeting */}
      <div className="onyx-rise">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint-foreground">
          {dateFmt.format(new Date())}
        </p>
        <h1 className="mt-1.5 font-display text-[22px] font-semibold tracking-tight text-white sm:text-[26px]">
          {greeting()}, {profile.firstName}
        </h1>
      </div>

      {/* Hero — the wallet jewel beside the live flow */}
      <section
        className="onyx-rise grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_1fr]"
        style={{ animationDelay: "60ms" }}
      >
        <BalanceCard />
        <FlowPanel />
      </section>

      <section className="onyx-rise" style={{ animationDelay: "120ms" }}>
        <QuickActions />
      </section>

      <section className="onyx-rise" style={{ animationDelay: "180ms" }}>
        <ServicesSection />
      </section>

      <section className="grid grid-cols-1 gap-5 xl:grid-cols-[1.25fr_1fr]">
        <DeveloperCard />
        <RecentActivity />
      </section>
    </div>
  );
}
