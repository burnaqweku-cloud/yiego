import { useEffect, useState } from "react";
import { AppWindow, X } from "lucide-react";
import { toast } from "sonner";
import { p1, useAgent } from "@/components/agent/AgentShell";

/* The recruitment pop-up: invites storefront visitors to sell under this agent. One per store, managed here
   (it also appears, read-only, on Pop-ups). Same engine as the other store pop-ups — delay, how often, which
   pages — and it only shows while "Accept agents" is on. The button opens the store's Join page. */
interface Row { id: string; title: string; body: string | null; button_label: string | null; delay_seconds: number; frequency: "once" | "daily" | "always"; pages: string[]; is_active: boolean; shows: number; clicks: number }
type Form = { title: string; body: string; button_label: string; delay_seconds: number; frequency: Row["frequency"]; pages: string[]; is_active: boolean };
const DELAYS = [0, 2, 5, 10, 20, 30];
const PAGES: Array<[string, string]> = [["all", "Whole store"], ["home", "Home"], ["bundles", "Bundles"], ["other", "Other pages"]];
const FREQ: Array<[Row["frequency"], string, string]> = [["once", "Once per visitor", "shows one time on each phone or computer"], ["daily", "Once a day", "comes back the next day if they haven't joined"], ["always", "Every visit", "each time they open your store"]];

