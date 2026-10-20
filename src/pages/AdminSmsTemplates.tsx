import { useEffect, useMemo, useState } from "react";
import { FileText, RotateCcw, Save, Send } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import { Panel, Pill, inputCls } from "@/components/admin/ui";
import { formatAdminDate } from "@/lib/admin-data";
import { loadSmsSettings, loadSmsTemplates, saveSmsTemplate, sendSmsTest, SMS_TEMPLATE_LABEL, type SmsTemplate, type SmsTemplateKind } from "@/lib/sms-admin";
import { buildOrderSms, DEFAULT_SMS_TEMPLATES, SAMPLE_ORDER, SAMPLE_STORE_ORDER, SMS_PLACEHOLDERS, smsSegments, validateSmsTemplate, type SmsTemplates } from "../../supabase/functions/_shared/orderSmsTemplates";

/* Admin → SMS → Templates. The four texts, edited here, previewed with a sample order, tested on a real phone. */
const KINDS: SmsTemplateKind[] = ["purchase", "delivered", "verified_delivered", "verified_on_way"];
const orderKind = (k: SmsTemplateKind) => (k.startsWith("verified") ? "verified" : k) as "purchase" | "delivered" | "verified";
const sampleFor = (k: SmsTemplateKind, store: boolean) => {
  const base = store ? SAMPLE_STORE_ORDER : SAMPLE_ORDER;
  return k === "verified_on_way" ? { ...base, status: "processing", created_at: new Date(Date.now() - 3600_000).toISOString() } : base;
};

