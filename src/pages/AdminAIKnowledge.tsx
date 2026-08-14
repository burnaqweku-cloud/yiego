import { useEffect, useMemo, useState } from "react";
import { BookOpen, Eye, Loader2, Pencil, Plus, Save, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import AdminStatStrip from "@/components/admin/AdminStatStrip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";

interface KnowledgeEntry { id: string; category: string; title: string; content: string; is_active: boolean; sort_order: number; updated_at: string; }
interface KnowledgeResponse { entries?: KnowledgeEntry[]; entry?: KnowledgeEntry; text?: string; active_entries?: number; approx_tokens?: number; error?: string; }

type Draft = { id?: string; category: string; title: string; content: string; is_active: boolean };
const emptyDraft: Draft = { category: "", title: "", content: "", is_active: true };

export default function AdminAIKnowledge() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ text: string; tokens: number } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase.functions.invoke<KnowledgeResponse>("ai-support", { body: { action: "list_knowledge" } });
      if (cancelled) return;
      if (error || data?.error) toast.error(data?.error ?? error?.message ?? "Could not load the knowledge base.");
      else setEntries(data?.entries ?? []);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const categories = useMemo(() => [...new Set(entries.map((entry) => entry.category))], [entries]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return entries;
    return entries.filter((entry) => `${entry.category} ${entry.title} ${entry.content}`.toLowerCase().includes(needle));
  }, [entries, query]);
  const grouped = useMemo(() => {
    const map = new Map<string, KnowledgeEntry[]>();
    for (const entry of filtered) map.set(entry.category, [...(map.get(entry.category) ?? []), entry]);
    return [...map.entries()];
  }, [filtered]);

  const activeCount = entries.filter((entry) => entry.is_active).length;

  const save = async () => {
    if (!draft) return;
    if (!draft.category.trim() || !draft.title.trim() || !draft.content.trim()) { toast.error("Category, title and content are all required."); return; }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke<KnowledgeResponse>("ai-support", {
      body: { action: "save_knowledge", id: draft.id, category: draft.category.trim(), title: draft.title.trim(), content: draft.content.trim(), is_active: draft.is_active },
    });
    setSaving(false);
    if (error || data?.error || !data?.entry) { toast.error(data?.error ?? error?.message ?? "The entry could not be saved."); return; }
    const saved = data.entry;
    setEntries((current) => draft.id ? current.map((entry) => entry.id === saved.id ? saved : entry) : [...current, saved]);
    setDraft(null);
    setPreview(null);
    toast.success(draft.id ? "Entry updated. The assistant uses it from its next reply." : "Entry added. The assistant uses it from its next reply.");
  };

  const toggleActive = async (entry: KnowledgeEntry) => {
    const { data, error } = await supabase.functions.invoke<KnowledgeResponse>("ai-support", {
      body: { action: "save_knowledge", id: entry.id, category: entry.category, title: entry.title, content: entry.content, is_active: !entry.is_active },
    });
    if (error || data?.error || !data?.entry) { toast.error(data?.error ?? error?.message ?? "The entry could not be updated."); return; }
    const saved = data.entry;
    setEntries((current) => current.map((item) => item.id === saved.id ? saved : item));
    setPreview(null);
  };

  const remove = async (entry: KnowledgeEntry) => {
    if (!window.confirm(`Delete "${entry.title}"? The assistant stops knowing this immediately.`)) return;
    setDeleting(entry.id);
    const { data, error } = await supabase.functions.invoke<KnowledgeResponse>("ai-support", { body: { action: "delete_knowledge", id: entry.id } });
    setDeleting(null);
    if (error || data?.error) { toast.error(data?.error ?? error?.message ?? "The entry could not be deleted."); return; }
    setEntries((current) => current.filter((item) => item.id !== entry.id));
    setPreview(null);
    toast.success("Entry deleted.");
  };

  const loadPreview = async () => {
    setPreviewLoading(true);
    const { data, error } = await supabase.functions.invoke<KnowledgeResponse>("ai-support", { body: { action: "preview_knowledge" } });
    setPreviewLoading(false);
    if (error || data?.error) { toast.error(data?.error ?? error?.message ?? "Could not load the preview."); return; }
    setPreview({ text: data?.text ?? "", tokens: data?.approx_tokens ?? 0 });
  };

  if (loading) return <div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin text-primary-glow" /></div>;

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="AI support" title="Knowledge base" description="Everything the assistant knows about DataYego. Add, correct or disable entries — changes reach customers on the assistant's very next reply, no deploy needed." />
    <AdminStatStrip items={[
      { label: "Entries", value: String(entries.length) },
      { label: "Active", value: String(activeCount), tone: activeCount > 0 ? "success" : "warning" },
      { label: "Categories", value: String(categories.length) },
    ]} />

    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="relative w-full sm:max-w-xs">
        <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint-foreground" />
        <input className="onyx-field w-full pl-9" placeholder="Search the knowledge base…" value={query} onChange={(event) => setQuery(event.target.value)} />
      </div>
      <Button onClick={() => setDraft({ ...emptyDraft })} disabled={Boolean(draft)}><Plus size={17} />Add knowledge</Button>
    </div>

    {draft && <Card><CardContent>
      <div className="flex items-center justify-between"><h2 className="font-display text-lg font-semibold text-white">{draft.id ? "Edit entry" : "New entry"}</h2><Button variant="ghost" size="sm" onClick={() => setDraft(null)}><X size={16} />Cancel</Button></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Category</span>
          <input className="onyx-field w-full" list="knowledge-categories" maxLength={60} placeholder="e.g. Payments and wallet" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} />
          <datalist id="knowledge-categories">{categories.map((category) => <option key={category} value={category} />)}</datalist>
        </label>
        <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Title — the question or topic</span>
          <input className="onyx-field w-full" maxLength={200} placeholder="e.g. Do bundles expire?" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
        </label>
      </div>
      <label className="mt-4 block"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">What the assistant should know — write it as the answer you'd give a customer</span>
        <textarea className="onyx-field min-h-32 w-full resize-y" maxLength={4000} value={draft.content} onChange={(event) => setDraft({ ...draft, content: event.target.value })} />
      </label>
      <label className="mt-4 flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4">
        <input type="checkbox" checked={draft.is_active} onChange={(event) => setDraft({ ...draft, is_active: event.target.checked })} />
        <span><strong className="block text-sm text-white">Active</strong><span className="text-xs text-muted-foreground">Inactive entries stay saved but the assistant doesn't read them.</span></span>
      </label>
      <Button className="mt-5" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Save entry</Button>
    </CardContent></Card>}

    {grouped.length === 0 && <Card><CardContent><p className="text-sm text-muted-foreground">{entries.length === 0 ? "No knowledge yet. Add the first entry above." : "Nothing matches that search."}</p></CardContent></Card>}

    {grouped.map(([category, items]) => <Card key={category}><CardContent>
      <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-white"><BookOpen size={18} className="text-primary-glow" />{category}<span className="text-xs font-normal text-faint-foreground">{items.length} {items.length === 1 ? "entry" : "entries"}</span></h2>
      <ul className="mt-4 divide-y divide-white/[0.06]">
        {items.map((entry) => <li key={entry.id} className="flex flex-col gap-2 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">{entry.title}{!entry.is_active && <span className="rounded-full border border-amber/25 bg-amber/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-amber">Off</span>}</p>
            <p className="mt-1 line-clamp-2 max-w-2xl text-[13px] leading-5 text-muted-foreground">{entry.content}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => void toggleActive(entry)}>{entry.is_active ? "Turn off" : "Turn on"}</Button>
            <Button variant="ghost" size="sm" aria-label={`Edit ${entry.title}`} onClick={() => { setDraft({ id: entry.id, category: entry.category, title: entry.title, content: entry.content, is_active: entry.is_active }); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil size={15} /></Button>
            <Button variant="ghost" size="sm" aria-label={`Delete ${entry.title}`} onClick={() => void remove(entry)} disabled={deleting === entry.id}>{deleting === entry.id ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}</Button>
          </div>
        </li>)}
      </ul>
    </CardContent></Card>)}

    <Card><CardContent>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><h2 className="font-display text-lg font-semibold text-white">What the AI reads</h2><p className="mt-1 max-w-xl text-sm leading-6 text-muted-foreground">The exact knowledge block sent with every reply — only active entries, grouped by category.{preview && ` Currently ~${preview.tokens.toLocaleString()} tokens; prompt caching keeps the repeat cost of this block to about a tenth.`}</p></div>
        <Button variant="ghost" size="sm" onClick={() => void loadPreview()} disabled={previewLoading}>{previewLoading ? <Loader2 className="animate-spin" /> : <Eye />}{preview ? "Refresh preview" : "Show preview"}</Button>
      </div>
      {preview && <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-2xl border border-white/[0.07] bg-black/25 p-4 font-mono text-xs leading-5 text-muted-foreground">{preview.text || "No active entries — the assistant currently has no knowledge base."}</pre>}
    </CardContent></Card>
  </div>;
}
