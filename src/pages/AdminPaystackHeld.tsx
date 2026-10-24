import { ArrowLeft, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Money, Panel, Row, Rows, Stat, StatGrid } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { formatGHS } from "@/lib/format";
import { usePaystackHeld } from "@/lib/usePaystackHeld";
import { useAuth } from "@/store/auth-context";

const when = (v: string) => new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Accra" }).format(new Date(v));

export default function AdminPaystackHeld() {
  const { user } = useAuth();
  const { reading, held, loading, load, refunds } = usePaystackHeld(!!user);
  const payouts = reading ? [...new Map(reading.settlements.flatMap((g) => g.not_yet_paid).filter((p) => p.currency === "GHS" && ["pending", "processing"].includes(p.status.toLowerCase())).map((p) => [String(p.id), p])).values()] : [];
  return <div className="space-y-6">
    <AdminPageHeader title="Money at Paystack" description={reading ? `Straight from Paystack · read ${when(reading.read_at)}` : "Straight from Paystack."}
      action={<div className="flex gap-2"><Button variant="ghost" size="sm" asChild><Link to="/admin/finance"><ArrowLeft size={14} />Finance</Link></Button><Button variant="ghost" size="sm" onClick={() => void load()} aria-label="Refresh"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /></Button></div>} />
    {loading && !reading && <p className="text-sm text-muted-foreground">Asking Paystack…</p>}
    {!loading && !held && <p role="alert" className="text-sm text-danger">Paystack's figure could not be fully read. Try again.</p>}
    {held && <>
      <StatGrid cols={3}>
        <Stat label="Total at Paystack" value={<Money value={held.total} />} tone="good" note="Counted in profit" />
        <Stat label="Scheduled to receive" value={<Money value={held.scheduledNet} />} note={`${formatGHS(held.scheduledGross)} − charges ${formatGHS(held.scheduledFees)}`} />
        <Stat label="Not yet scheduled" value={<Money value={held.notYetScheduled} />} note="Received, waiting for a payout" />
      </StatGrid>
      <p className="text-xs tabular-nums text-muted-foreground">Scheduled {formatGHS(held.scheduledNet)} + not yet scheduled {formatGHS(held.notYetScheduled)} − refunds not taken back {formatGHS(held.refundsNotTakenBack)} = {formatGHS(held.total)}</p>
      <Panel title="Scheduled payouts">
        <Rows empty="No payout scheduled right now.">{payouts.map((p) => <Row key={String(p.id)} primary={`${formatGHS(p.gross)} scheduled · charges ${formatGHS(p.gross - p.net)}`} secondary={`${p.status}${p.date ? ` · ${when(p.date)}` : ""}`} right={formatGHS(p.net)} tone="good" />)}</Rows>
      </Panel>
      <Panel title="Paystack refunds not yet taken back">
        <Rows empty="None — every Paystack refund has been taken out of a payout.">{refunds.map((r) => <Row key={String(r.id)} primary={`Refund ${r.id} · ${r.status}`} secondary={`${r.created ? when(r.created) : ""} · taken back so far ${formatGHS(r.deducted)}`} right={`− ${formatGHS(r.amount - r.deducted)}`} tone="bad" />)}</Rows>
        <p className="mt-2 text-xs text-muted-foreground">Paystack takes these out of a coming payout. Wallet refunds never appear here.</p>
      </Panel>
    </>}
  </div>;
}