export default function AdminSmsTemplates() {
  const [saved, setSaved] = useState<SmsTemplate[] | null>(null);
  const [drafts, setDrafts] = useState<Record<SmsTemplateKind, string>>({ ...DEFAULT_SMS_TEMPLATES });
  const [store, setStore] = useState(false);
  const [numbers, setNumbers] = useState<string[]>([]);
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    void loadSmsTemplates().then((t) => { setSaved(t); setDrafts((d) => { const n = { ...d }; for (const x of t) n[x.kind] = x.body; return n; }); }).catch((e) => toast.error((e as Error).message));
    void loadSmsSettings().then((s) => { setNumbers(s.test_numbers); setTo(s.test_numbers[0] ?? ""); }).catch(() => { /* shown on the settings page */ });
  }, []);

  const allDrafts = useMemo(() => ({ ...DEFAULT_SMS_TEMPLATES, ...drafts }) as SmsTemplates, [drafts]);

  const save = async (kind: SmsTemplateKind) => {
    setBusy(`save:${kind}`);
    try { const t = await saveSmsTemplate(kind, drafts[kind]); setSaved(t); toast.success(`${SMS_TEMPLATE_LABEL[kind].title} saved. New texts use it from now.`); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  const test = async (kind: SmsTemplateKind) => {
    if (!to) return toast.error("Add a test number under Settings first.");
    const savedBody = saved?.find((s) => s.kind === kind)?.body;
    if (savedBody !== undefined && savedBody !== drafts[kind] && !window.confirm("This sends the SAVED version, not your unsaved edit. Send anyway?")) return;
    setBusy(`test:${kind}`);
    try { const r = await sendSmsTest(to, { kind, store }); toast.success(`Sent to ${to}. ${r.remaining != null ? `${r.remaining} credits left.` : ""}`); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Templates" description="What each text says. Placeholders in {braces} are filled from the order. Keep to plain characters: the network drops emoji, accents, 'GB', 'bundle' and https links." />

      <Panel title="Preview with" icon={FileText}>
        <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
          <label className="inline-flex items-center gap-2"><input type="radio" checked={!store} onChange={() => setStore(false)} />Main-site order (DTYEGO)</label>
          <label className="inline-flex items-center gap-2"><input type="radio" checked={store} onChange={() => setStore(true)} />Agent-store order (Urbanstore)</label>
          <span className="ml-auto inline-flex items-center gap-2 text-muted-foreground">Test number
            <select value={to} onChange={(e) => setTo(e.target.value)} className="h-8 rounded-lg border border-white/[0.1] bg-white/[0.03] px-2 text-[12.5px] text-foreground">{numbers.map((n) => <option key={n} value={n}>{n}</option>)}{numbers.length === 0 && <option value="">none set</option>}</select>
          </span>
        </div>
        <p className="mt-2 text-[11.5px] text-faint-foreground">Placeholders: {Object.entries(SMS_PLACEHOLDERS).map(([k, v]) => <span key={k} className="mr-2 inline-block"><code className="rounded bg-white/[0.06] px-1">{`{${k}}`}</code> {v}</span>)}</p>
      </Panel>

      {KINDS.map((kind) => {
        const body = drafts[kind]; const problems = validateSmsTemplate(body);
        let preview = ""; let previewError: string | null = null;
        if (!problems.length) { try { preview = buildOrderSms(sampleFor(kind, store), orderKind(kind), allDrafts); } catch (e) { previewError = (e as Error).message; } }
        const meta = saved?.find((s) => s.kind === kind);
        const dirty = meta ? meta.body !== body : body !== DEFAULT_SMS_TEMPLATES[kind];
        const segs = preview ? smsSegments(preview) : 0;
        return (
          <Panel key={kind} title={SMS_TEMPLATE_LABEL[kind].title} note={SMS_TEMPLATE_LABEL[kind].when} action={dirty ? <Pill tone="warn">Unsaved</Pill> : meta?.updated_at ? <span className="text-[10.5px] text-faint-foreground">Saved {formatAdminDate(meta.updated_at)}{meta.updated_by ? ` by ${meta.updated_by}` : ""}</span> : null}>
            <p className="mb-2 text-[12px] text-muted-foreground sm:hidden">{SMS_TEMPLATE_LABEL[kind].when}</p>
            <textarea value={body} onChange={(e) => setDrafts({ ...drafts, [kind]: e.target.value })} rows={3} className={`${inputCls} h-auto resize-y py-2 leading-relaxed`} spellCheck={false} />
            {problems.map((p) => <p key={p} className="mt-1.5 text-[12px] text-danger">{p}</p>)}
            {previewError && <p className="mt-1.5 text-[12px] text-danger">{previewError}</p>}
            {preview && (
              <div className="mt-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                <p className="mb-1 flex items-center justify-between text-[11px] text-faint-foreground"><span>How it reads for a {store ? "store" : "main-site"} order</span><span>{preview.length} chars · {segs} segment{segs === 1 ? "" : "s"}{segs > 1 ? " (costs 2 credits)" : ""}</span></p>
                <p className="text-[13px] leading-relaxed text-foreground">{preview}</p>
              </div>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" disabled={!dirty || problems.length > 0 || Boolean(previewError) || busy !== null} onClick={() => void save(kind)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-[#04120c] disabled:opacity-50"><Save size={13} />{busy === `save:${kind}` ? "Saving…" : "Save"}</button>
              <button type="button" disabled={busy !== null || !to} onClick={() => void test(kind)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] px-3 py-1.5 text-[12px] font-semibold text-foreground hover:bg-white/[0.04] disabled:opacity-50"><Send size={13} />{busy === `test:${kind}` ? "Sending…" : `Send test to ${to || "…"}`}</button>
              {dirty && <button type="button" onClick={() => setDrafts({ ...drafts, [kind]: meta?.body ?? DEFAULT_SMS_TEMPLATES[kind] })} className="inline-flex items-center gap-1.5 px-2 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"><RotateCcw size={13} />Discard</button>}
              {!dirty && meta && meta.body !== DEFAULT_SMS_TEMPLATES[kind] && <button type="button" onClick={() => setDrafts({ ...drafts, [kind]: DEFAULT_SMS_TEMPLATES[kind] })} className="inline-flex items-center gap-1.5 px-2 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"><RotateCcw size={13} />Reset to the tested wording</button>}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
