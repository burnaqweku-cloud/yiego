import { useEffect, useState } from "react";
import { FileText, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { adminDatabase } from "@/lib/admin-data";

type LegalSlug = "privacy" | "terms" | "refunds";
interface LegalRow { slug: LegalSlug; title: string; summary: string; content: string; version: number; is_published: boolean; }

const labels: Record<LegalSlug, string> = { privacy: "Privacy Policy", terms: "Terms of Service", refunds: "Refund Policy" };

export default function AdminLegal() {
  const [documents, setDocuments] = useState<LegalRow[]>([]);
  const [active, setActive] = useState<LegalSlug>("privacy");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const current = documents.find((item) => item.slug === active);

  useEffect(() => {
    void (async () => {
      const { data, error } = await adminDatabase().from<LegalRow>("legal_documents").select("slug, title, summary, content, version, is_published").order("slug");
      if (error) toast.error("Could not load legal documents."); else setDocuments(data ?? []);
      setLoading(false);
    })();
  }, []);

  const patch = (values: Partial<LegalRow>) => setDocuments((rows) => rows.map((row) => row.slug === active ? { ...row, ...values } : row));

  const save = async () => {
    if (!current) return;
    setSaving(true);
    const { data, error } = await supabase.functions.invoke<{ error?: string; data?: LegalRow }>("admin-site-content-action", { body: { action: "update_legal", ...current, isPublished: current.is_published } });
    setSaving(false);
    if (error || data?.error) return toast.error(data?.error ?? error?.message ?? "Could not save the document.");
    if (data?.data) setDocuments((rows) => rows.map((row) => row.slug === active ? data.data! : row));
    toast.success(`${labels[active]} updated.`);
  };

  if (loading) return <div className="grid min-h-64 place-items-center"><Loader2 className="animate-spin text-primary-glow" /></div>;

  return <div className="space-y-7">
    <AdminPageHeader eyebrow="Legal" title="Legal documents" description="Maintain the customer-facing policies required for DataYego's public launch." />
    <NoticeEditor />
    <div className="flex flex-wrap gap-2">{(Object.keys(labels) as LegalSlug[]).map((slug) => <Button key={slug} variant={active === slug ? "primary" : "ghost"} onClick={() => setActive(slug)}>{labels[slug]}</Button>)}</div>
    {current && <Card><CardContent>
      <div className="flex items-start justify-between gap-4"><div className="flex items-start gap-4"><span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/[0.1] text-primary-glow"><FileText size={20} /></span><div><h2 className="font-display text-lg font-semibold text-white">{labels[active]}</h2><p className="mt-1 text-xs text-muted-foreground">Version {current.version}. Published content is immediately visible on the public page.</p></div></div></div>
      <div className="mt-6 space-y-4">
        <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Title</span><input className="onyx-field" value={current.title} onChange={(e) => patch({ title: e.target.value })} /></label>
        <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Summary</span><input className="onyx-field" value={current.summary} onChange={(e) => patch({ summary: e.target.value })} /></label>
        <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Policy content</span><textarea className="onyx-field min-h-[520px] resize-y font-mono text-sm leading-6" value={current.content} onChange={(e) => patch({ content: e.target.value })} /></label>
        <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4"><input type="checkbox" checked={current.is_published} onChange={(e) => patch({ is_published: e.target.checked })} /><span><strong className="block text-sm text-white">Published</strong><span className="text-xs text-muted-foreground">Unpublishing removes the document from public access.</span></span></label>
      </div>
      <Button className="mt-6" onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Save and publish</Button>
    </CardContent></Card>}
  </div>;
}

/* ── Shop notice ──────────────────────────────────────────────────
   The amber "Important notice" on the shop page and inside the buy flow.
   Points are one per line; the MTN note only shows on MTN orders in the
   flow. Unpublishing hides the card everywhere. */

interface NoticeRow { slug: string; title: string; points: string[]; mtn_note: string | null; is_published: boolean; }

function NoticeEditor() {
  const [title, setTitle] = useState("Important notice");
  const [pointsText, setPointsText] = useState("");
  const [mtnNote, setMtnNote] = useState("");
  const [published, setPublished] = useState(true);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await adminDatabase().from<NoticeRow>("site_notices").select("slug, title, points, mtn_note, is_published").eq("slug", "shop_important_notice").limit(1);
      const row = data?.[0];
      if (row) {
        setTitle(row.title);
        setPointsText((Array.isArray(row.points) ? row.points : []).join("\n"));
        setMtnNote(row.mtn_note ?? "");
        setPublished(row.is_published !== false);
      }
      setReady(true);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    const points = pointsText.split("\n").map((line) => line.trim()).filter(Boolean);
    const { data, error } = await supabase.functions.invoke<{ error?: string }>("admin-site-content-action", {
      body: { action: "update_notice", slug: "shop_important_notice", title, points, mtnNote, isPublished: published },
    });
    setSaving(false);
    if (error || data?.error) return toast.error(data?.error ?? error?.message ?? "Could not save the notice.");
    toast.success("Shop notice updated. Customers see it immediately.");
  };

  return <Card><CardContent>
    <div className="flex items-start gap-4"><span className="grid h-11 w-11 place-items-center rounded-xl bg-amber/[0.12] text-amber"><FileText size={20} /></span><div><h2 className="font-display text-lg font-semibold text-white">Shop notice</h2><p className="mt-1 text-xs text-muted-foreground">The amber "Important notice" shown on the shop page and while ordering. One point per line. The MTN note appears only on MTN orders inside the buy flow.</p></div></div>
    {!ready ? <div className="grid min-h-24 place-items-center"><Loader2 className="animate-spin text-primary-glow" /></div> : <div className="mt-6 space-y-4">
      <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Title</span><input className="onyx-field" value={title} onChange={(e) => setTitle(e.target.value)} /></label>
      <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">Points — one per line</span><textarea className="onyx-field min-h-[120px] resize-y text-sm leading-6" value={pointsText} onChange={(e) => setPointsText(e.target.value)} placeholder={"Delivery times may vary.\nThe receiving phone must not owe airtime."} /></label>
      <label><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">MTN note — leave empty to remove</span><textarea className="onyx-field min-h-[88px] resize-y text-sm leading-6" value={mtnNote} onChange={(e) => setMtnNote(e.target.value)} /></label>
      <label className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.025] p-4"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} /><span><strong className="block text-sm text-white">Published</strong><span className="text-xs text-muted-foreground">Unpublishing hides the notice from the shop and the buy flow.</span></span></label>
      <Button onClick={() => void save()} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Save notice</Button>
    </div>}
  </CardContent></Card>;
}
