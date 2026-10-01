import { useMemo, useState } from "react";
import { Check, ClipboardCopy, Clock, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import Seo from "@/components/seo/Seo";
import { Button } from "@/components/ui/button";
import MtnCheckField from "@/components/mtn/MtnCheckField";
import { checkNumbers, normalizeGh, STATUS_COPY, SUBMIT_COPY, submitNumbers, type CheckResult, type CheckStatus } from "@/lib/mtnCheck";

/* datayego.com/check-mtn: check one number, or paste up to 100. Public, free, no login. */
const parse = (text: string) => [...new Set(text.split(/[^\d+]+/).map(normalizeGh).filter((n) => n.length >= 9))].slice(0, 100);
const toneClass: Record<"ok" | "wait" | "bad", string> = { ok: "text-primary-glow", wait: "text-amber", bad: "text-danger" };
const ToneIcon = ({ tone }: { tone: "ok" | "wait" | "bad" }) => tone === "ok" ? <Check size={15} /> : tone === "wait" ? <Clock size={15} /> : <X size={15} />;

export default function CheckMtn({ embedded = false }: { embedded?: boolean } = {}) {
  const [bulk, setBulk] = useState("");
  const [results, setResults] = useState<CheckResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [submitNotes, setSubmitNotes] = useState<Record<string, string>>({});
  const numbers = useMemo(() => parse(bulk), [bulk]);
  const run = async () => {
    if (numbers.length === 0) return;
    setBusy(true); setSubmitNotes({});
    try { setResults(await checkNumbers(numbers)); } catch { toast.error("Couldn't check right now. Please try again."); } finally { setBusy(false); }
  };
  const counts = useMemo(() => {
    const c = { approved: 0, waiting: 0, bad: 0 };
    for (const r of results ?? []) { const t = STATUS_COPY[r.status].tone; if (t === "ok") c.approved++; else if (t === "wait") c.waiting++; else c.bad++; }
    return c;
  }, [results]);
  const unapproved = useMemo(() => (results ?? []).filter((r) => r.status === "not_approved").map((r) => r.msisdn), [results]);
  const submitAll = async () => {
    if (unapproved.length === 0) return;
    setBusy(true);
    try {
      const outcomes = await submitNumbers(unapproved, "checker_bulk");
      const notes: Record<string, string> = {}; for (const o of outcomes) notes[o.msisdn] = SUBMIT_COPY[o.outcome];
      setSubmitNotes(notes);
      const n = outcomes.filter((o) => o.outcome === "submitted" || o.outcome === "submitted_unconfirmed").length;
      toast.success(n ? `${n} number${n === 1 ? "" : "s"} submitted for MTN verification.` : "Nothing new to submit.");
      setResults((prev) => (prev ?? []).map((r) => notes[r.msisdn] ? { ...r, status: outcomes.find((o) => o.msisdn === r.msisdn)?.outcome === "already_approved" ? "approved" : "unapproved" as CheckStatus, submitted: new Date().toISOString() } : r));
    } catch { toast.error("Couldn't submit right now. Please try again."); } finally { setBusy(false); }
  };
  const copyApproved = async () => {
    const list = (results ?? []).filter((r) => STATUS_COPY[r.status].tone === "ok").map((r) => r.msisdn).join("\n");
    try { await navigator.clipboard.writeText(list); toast.success("Approved numbers copied."); } catch { toast.error("Couldn't copy."); }
  };
  return (
    <div className={embedded ? "w-full space-y-6" : "mx-auto w-full max-w-[760px] space-y-6"}>
      {!embedded && <Seo title="Check MTN number · DataYego" description="Check whether an MTN number is approved for instant data delivery, and submit it for verification if not. Free, no account needed." path="/check-mtn" />}
      <section className="onyx-panel rounded-[24px] p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary-glow">MTN number check</p>
        <h1 className="mt-2 font-display text-[26px] font-semibold leading-tight text-foreground">{embedded ? "Check a customer's MTN number" : "Is this MTN number ready for instant data?"}</h1>
        <p className="mt-2 text-[13.5px] leading-6 text-muted-foreground">{embedded ? "MTN verifies a number the first time it receives a bundle from our supplier. Approved numbers get data in minutes; new ones can take a few days. Check before you sell so you can tell your customer what to expect." : "MTN verifies a number the first time it receives a bundle from our supplier. Approved numbers get data in minutes; new ones can take a few days. Check before you buy, for yourself or for the people you buy for."}</p>
        <div className="mt-5"><p className="mb-2 text-[13px] font-semibold text-foreground">Check one number</p><MtnCheckField source="checker" /></div>
      </section>
      <section className="onyx-panel rounded-[24px] p-6">
        <p className="text-[13px] font-semibold text-foreground">Check many numbers</p>
        <p className="mt-1 text-[12.5px] leading-5 text-muted-foreground">Paste up to 100 MTN numbers, one per line or separated by commas or spaces.</p>
        <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={5} placeholder={"0241234567\n0551234567\n0591234567"} className="onyx-field mt-3 w-full resize-y font-mono text-[14px]" />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button onClick={() => void run()} disabled={busy || numbers.length === 0}>{busy ? <Loader2 className="animate-spin" /> : null}Check {numbers.length > 0 ? `${numbers.length} number${numbers.length === 1 ? "" : "s"}` : "numbers"}</Button>
          {results && results.length > 0 && <Button variant="soft" onClick={() => void copyApproved()}><ClipboardCopy />Copy approved</Button>}
          {unapproved.length > 0 && <Button variant="soft" disabled={busy} onClick={() => void submitAll()}>Submit {unapproved.length} for verification</Button>}
        </div>
        {results && (
          <div className="mt-5">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-white/[0.03] py-3"><p className="text-[18px] font-semibold tabular-nums text-primary-glow">{counts.approved}</p><p className="text-[11px] text-faint-foreground">Approved</p></div>
              <div className="rounded-2xl bg-white/[0.03] py-3"><p className="text-[18px] font-semibold tabular-nums text-amber">{counts.waiting}</p><p className="text-[11px] text-faint-foreground">Needs verification</p></div>
              <div className="rounded-2xl bg-white/[0.03] py-3"><p className="text-[18px] font-semibold tabular-nums text-danger">{counts.bad}</p><p className="text-[11px] text-faint-foreground">Can't be sent</p></div>
            </div>
            <ul className="mt-4 divide-y divide-white/[0.06]">
              {results.map((r) => { const c = STATUS_COPY[r.status]; return (
                <li key={r.msisdn} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="min-w-0"><p className="font-mono text-[14px] text-foreground">{r.msisdn}</p>{submitNotes[r.msisdn] && <p className="mt-0.5 text-[11.5px] text-faint-foreground">{submitNotes[r.msisdn]}</p>}</div>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 text-[12.5px] font-semibold ${toneClass[c.tone]}`}><ToneIcon tone={c.tone} />{c.title}</span>
                </li>); })}
            </ul>
          </div>
        )}
      </section>
      <section className="onyx-panel rounded-[24px] p-6 text-[13.5px] leading-6 text-muted-foreground">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint-foreground">How it works</p>
        <p className="mt-2"><b className="text-foreground">Approved</b> numbers receive bundles in minutes. <b className="text-foreground">Not yet approved</b> numbers can still be bought for: the order goes through once MTN approves the number, usually within a few days, and every order after that is fast.</p>
        <p className="mt-2"><b className="text-foreground">Submit for verification</b> puts a number in MTN's queue without buying anything. Use it for numbers you'll buy for later, so they're ready when you need them.</p>
        <p className="mt-2">Checking is free, needs no account, and does nothing to the number.</p>
      </section>
    </div>
  );
}
