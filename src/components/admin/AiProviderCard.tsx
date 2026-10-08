import { useCallback, useEffect, useState } from "react";
import { Cpu, KeyRound, Loader2, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import Modal from "@/components/ui/modal";
import { adminDatabase, formatAdminDate } from "@/lib/admin-data";

/* Admin → AI support: which model powers all three assistants, and (master admin only) the key pool
   behind it. Several keys per provider are rotated automatically; a key that hits its limit rests
   for the time the provider asks and the next key takes over. */
type Provider = "groq" | "openrouter" | "mistral" | "gemini";
const PROVIDERS: Array<{ id: Provider; label: string; models: string[] }> = [
  { id: "groq", label: "Groq", models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"] },
  { id: "openrouter", label: "OpenRouter", models: ["google/gemini-2.5-flash", "openai/gpt-4o-mini", "meta-llama/llama-3.3-70b-instruct", "anthropic/claude-3.5-haiku"] },
  { id: "mistral", label: "Mistral", models: ["mistral-large-latest", "mistral-small-latest"] },
  { id: "gemini", label: "Google Gemini", models: ["gemini-2.5-flash", "gemini-2.5-flash-lite"] },
];
interface KeyRow { id: string; label: string | null; masked: string; is_active: boolean; added: string; last_used: string | null; cooling_until: string | null; uses: number; limit_hits: number; last_error: string | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (f: string, a: Record<string, unknown> = {}) => (adminDatabase() as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }> }).rpc(f, a);

export default function AiProviderCard({ onChanged }: { onChanged?: () => void }) {
  const [provider, setProvider] = useState<Provider>("groq");
  const [model, setModel] = useState("");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isMaster, setIsMaster] = useState(false);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [keys, setKeys] = useState<KeyRow[] | null>(null);
  const [adding, setAdding] = useState(false); const [newKey, setNewKey] = useState(""); const [newLabel, setNewLabel] = useState(""); const [busyKey, setBusyKey] = useState(false);
  const [usage, setUsage] = useState<{ keys: number; cooling: number; answers_today: number } | null>(null);
  const [removing, setRemoving] = useState<KeyRow | null>(null);

  const loadKeys = useCallback(async (p: Provider) => { const { data } = await rpc("master_ai_keys", { p_provider: p }); setKeys(Array.isArray(data) ? data : []); }, []);
  const loadUsage = useCallback(async () => { const { data } = await rpc("admin_ai_usage"); if (data) setUsage(data); }, []);
  useEffect(() => { void rpc("admin_ai_provider").then(({ data }) => { if (data) { setProvider(data.provider); setModel(data.model); setCounts(data.keys ?? {}); setIsMaster(Boolean(data.is_master)); if (data.is_master) void loadKeys(data.provider); } setLoading(false); }); void loadUsage(); }, [loadKeys, loadUsage]);
  useEffect(() => { if (isMaster) void loadKeys(provider); }, [provider, isMaster, loadKeys]);

  const def = PROVIDERS.find((p) => p.id === provider)!;
  const activeKeys = (keys ?? []).filter((k) => k.is_active);
  const save = async () => {
    setSaving(true);
    const { data, error } = await rpc("admin_set_ai_provider", { p_provider: provider, p_model: model.trim(), p_key: null });
    setSaving(false);
    if (error) return toast.error(error.message.includes("no_key") ? `No key saved for ${def.label} yet.` : error.message.replace(/_/g, " "));
    setCounts(data?.keys ?? counts);
    toast.success(`Assistants now run on ${def.label} · ${model}. Applies from the next message.`); onChanged?.(); void loadUsage();
  };
  const addKey = async () => {
    if (newKey.trim().length < 10) return toast.error("Paste the whole key.");
    setBusyKey(true);
    const { data, error } = await rpc("master_ai_key_add", { p_provider: provider, p_key: newKey.trim(), p_label: newLabel.trim() || null });
    setBusyKey(false);
    if (error) return toast.error(error.message.replace(/_/g, " "));
    setKeys(Array.isArray(data) ? data : []); setCounts((c) => ({ ...c, [provider]: (Array.isArray(data) ? data : []).filter((k: KeyRow) => k.is_active).length }));
    setNewKey(""); setNewLabel(""); setAdding(false); toast.success(`${def.label} key added. It joins the rotation immediately.`); void loadUsage();
  };
  const removeKey = async () => {
    if (!removing) return;
    setBusyKey(true); const { error } = await rpc("master_ai_key_remove", { p_id: removing.id }); setBusyKey(false);
    if (error) return toast.error(error.message.replace(/_/g, " "));
    setRemoving(null); toast.success("Key removed."); void loadKeys(provider); void loadUsage();
  };

  return (
    <Card><CardContent>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="flex items-center gap-2"><Cpu className="text-primary-glow" /><h2 className="font-display text-lg font-semibold text-white">Model provider</h2></div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">One switch for all three assistants (site, agent dashboard, agent stores). Applies from the next message; nothing to redeploy.</p></div>
        {usage && <div className="flex gap-4 rounded-xl border border-white/[0.08] px-4 py-2.5 text-[12px]"><span><b className="text-foreground">{usage.answers_today}</b> <span className="text-muted-foreground">answers today</span></span><span><b className="text-foreground">{usage.keys}</b> <span className="text-muted-foreground">key{usage.keys === 1 ? "" : "s"}</span></span>{usage.cooling > 0 && <span className="text-amber"><b>{usage.cooling}</b> resting</span>}</div>}
      </div>
      {loading ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p> : <>
        <div className="mt-4 flex flex-wrap gap-2">{PROVIDERS.map((p) => <button key={p.id} type="button" onClick={() => { setProvider(p.id); setModel(p.models[0]); }} className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium ${provider === p.id ? "bg-primary/20 text-primary-glow" : "border border-white/[0.08] text-muted-foreground hover:text-foreground"}`}>{p.label}{counts[p.id] ? ` · ${counts[p.id]} key${counts[p.id] === 1 ? "" : "s"}` : ""}</button>)}</div>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-faint-foreground">Model</label>
        <div className="mt-2 flex flex-wrap gap-2">{def.models.map((m) => <button key={m} type="button" onClick={() => setModel(m)} className={`rounded-lg px-3 py-1.5 font-mono text-[12px] ${model === m ? "bg-primary/20 text-primary-glow" : "border border-white/[0.08] text-muted-foreground hover:text-foreground"}`}>{m}</button>)}</div>
        <input value={model} onChange={(e) => setModel(e.target.value)} className="onyx-field mt-2 w-full font-mono text-[13px]" placeholder="or type a model id" />
        <Button className="mt-4" onClick={() => void save()} disabled={saving || !model.trim()}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Use this model</Button>

        {isMaster && (
          <div className="mt-6 border-t border-white/[0.07] pt-5">
            <div className="flex items-center justify-between">
              <div><p className="flex items-center gap-1.5 text-[13px] font-semibold text-foreground"><KeyRound size={14} className="text-primary-glow" />{def.label} keys · {activeKeys.length}</p><p className="mt-0.5 text-[12px] text-muted-foreground">Rotated automatically. A key that hits its limit rests for the time the provider asks, and the next one takes over. Each key must come from a separate {def.label} account to count separately.</p></div>
              <Button size="sm" variant="soft" onClick={() => setAdding(true)}><Plus size={14} />Add key</Button>
            </div>
            <div className="mt-3 overflow-x-auto">
              {keys === null ? <p className="text-[12.5px] text-muted-foreground">Loading…</p> : activeKeys.length === 0 ? <p className="text-[12.5px] text-muted-foreground">No keys yet for {def.label}.</p> : (
                <table className="w-full text-left text-[12.5px]">
                  <thead><tr className="text-[11px] uppercase tracking-wide text-faint-foreground"><th className="py-1.5 pr-3">Key</th><th className="py-1.5 pr-3">Label</th><th className="py-1.5 pr-3">Status</th><th className="py-1.5 pr-3">Answers</th><th className="py-1.5 pr-3">Limit hits</th><th className="py-1.5 pr-3">Last used</th><th className="py-1.5" /></tr></thead>
                  <tbody>{activeKeys.map((k) => { const resting = k.cooling_until && new Date(k.cooling_until) > new Date(); return (
                    <tr key={k.id} className="border-t border-white/[0.06]">
                      <td className="py-2 pr-3 font-mono text-foreground">{k.masked}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{k.label ?? "—"}</td>
                      <td className="py-2 pr-3">{resting ? <span className="text-amber">Resting until {new Date(k.cooling_until!).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span> : <span className="text-ink-emerald">In rotation</span>}{k.last_error && !resting ? <span className="block text-[11px] text-faint-foreground">{k.last_error.slice(0, 60)}</span> : null}</td>
                      <td className="py-2 pr-3 text-foreground">{k.uses}</td>
                      <td className="py-2 pr-3 text-muted-foreground">{k.limit_hits}</td>
                      <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{k.last_used ? formatAdminDate(k.last_used) : "never"}</td>
                      <td className="py-2 text-right"><button type="button" onClick={() => setRemoving(k)} aria-label="Remove key" className="text-faint-foreground hover:text-danger"><Trash2 size={14} /></button></td>
                    </tr>); })}</tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </>}

      <Modal open={adding} onClose={() => setAdding(false)} label="Add key">
        <div className="w-[min(92vw,440px)] p-5">
          <h2 className="text-[16px] font-semibold text-foreground">Add a {def.label} key</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">It joins the rotation straight away. Use a key from a different {def.label} account than the others so its limit counts separately.</p>
          <input value={newKey} onChange={(e) => setNewKey(e.target.value)} type="password" autoComplete="off" className="onyx-field mt-4 w-full font-mono text-[13px]" placeholder="Paste the key" />
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="onyx-field mt-2 w-full text-[13px]" placeholder="Label (optional), e.g. account 2" maxLength={40} />
          <div className="mt-4 flex justify-end gap-2"><Button variant="quiet" onClick={() => setAdding(false)}>Cancel</Button><Button onClick={() => void addKey()} disabled={busyKey || newKey.trim().length < 10}>{busyKey ? <Loader2 className="animate-spin" /> : <Plus />}Add key</Button></div>
        </div>
      </Modal>
      <Modal open={removing !== null} onClose={() => setRemoving(null)} label="Remove key">
        <div className="w-[min(92vw,400px)] p-5">
          <h2 className="text-[16px] font-semibold text-foreground">Remove {removing?.masked}?</h2>
          <p className="mt-1 text-[12.5px] text-muted-foreground">It leaves the rotation immediately. {activeKeys.length <= 1 ? "This is the last key: the assistants will stop answering until another is added." : ""}</p>
          <div className="mt-4 flex justify-end gap-2"><Button variant="quiet" onClick={() => setRemoving(null)}>Cancel</Button><Button onClick={() => void removeKey()} disabled={busyKey}>{busyKey ? <Loader2 className="animate-spin" /> : <Trash2 />}Remove</Button></div>
        </div>
      </Modal>
    </CardContent></Card>
  );
}
