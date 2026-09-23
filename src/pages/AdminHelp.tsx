import { useEffect, useState } from "react";
import { Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import AdminPageHeader from "@/components/admin/AdminPageHeader";

/* Edit Help Center articles. Changes are live immediately — no publish. */
interface Row { id?: string; slug: string; audience: string; category: string; title: string; summary: string | null; body: string; keywords: string[]; sort_order: number; is_published: boolean; helpful_yes?: number; helpful_no?: number }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => (supabase as unknown as { schema: (s: string) => any }).schema("phase1");
const blank = (): Row => ({ slug: "", audience: "agents", category: "Money", title: "", summary: "", body: "", keywords: [], sort_order: 100, is_published: true });

export default function AdminHelp() {
  const [rows, setRows] = useState<Row[]>([]);
  const [edit, setEdit] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const load = async () => { const { data } = await db().from("help_articles").select("*").order("category").order("sort_order"); setRows(data ?? []); };
  useEffect(() => { void load(); }, []);
  const save = async () => {
    if (!edit) return; if (!edit.slug.trim() || !edit.title.trim() || !edit.body.trim()) return toast.error("Slug, title and body are required.");
    setBusy(true);
    const payload = { slug: edit.slug.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-"), audience: edit.audience, category: edit.category.trim(), title: edit.title.trim(), summary: edit.summary?.trim() || null, body: edit.body, keywords: edit.keywords, sort_order: Number(edit.sort_order) || 100, is_published: edit.is_published, updated_at: new Date().toISOString() };
    const { error } = edit.id ? await db().from("help_articles").update(payload).eq("id", edit.id) : await db().from("help_articles").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Saved. It's live now."); setEdit(null); void load();
  };
  const remove = async (r: Row) => { if (!r.id || !confirm(`Delete "${r.title}"?`)) return; const { error } = await db().from("help_articles").delete().eq("id", r.id); if (error) return toast.error(error.message); toast.success("Deleted."); void load(); };
  return (
    <div className="space-y-4">
      <AdminPageHeader title="Help Center" description="Articles agents see under Help. Edits go live immediately." action={<button type="button" onClick={() => setEdit(blank())} className="onyx-btn-primary flex items-center gap-1.5 px-4 py-2 text-[13px]"><Plus size={14} />New article</button>} />
      <div className="onyx-panel divide-y divide-white/[0.06] rounded-2xl">
        {rows.map((r) => (
          <button key={r.id} type="button" onClick={() => setEdit(r)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03]">
            <span className="min-w-0 flex-1"><span className="block text-[10.5px] font-semibold uppercase tracking-[0.14em] text-primary-glow">{r.category}{!r.is_published && " · hidden"}</span><span className="block text-[14px] font-medium text-foreground">{r.title}</span><span className="block truncate text-[11.5px] text-faint-foreground">/{r.slug} · {r.keywords.length} keywords</span></span>
            <span className="shrink-0 text-right text-[11.5px] text-muted-foreground">👍 {r.helpful_yes ?? 0} · 👎 {r.helpful_no ?? 0}</span>
          </button>
        ))}
        {rows.length === 0 && <p className="px-4 py-6 text-center text-[13px] text-muted-foreground">No articles yet.</p>}
      </div>
      {edit && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4" onClick={() => setEdit(null)}>
          <div className="onyx-panel max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[17px] font-semibold text-foreground">{edit.id ? "Edit article" : "New article"}</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="text-[12px] text-muted-foreground">Title<input className="onyx-field mt-1 w-full" value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></label>
              <label className="text-[12px] text-muted-foreground">Slug (in the link)<input className="onyx-field mt-1 w-full" value={edit.slug} onChange={(e) => setEdit({ ...edit, slug: e.target.value })} placeholder="available-vs-pending" /></label>
              <label className="text-[12px] text-muted-foreground">Category<input className="onyx-field mt-1 w-full" value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })} list="help-cats" /><datalist id="help-cats">{[...new Set(rows.map((r) => r.category))].map((c) => <option key={c} value={c} />)}</datalist></label>
              <label className="text-[12px] text-muted-foreground">Order (lower shows first)<input type="number" className="onyx-field mt-1 w-full" value={edit.sort_order} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })} /></label>
            </div>
            <label className="mt-3 block text-[12px] text-muted-foreground">One-line summary (shown in the list)<input className="onyx-field mt-1 w-full" value={edit.summary ?? ""} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} /></label>
            <label className="mt-3 block text-[12px] text-muted-foreground">Search keywords, comma-separated (hidden — words agents might type)<input className="onyx-field mt-1 w-full" value={edit.keywords.join(", ")} onChange={(e) => setEdit({ ...edit, keywords: e.target.value.split(",").map((k) => k.trim()).filter(Boolean) })} /></label>
            <label className="mt-3 block text-[12px] text-muted-foreground">Body (Markdown: **bold**, - lists, &gt; quote, | tables |)<textarea className="onyx-field mt-1 min-h-[260px] w-full font-mono text-[12.5px]" value={edit.body} onChange={(e) => setEdit({ ...edit, body: e.target.value })} /></label>
            <label className="mt-3 flex items-center gap-2 text-[13px] text-foreground"><input type="checkbox" checked={edit.is_published} onChange={(e) => setEdit({ ...edit, is_published: e.target.checked })} />Published (visible to agents)</label>
            <div className="mt-5 flex items-center gap-2">
              <button type="button" onClick={() => void save()} disabled={busy} className="onyx-btn-primary flex items-center gap-1.5 px-5 py-2.5 text-[13px]"><Save size={14} />{busy ? "Saving…" : "Save"}</button>
              <button type="button" onClick={() => setEdit(null)} className="rounded-full border border-white/[0.14] px-4 py-2.5 text-[13px] text-foreground">Cancel</button>
              {edit.id && <button type="button" onClick={() => void remove(edit)} className="ml-auto flex items-center gap-1.5 text-[12.5px] text-danger"><Trash2 size={14} />Delete</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
