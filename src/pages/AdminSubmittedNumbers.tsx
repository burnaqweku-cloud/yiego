import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, PhoneForwarded } from "lucide-react";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Panel, Pill, Rows, Segmented, Stat, StatGrid } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";

/* Numbers people submitted for MTN verification without an order. Separate from the verification queue. */
interface Row { msisdn: string; source: string; status: "pending" | "approved" | "blocked"; dbh_message: string | null; submitted_at: string; submit_count: number; last_checked_at: string | null; approved_at: string | null }
type Filter = "all" | "pending" | "approved" | "blocked";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any };

export default function AdminSubmittedNumbers() {
  const [rows, setRows] = useState<Row[]>([]); const [filter, setFilter] = useState<Filter>("all"); const [loading, setLoading] = useState(true); const [q, setQ] = useState("");
  const load = useCallback(async () => { setLoading(true); const r = await db().from("submitted_numbers").select("*").order("submitted_at", { ascending: false }).limit(1000); setRows(r.data ?? []); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);
  const visible = useMemo(() => rows.filter((r) => (filter === "all" || r.status === filter) && (!q.trim() || r.msisdn.includes(q.trim()))), [rows, filter, q]);
  const tone = (s: Row["status"]) => s === "approved" ? "good" : s === "blocked" ? "bad" : "warn";
  return (
    <div className="space-y-6">
      <AdminPageHeader title="Submitted numbers" description="MTN numbers people submitted for verification from the shop or the checker. No orders here: these are just numbers waiting on MTN. Checked against DBH every hour." action={<Link to="/admin/orders"><Button variant="ghost" size="sm"><ArrowLeft size={14} />Orders</Button></Link>} />
      <StatGrid>
        <Stat loading={loading} label="Submitted" value={rows.length} note="all time" icon={PhoneForwarded} />
        <Stat loading={loading} label="Waiting on MTN" value={rows.filter((r) => r.status === "pending").length} tone="warn" note="re-checked hourly" />
        <Stat loading={loading} label="Approved" value={rows.filter((r) => r.status === "approved").length} tone="good" note="ready for instant delivery" />
        <Stat loading={loading} label="Blocked" value={rows.filter((r) => r.status === "blocked").length} tone={rows.some((r) => r.status === "blocked") ? "bad" : "default"} />
      </StatGrid>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a number" inputMode="numeric" className="onyx-field" />
      <Segmented<Filter> value={filter} onChange={(v) => setFilter(v)} options={[{ value: "all", label: "All" }, { value: "pending", label: "Waiting" }, { value: "approved", label: "Approved" }, { value: "blocked", label: "Blocked" }]} />
      <Panel title="Numbers">
        <Rows empty="No numbers submitted yet.">{visible.map((r) => (
          <li key={r.msisdn} className="flex items-start justify-between gap-3 py-2.5">
            <div className="min-w-0"><p className="font-mono text-[14px] text-foreground">{r.msisdn}</p><p className="text-[11.5px] text-faint-foreground">from {r.source.replace("_", " ")} · {formatAdminDate(r.submitted_at)}{r.approved_at ? ` · approved ${formatAdminDate(r.approved_at)}` : r.last_checked_at ? ` · checked ${formatAdminDate(r.last_checked_at)}` : ""}</p>{r.dbh_message && r.status !== "approved" && <p className="mt-0.5 text-[11.5px] text-faint-foreground">{r.dbh_message}</p>}</div>
            <Pill tone={tone(r.status)}>{r.status === "pending" ? "waiting" : r.status}</Pill>
          </li>))}
        </Rows>
      </Panel>
    </div>
  );
}
