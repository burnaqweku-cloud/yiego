import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Handshake } from "lucide-react";
import { formatGHS } from "@/lib/format";
import { loadPartnerDashboard, type PartnerDashboard } from "@/lib/partners";

/** Shown only to partners: a shortcut to their dashboard. */
export default function PartnerEntry() {
  const [d, setD] = useState<PartnerDashboard | null>(null);
  useEffect(() => { void loadPartnerDashboard().then(({ data }) => setD(data ?? null)); }, []);
  if (!d) return null;
  return (
    <Link to="/partner" className="onyx-panel flex items-center justify-between gap-3 rounded-[20px] p-4">
      <span className="flex items-center gap-3"><Handshake size={18} className="text-primary" /><span><b>Partner dashboard</b><span className="block text-xs text-muted-foreground">{d.orders_week} orders this week</span></span></span>
      <span className="font-semibold">{formatGHS(Number(d.owed))}</span>
    </Link>
  );
}
