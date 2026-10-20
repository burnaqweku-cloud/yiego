import { useEffect, useState } from "react";
import { Phone, Save, Send, Settings2, Store, Trash2 } from "lucide-react";
import { toast } from "sonner";
import AdminPageHeader from "@/components/admin/AdminPageHeader";
import Switch from "@/components/admin/Switch";
import { Field, Panel, Rows, Row, inputCls } from "@/components/admin/ui";
import { formatAdminDate } from "@/lib/admin-data";
import { loadSmsSettings, saveSmsSettings, sendSmsTest, type SmsSettings } from "@/lib/sms-admin";

/* Admin → SMS → Settings. Sender name, which texts go out, store orders, the test numbers, and a custom test send. */
export default function AdminSmsSettings() {
  const [s, setS] = useState<SmsSettings | null>(null);
  const [sender, setSender] = useState("");
  const [hours, setHours] = useState(48);
  const [newNumber, setNewNumber] = useState("");
  const [custom, setCustom] = useState("Hello from DTYEGO. This is a test, no action needed.");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { void loadSmsSettings().then((x) => { setS(x); setSender(x.sender_id); setHours(x.on_way_max_hours); setTo(x.test_numbers[0] ?? ""); }).catch((e) => toast.error((e as Error).message)); }, []);

  const apply = async (patch: Partial<SmsSettings>, done: string) => {
    setBusy("save");
    try { const x = await saveSmsSettings(patch); setS(x); setSender(x.sender_id); setHours(x.on_way_max_hours); if (!x.test_numbers.includes(to)) setTo(x.test_numbers[0] ?? ""); toast.success(done); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };
  const flag = (key: "purchase_enabled" | "delivered_enabled" | "verified_enabled" | "store_orders_enabled", label: string) => (next: boolean) => void apply({ [key]: next }, `${label} ${next ? "on" : "off"}.`);

  const addNumber = () => {
    const d = newNumber.replace(/\D/g, "");
    const n = d.startsWith("233") && d.length === 12 ? `+${d}` : d.startsWith("0") && d.length === 10 ? `+233${d.slice(1)}` : null;
    if (!n || !s) return toast.error("Enter a Ghana number like 0533533414.");
    if (s.test_numbers.includes(n)) return toast.message("Already on the list.");
    void apply({ test_numbers: [...s.test_numbers, n] }, "Test number added.");
    setNewNumber("");
  };
  const sendCustom = async () => {
    if (!to || !custom.trim()) return;
    setBusy("test");
    try { const r = await sendSmsTest(to, { message: custom.trim() }); toast.success(`Sent to ${to}.${r.remaining != null ? ` ${r.remaining} credits left.` : ""}`); const x = await loadSmsSettings(); setS(x); }
    catch (e) { toast.error((e as Error).message); }
    finally { setBusy(null); }
  };

  return (
    <div className="space-y-5">
      <AdminPageHeader title="Settings" description="Changes apply to the next text sent. The master on/off switch is on the SMS overview." />

      <Panel title="Which texts go out" icon={Settings2}>
        <Rows empty="">
          {[
            <Row key="p" primary="Paid" secondary="The moment a payment is confirmed" right={<Switch on={Boolean(s?.purchase_enabled)} onChange={flag("purchase_enabled", "Paid texts")} label="Paid texts" disabled={!s || busy !== null} />} />,
            <Row key="d" primary="Delivered" secondary="When the data is marked delivered" right={<Switch on={Boolean(s?.delivered_enabled)} onChange={flag("delivered_enabled", "Delivered texts")} label="Delivered texts" disabled={!s || busy !== null} />} />,
            <Row key="v" primary="MTN number verified" secondary="First-time MTN numbers once MTN approves them" right={<Switch on={Boolean(s?.verified_enabled)} onChange={flag("verified_enabled", "Verified texts")} label="Verified texts" disabled={!s || busy !== null} />} />,
            <Row key="s" primary={<span className="inline-flex items-center gap-1.5"><Store size={13} />Agent-store orders</span>} secondary="Texts for store orders carry the store's name and address, but the sender name is still ours" right={<Switch on={Boolean(s?.store_orders_enabled)} onChange={flag("store_orders_enabled", "Store-order texts")} label="Store-order texts" disabled={!s || busy !== null} />} />,
          ]}
        </Rows>
      </Panel>

      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <Panel title="Sender name" icon={Phone} className="min-w-0">
          <Field label="Shown as the sender on the phone" hint="3–11 letters or digits, and it must be approved on Vynfy first. 'DTYEGO' is approved; 'Datayego' was blocked by MTN.">
            <input value={sender} onChange={(e) => setSender(e.target.value.replace(/[^A-Za-z0-9]/g, "").slice(0, 11))} className={inputCls} />
          </Field>
          <div className="mt-3"><Field label="'On its way' only for orders younger than (hours)" hint="An older order still processing is stuck, not on its way; those get no verified text.">
            <input type="number" min={1} max={720} value={hours} onChange={(e) => setHours(Number(e.target.value))} className={inputCls} />
          </Field></div>
          <button type="button" disabled={!s || busy !== null || (sender === s.sender_id && hours === s.on_way_max_hours)} onClick={() => void apply({ sender_id: sender, on_way_max_hours: hours }, "Saved.")} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-[#04120c] disabled:opacity-50"><Save size={13} />Save</button>
          {s?.updated_at && <p className="mt-3 text-[11px] text-faint-foreground">Last changed {formatAdminDate(s.updated_at)}{s.updated_by ? ` by ${s.updated_by}` : ""}</p>}
        </Panel>

        <Panel title="Test numbers" icon={Phone} className="min-w-0" note="the only numbers test texts can go to">
          <Rows empty="No test numbers yet.">
            {(s?.test_numbers ?? []).map((n) => (
              <Row key={n} primary={n} right={<button type="button" disabled={busy !== null} onClick={() => { if (window.confirm(`Remove ${n} from the test list?`)) void apply({ test_numbers: s!.test_numbers.filter((x) => x !== n) }, "Removed."); }} className="rounded-lg p-1.5 text-muted-foreground hover:text-danger" aria-label={`Remove ${n}`}><Trash2 size={14} /></button>} />
            ))}
          </Rows>
          <form onSubmit={(e) => { e.preventDefault(); addNumber(); }} className="mt-2 flex gap-2">
            <input value={newNumber} onChange={(e) => setNewNumber(e.target.value)} placeholder="0533533414" inputMode="tel" className={inputCls} aria-label="New test number" />
            <button type="submit" disabled={!s || busy !== null} className="shrink-0 rounded-lg border border-white/[0.12] px-3 text-[12px] font-semibold text-foreground hover:bg-white/[0.04] disabled:opacity-50">Add</button>
          </form>
        </Panel>
      </div>

      <Panel title="Send a custom test" icon={Send} note="costs credits like any text">
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <textarea value={custom} onChange={(e) => setCustom(e.target.value.slice(0, 306))} rows={2} className={`${inputCls} h-auto resize-y py-2`} />
          <div className="flex flex-col gap-2">
            <select value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-white/[0.1] bg-white/[0.03] px-2 text-[12.5px] text-foreground" aria-label="Test number">{(s?.test_numbers ?? []).map((n) => <option key={n} value={n}>{n}</option>)}</select>
            <button type="button" disabled={!to || !custom.trim() || busy !== null} onClick={() => void sendCustom()} className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-semibold text-[#04120c] disabled:opacity-50"><Send size={13} />{busy === "test" ? "Sending…" : "Send"}</button>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-faint-foreground">{custom.length} characters. A successful test also counts as the test the master switch needs.</p>
      </Panel>
    </div>
  );
}
