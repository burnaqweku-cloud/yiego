import { useEffect, useState } from "react";
import { Cpu, KeyRound, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { adminDatabase } from "@/lib/admin-data";

/* Admin → AI support: which model powers all three assistants. A settings change, no redeploy. */
type Provider = "groq" | "openrouter" | "mistral" | "gemini";
const PROVIDERS: Array<{ id: Provider; label: string; models: string[]; note: string }> = [
  { id: "groq", label: "Groq", models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"], note: "Free tier about 1,000 requests a day, no card. Fast." },
  { id: "openrouter", label: "OpenRouter", models: ["google/gemini-2.5-flash", "openai/gpt-4o-mini", "meta-llama/llama-3.3-70b-instruct", "anthropic/claude-3.5-haiku"], note: "Paid: $10 minimum top-up by card or crypto, then pay per message." },
  { id: "mistral", label: "Mistral", models: ["mistral-large-latest", "mistral-small-latest"], note: "Free Experiment tier, no card." },
  { id: "gemini", label: "Google Gemini", models: ["gemini-2.5-flash", "gemini-2.5-flash-lite"], note: "Free tier is 20 requests a day; needs Google Cloud billing for more." },
];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = (f: string, a: Record<string, unknown> = {}) => (adminDatabase() as unknown as { rpc: (f: string, a: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }> }).rpc(f, a);

export default function AiProviderCard({ onChanged }: { onChanged?: () => void }) {
  const [provider, setProvider] = useState<Provider>("groq");
  const [model, setModel] = useState("");
  const [keys, setKeys] = useState<Record<string, boolean>>({});
  const [newKey, setNewKey] = useState("");
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  useEffect(() => { void rpc("admin_ai_provider").then(({ data }) => { if (data) { setProvider(data.provider); setModel(data.model); setKeys(data.keys ?? {}); } setLoading(false); }); }, []);
  const def = PROVIDERS.find((p) => p.id === provider)!;
  const save = async () => {
    setSaving(true);
    const { data, error } = await rpc("admin_set_ai_provider", { p_provider: provider, p_model: model.trim(), p_key: newKey.trim() || null });
    setSaving(false);
    if (error) return toast.error(error.message.includes("no_key") ? `No key saved for ${def.label} yet. Paste one below.` : error.message.replace(/_/g, " "));
    setKeys(data?.keys ?? keys); setNewKey("");
    toast.success(`Assistants now run on ${def.label} · ${model}. Applies from the next message.`); onChanged?.();
  };
  return (
    <Card><CardContent>
      <div className="flex items-center gap-2"><Cpu className="text-primary-glow" /><h2 className="font-display text-lg font-semibold text-white">Model provider</h2></div>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">One switch for all three assistants (site, agent dashboard, agent stores). Change it here and the next message uses it; nothing to redeploy.</p>
      {loading ? <p className="mt-4 text-sm text-muted-foreground">Loading…</p> : <>
        <div className="mt-4 flex flex-wrap gap-2">{PROVIDERS.map((p) => <button key={p.id} type="button" onClick={() => { setProvider(p.id); setModel(p.models[0]); }} className={`rounded-full px-3.5 py-1.5 text-[12.5px] font-medium ${provider === p.id ? "bg-primary/20 text-primary-glow" : "border border-white/[0.08] text-muted-foreground hover:text-foreground"}`}>{p.label}{keys[p.id] ? " ✓" : ""}</button>)}</div>
        <p className="mt-2 text-[12px] text-faint-foreground">{def.note}{keys[provider] ? " Key saved." : " No key saved yet."}</p>
        <label className="mt-4 block text-xs font-semibold uppercase tracking-[0.14em] text-faint-foreground">Model</label>
        <div className="mt-2 flex flex-wrap gap-2">{def.models.map((m) => <button key={m} type="button" onClick={() => setModel(m)} className={`rounded-lg px-3 py-1.5 font-mono text-[12px] ${model === m ? "bg-primary/20 text-primary-glow" : "border border-white/[0.08] text-muted-foreground hover:text-foreground"}`}>{m}</button>)}</div>
        <input value={model} onChange={(e) => setModel(e.target.value)} className="onyx-field mt-2 w-full font-mono text-[13px]" placeholder="or type a model id" />
        <label className="mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-faint-foreground"><KeyRound size={13} />{keys[provider] ? `Replace the ${def.label} key (optional)` : `${def.label} API key`}</label>
        <input value={newKey} onChange={(e) => setNewKey(e.target.value)} type="password" autoComplete="off" className="onyx-field mt-2 w-full font-mono text-[13px]" placeholder={keys[provider] ? "Leave blank to keep the saved key" : "Paste the key"} />
        <Button className="mt-4" onClick={() => void save()} disabled={saving || !model.trim()}>{saving ? <Loader2 className="animate-spin" /> : <Save />}Use this model</Button>
      </>}
    </CardContent></Card>
  );
}