export default function RecruitPopup({ programmeOn }: { programmeOn: boolean }) {
  const { agent } = useAgent();
  const defaults: Form = { title: `Sell data under ${agent.store_name}`, body: "Get your own store, buy at agent prices and keep the profit on every bundle you sell. Free to join.", button_label: "Become an agent", delay_seconds: 5, frequency: "once", pages: ["all"], is_active: true };
  const [row, setRow] = useState<Row | null>(null); const [f, setF] = useState<Form>(defaults); const [busy, setBusy] = useState(false); const [loaded, setLoaded] = useState(false);
  const load = async () => {
    const { data } = await p1().from("store_popups").select("id, title, body, button_label, delay_seconds, frequency, pages, is_active, shows, clicks").eq("purpose", "recruit").maybeSingle();
    const r = (data as Row | null) ?? null; setRow(r); setLoaded(true);
    if (r) setF({ title: r.title, body: r.body ?? "", button_label: r.button_label ?? "Become an agent", delay_seconds: r.delay_seconds ?? 5, frequency: r.frequency, pages: r.pages?.length ? r.pages : ["all"], is_active: r.is_active });
  };
  useEffect(() => { void load(); }, []);

  const save = async (patch?: Partial<Form>) => {
    const next = { ...f, ...patch };
    if (!next.title.trim()) return toast.error("Give the pop-up a title.");
    setBusy(true);
    const { data, error } = await p1().rpc("agent_recruit_popup_save", { p: next });
    setBusy(false);
    if (error) return toast.error(error.message.replace(/_/g, " "));
    const r = data as Row; setRow(r); setF(next);
    toast.success(!next.is_active ? "Pop-up is off." : programmeOn ? "Pop-up is live on your store." : "Saved. It shows once you switch Accept agents on.");
  };
  const togglePage = (pg: string) => setF((x) => { if (pg === "all") return { ...x, pages: ["all"] }; const set = new Set(x.pages.filter((p) => p !== "all")); if (set.has(pg)) set.delete(pg); else set.add(pg); return { ...x, pages: set.size ? [...set] : ["all"] }; });
  const live = !!row && row.is_active && programmeOn;
  const dirty = !row || row.title !== f.title || (row.body ?? "") !== f.body || (row.button_label ?? "") !== f.button_label || row.delay_seconds !== f.delay_seconds || row.frequency !== f.frequency || (row.pages ?? []).join() !== f.pages.join() || row.is_active !== f.is_active;

  if (!loaded) return <p className="text-[13px] text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div><p className="text-[13.5px] font-semibold text-foreground">Invite visitors to become your agent</p><p className="text-[12px] text-muted-foreground">A small card appears on your store after a few seconds. Its button opens your Join page.</p></div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${live ? "bg-primary/15 text-primary-glow" : "bg-white/[0.06] text-muted-foreground"}`}>{live ? "live" : row && row.is_active ? "waiting" : "off"}</span>
      </div>
      {!programmeOn && <p className="rounded-xl bg-amber/10 px-3 py-2 text-[12px] text-amber">Switch <b>Accept agents</b> on above — the pop-up only shows while you're taking agents.</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-3">
          <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">Title</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value.slice(0, 60) })} className="onyx-field w-full" /><span className="mt-1 block text-right text-[11px] text-faint-foreground">{f.title.length}/60</span></label>
          <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">Message</span><textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value.slice(0, 240) })} rows={3} className="onyx-field w-full resize-y" /><span className="mt-1 block text-right text-[11px] text-faint-foreground">{f.body.length}/240</span></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">Button label</span><input value={f.button_label} onChange={(e) => setF({ ...f, button_label: e.target.value.slice(0, 30) })} className="onyx-field w-full" /></label>
            <label className="block"><span className="mb-1 block text-[12px] font-semibold text-foreground">Show after</span><select value={f.delay_seconds} onChange={(e) => setF({ ...f, delay_seconds: Number(e.target.value) })} className="onyx-field w-full">{DELAYS.map((n) => <option key={n} value={n}>{n === 0 ? "Immediately" : `${n} seconds on the page`}</option>)}</select></label>
          </div>
          <div><span className="mb-1 block text-[12px] font-semibold text-foreground">How often</span>
            <div className="grid gap-2 sm:grid-cols-3">{FREQ.map(([v, label, hint]) => <button key={v} type="button" onClick={() => setF({ ...f, frequency: v })} className={`rounded-xl border px-3 py-2 text-left ${f.frequency === v ? "border-primary/50 bg-primary/10" : "border-white/[0.08]"}`}><span className={`block text-[13px] font-semibold ${f.frequency === v ? "text-primary-glow" : "text-foreground"}`}>{label}</span><span className="block text-[11px] text-faint-foreground">{hint}</span></button>)}</div>
          </div>
          <div><span className="mb-1 block text-[12px] font-semibold text-foreground">Where</span><div className="flex flex-wrap gap-2">{PAGES.map(([id, label]) => <button key={id} type="button" onClick={() => togglePage(id)} className={`rounded-full px-3 py-1.5 text-[12.5px] font-medium ${f.pages.includes(id) ? "bg-primary/20 text-primary-glow" : "border border-white/[0.08] text-muted-foreground"}`}>{label}</button>)}</div><p className="mt-1 text-[11px] text-faint-foreground">Never on sign-in, account, tracking or payment pages, and not on the Join page itself. People who are already agents don't see it.</p></div>
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint-foreground">Preview</p>
          <div className="rounded-2xl bg-black/50 p-3">
            <div className="onyx-panel rounded-2xl p-4">
              <div className="flex items-start justify-between gap-2"><h3 className="font-display text-[17px] font-semibold leading-tight text-foreground">{f.title || "Title"}</h3><X size={15} className="mt-0.5 shrink-0 text-muted-foreground" /></div>
              {f.body && <p className="mt-1.5 whitespace-pre-line text-[12.5px] leading-5 text-muted-foreground">{f.body}</p>}
              <div className="onyx-btn-primary mt-3 w-full py-2.5 text-center text-[13px]">{f.button_label || "Become an agent"}</div>
            </div>
          </div>
          {row && <p className="mt-2 text-[11.5px] text-faint-foreground">{row.shows.toLocaleString()} shown · {row.clicks.toLocaleString()} tapped{row.shows ? ` · ${Math.round((row.clicks / row.shows) * 100)}%` : ""}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.06] pt-3">
        <label className="flex items-center gap-2 text-[13px] text-foreground"><input type="checkbox" checked={f.is_active} onChange={(e) => { const on = e.target.checked; setF({ ...f, is_active: on }); if (row) void save({ is_active: on }); }} className="h-4 w-4" />Show this pop-up on my store</label>
        <button type="button" disabled={busy || !dirty} onClick={() => void save()} className="onyx-btn-primary px-4 py-2 text-[13px] disabled:opacity-50"><AppWindow size={14} className="mr-1.5 inline" />{busy ? "Saving…" : row ? "Save changes" : "Put it on my store"}</button>
      </div>
    </div>
  );
}
