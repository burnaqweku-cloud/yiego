import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel, Stat, StatGrid } from "@/components/admin/ui";
import { loadAppStats, type AppStats } from "@/lib/appInstall";

/* The app in numbers: phones that tapped Download, iPhones shown the home-screen steps, and phones
   that opened DataYego as an app. Each phone counts once a day; no personal details are kept. */
export default function AppStatsCard() {
  const [stats, setStats] = useState<AppStats | null>(null);
  const [busy, setBusy] = useState(true); const [failed, setFailed] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    const r = await loadAppStats();
    setStats(r.data); setFailed(Boolean(r.error) || !r.data); setBusy(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const d = stats?.downloads, i = stats?.iphone, u = stats?.users;
  const peak = Math.max(1, ...(stats?.days ?? []).map((x) => Math.max(Number(x.users), Number(x.downloads))));
  return (
    <Panel title="DataYego app" icon={Smartphone} action={<Button variant="ghost" size="sm" onClick={() => void load()} disabled={busy} aria-label="Refresh app numbers" title="Refresh"><RefreshCw size={14} className={busy ? "animate-spin" : ""} /></Button>}>
      {failed ? <p role="alert" className="py-3 text-[12px] text-danger">Couldn’t load the app numbers. Tap refresh.</p> : <>
        <StatGrid cols={4}>
          <Stat loading={busy} label="Android downloads" value={d?.all ?? 0} note={`${d?.today ?? 0} today · ${d?.week ?? 0} in 7 days`} tone="good" />
          <Stat loading={busy} label="iPhone installs started" value={i?.all ?? 0} note={`${i?.today ?? 0} today · ${i?.week ?? 0} in 7 days`} />
          <Stat loading={busy} label="Using the app today" value={u?.today ?? 0} note={`${u?.week ?? 0} in 7 days · ${u?.month ?? 0} in 30 days`} tone="good" />
          <Stat loading={busy} label="Phones with the app" value={u?.all ?? 0} note={`${u?.android ?? 0} Android · ${u?.iphone ?? 0} iPhone · ${u?.signed_in ?? 0} signed in`} />
        </StatGrid>
        {stats && stats.days.length > 0 && <div className="mt-3">
          <p className="mb-1 text-[11px] text-faint-foreground">Last 14 days · people using the app each day</p>
          <div className="flex h-12 items-end gap-1">{[...stats.days].reverse().map((x) => <div key={x.day} title={`${x.day}: ${x.users} using, ${x.downloads} downloads`} className="flex-1 rounded-t bg-primary/70" style={{ height: `${Math.max(4, Math.round((Number(x.users) / peak) * 100))}%`, opacity: Number(x.users) ? 1 : 0.25 }} />)}</div>
        </div>}
        <p className="mt-2 text-[11px] leading-5 text-faint-foreground">{stats?.since ? "Counted since the counters went live. " : "Nothing counted yet. "}A download is a phone that tapped Download APK; it cannot tell us the install finished. “Phones with the app” is the surer number: phones that actually opened it.</p>
      </>}
    </Panel>
  );
}
