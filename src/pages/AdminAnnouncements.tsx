import { useCallback, useEffect, useState } from "react";
import { Megaphone, Send } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Field, Panel, Pill, Row, Rows, Segmented, inputCls } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import Modal from "@/components/ui/modal";
import { supabase } from "@/integrations/supabase/client";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";
import { useAuth } from "@/store/auth-context";

/* Announcements: what customers, agents and visitors see in their bell /
   strip, and (optionally) get by email. */
interface Ann { id: string; title: string; body: string; audience: "everyone" | "customers" | "agents" | "guests"; kind: "update" | "price" | "notice" | "warning"; link_url: string | null; link_label: string | null; starts_at: string; ends_at: string | null; is_pinned: boolean; is_active: boolean; emailed_at: string | null; created_at: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => adminDatabase() as unknown as { from: (t: string) => any; rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
const AUD: Record<Ann["audience"], string> = { everyone: "Everyone", customers: "Customers", agents: "Agents", guests: "Visitors (not signed in)" };
const KIND: Record<Ann["kind"], string> = { update: "Update", price: "Price change", notice: "Notice", warning: "Important" };
const toLocal = (iso: string | null) => iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
const blank = (): Partial<Ann> => ({ title: "", body: "", audience: "everyone", kind: "update", link_url: "", link_label: "", is_pinned: false, is_active: true, starts_at: new Date().toISOString(), ends_at: null });

export default function AdminAnnouncements() {
  const { user } = useAuth(); const actor = user?.id ?? "";
  const [list, setList] = useState<Ann[]>([]); const [stats, setStats] = useState<Record<string, { reads: number }>>({});
  const [edit, setEdit] = useState<Partial<Ann> | null>(null); const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"live" | "all">("live");
  const load = useCallback(async () => {
    const [a, s] = await Promise.all([db().from("announcements").select("*").order("is_pinned", { ascending: false }).order("starts_at", { ascending: false }).limit(200), db().rpc("admin_announcement_stats", { p_actor: actor })]);
    setList(a.data ?? []); setStats((s.data as Record<string, { reads: number }>) ?? {});
  }, [actor]);
  useEffect(() => { void load(); }, [load]);
  const live = (a: Ann) => a.is_active && new Date(a.starts_at) <= new Date() && (!a.ends_at || new Date(a.ends_at) > new Date());
  const shown = list.filter((a) => filter === "all" || live(a));

  const save = async () => {
    if (!edit?.title?.trim() || !edit.body?.trim()) return toast.error("Title and message are needed.");
    setBusy(true);
    const { error } = await db().rpc("admin_save_announcement", { p_actor: actor, p_id: edit.id ?? null, p_title: edit.title, p_body: edit.body, p_audience: edit.audience, p_kind: edit.kind, p_link_url: edit.link_url ?? null, p_link_label: edit.link_label ?? null, p_starts_at: edit.starts_at ?? null, p_ends_at: edit.ends_at ?? null, p_pinned: edit.is_pinned ?? false, p_active: edit.is_active ?? true });
    setBusy(false); if (error) return toast.error(error.message); toast.success("Saved. It's live for its audience now."); setEdit(null); void load();
  };
  const sendEmail = async (a: Ann) => {
    if (!window.confirm(`Email this to ${AUD[a.audience].toLowerCase()}? ${a.emailed_at ? "It was already emailed once." : ""}`)) return;
    const { data, error } = await supabase.functions.invoke<{ sent?: number; error?: string }>("announce-email", { body: { announcementId: a.id } });
    const err = data?.error ?? error?.message; if (err) return toast.error(err);
    toast.success(`Emailed to ${data?.sent ?? 0} people.`); void load();
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Announcements" description="What people see in their notifications bell — updates, price changes, notices. Agents, customers or everyone." action={<Button size="sm" onClick={() => setEdit(blank())}><Megaphone size={14} />New announcement</Button>} />
      <Segmented<"live" | "all"> value={filter} onChange={setFilter} options={[{ value: "live", label: "Live now" }, { value: "all", label: "All" }]} />
      <Panel title="Announcements" note={`${shown.length} shown`}>
        <Rows empty="Nothing yet. Post your first announcement.">
          {shown.map((a) => <Row key={a.id} onClick={() => setEdit({ ...a })} primary={<>{a.title} <Pill tone={a.kind === "warning" ? "bad" : a.kind === "price" ? "warn" : "good"}>{KIND[a.kind]}</Pill>{a.is_pinned && <Pill tone="muted">pinned</Pill>}{!live(a) && <Pill tone="muted">{a.is_active ? "scheduled / ended" : "off"}</Pill>}</>} secondary={`${AUD[a.audience]} · from ${formatAdminDate(a.starts_at)}${a.ends_at ? ` to ${formatAdminDate(a.ends_at)}` : ""}${a.emailed_at ? ` · emailed ${formatAdminDate(a.emailed_at)}` : ""}`} right={`${stats[a.id]?.reads ?? 0}`} rightNote="read" />)}
        </Rows>
      </Panel>

      <Modal open={edit !== null} onClose={() => setEdit(null)} label="Announcement">
        <div className="w-[min(94vw,520px)] space-y-2.5 p-5">
          <h2 className="text-[16px] font-semibold text-foreground">{edit?.id ? "Edit announcement" : "New announcement"}</h2>
          <Field label="Title"><input value={edit?.title ?? ""} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="MTN prices reduced" className={inputCls} /></Field>
          <Field label="Message"><textarea value={edit?.body ?? ""} onChange={(e) => setEdit({ ...edit, body: e.target.value })} rows={4} placeholder="Short and clear. Line breaks are kept." className={`${inputCls} resize-y`} /></Field>
          <div className="grid gap-2 sm:grid-cols-2">
            <Field label="Who sees it"><select value={edit?.audience ?? "everyone"} onChange={(e) => setEdit({ ...edit, audience: e.target.value as Ann["audience"] })} className={inputCls}>{(Object.keys(AUD) as Ann["audience"][]).map((k) => <option key={k} value={k}>{AUD[k]}</option>)}</select></Field>
            <Field label="Type"><select value={edit?.kind ?? "update"} onChange={(e) => setEdit({ ...edit, kind: e.target.value as Ann["kind"] })} className={inputCls}>{(Object.keys(KIND) as Ann["kind"][]).map((k) => <option key={k} value={k}>{KIND[k]}</option>)}</select></Field>
            <Field label="Link (optional)"><input value={edit?.link_url ?? ""} onChange={(e) => setEdit({ ...edit, link_url: e.target.value })} placeholder="https://…" className={inputCls} /></Field>
            <Field label="Link text"><input value={edit?.link_label ?? ""} onChange={(e) => setEdit({ ...edit, link_label: e.target.value })} placeholder="See prices" className={inputCls} /></Field>
            <Field label="Show from"><input type="datetime-local" value={toLocal(edit?.starts_at ?? null)} onChange={(e) => setEdit({ ...edit, starts_at: e.target.value ? new Date(e.target.value).toISOString() : undefined })} className={inputCls} /></Field>
            <Field label="Until (optional)"><input type="datetime-local" value={toLocal(edit?.ends_at ?? null)} onChange={(e) => setEdit({ ...edit, ends_at: e.target.value ? new Date(e.target.value).toISOString() : null })} className={inputCls} /></Field>
          </div>
          <div className="flex flex-wrap gap-4 text-[12.5px]"><label className="flex items-center gap-2"><input type="checkbox" checked={edit?.is_pinned ?? false} onChange={(e) => setEdit({ ...edit, is_pinned: e.target.checked })} />Pin to top</label><label className="flex items-center gap-2"><input type="checkbox" checked={edit?.is_active ?? true} onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })} />Live</label></div>
          <div className="mt-2 flex items-center justify-between gap-2">
            {edit?.id ? <Button variant="quiet" size="sm" onClick={() => edit && void sendEmail(edit as Ann)}><Send size={13} />Email to {AUD[(edit.audience ?? "everyone") as Ann["audience"]].toLowerCase()}</Button> : <span />}
            <div className="flex gap-2"><Button variant="quiet" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={() => void save()} disabled={busy}>Save</Button></div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
