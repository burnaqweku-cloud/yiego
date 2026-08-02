import BalanceCard from "@/components/dashboard/BalanceCard";
import RecentActivity from "@/components/dashboard/RecentActivity";
import { useProfile } from "@/store/profile";
import { useAuth } from "@/store/auth-context";
import { useFlows } from "@/store/flows";
import { Link } from "react-router-dom";
import { ArrowRight, Search, Wifi } from "lucide-react";

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
  const { isAuthenticated } = useAuth();
  const { openBuyData } = useFlows();
  return (
    <div className="space-y-6 lg:space-y-8">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint-foreground">
          {dateFmt.format(new Date())}
        </p>
        <h1 className="mt-1.5 font-display text-[24px] font-semibold tracking-tight text-white sm:text-[28px]">
          {isAuthenticated ? `${greeting()}, ${profile.firstName}` : "Buy Ghana data in minutes"}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
          Choose a live bundle, enter the recipient number, pay securely and track delivery.
        </p>
      </div>

      {isAuthenticated && <section><BalanceCard /></section>}

      <section className="grid gap-4 min-[480px]:grid-cols-2 lg:grid-cols-[1.12fr_0.88fr]">
        <button type="button" onClick={openBuyData} className="onyx-panel group flex min-h-[220px] flex-col rounded-[26px] p-6 text-left min-[480px]:min-h-[250px] min-[480px]:p-5 sm:p-7">
          <span className="onyx-tile-icon"><Wifi size={22} /></span>
          <h2 className="mt-5 font-display text-xl font-semibold text-white sm:text-2xl">Buy data</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Choose from available MTN, Telecel and AirtelTigo bundles.</p>
          <span className="onyx-ghostlink mt-auto pt-5">Choose a bundle <ArrowRight size={15} /></span>
        </button>
        <Link to="/track-order" className="onyx-panel group flex min-h-[220px] flex-col rounded-[26px] p-6 min-[480px]:min-h-[250px] min-[480px]:p-5 sm:p-7">
          <span className="onyx-tile-icon"><Search size={22} /></span>
          <h2 className="mt-5 font-display text-xl font-semibold text-white sm:text-2xl">Track an order</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">Use your YieGo reference to check payment and delivery status.</p>
          <span className="onyx-ghostlink mt-auto pt-5">Track now <ArrowRight size={15} /></span>
        </Link>
      </section>

      {isAuthenticated && (
        <section><RecentActivity /></section>
      )}
    </div>
  );
}
