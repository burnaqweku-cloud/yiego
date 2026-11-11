import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { enablePush, pushState } from "@/lib/push";

/* Inside the Android app only: one strip offering to switch notifications on.
   Shown while the phone has not been asked yet; gone once allowed, refused, or put off for a week. */
const LATER_KEY = "yg-push-later";
const LATER_MS = 7 * 86400000;

export default function PushPrompt({ className = "" }: { className?: string }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    try { const at = Number(localStorage.getItem(LATER_KEY)); if (at > 0 && Date.now() - at < LATER_MS) return; } catch { /* storage unavailable */ }
    void pushState().then((s) => { if (live && s === "prompt") setShow(true); });
    return () => { live = false; };
  }, []);
  if (!show) return null;
  const later = () => { try { localStorage.setItem(LATER_KEY, String(Date.now())); } catch { /* storage unavailable */ } setShow(false); };
  const turnOn = async () => { setBusy(true); await enablePush(); setBusy(false); setShow(false); };
  return (
    <div className={`yg-appbar ${className}`} role="region" aria-label="Notifications">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] bg-primary/[0.12] text-primary-glow"><Bell size={20} aria-hidden="true" /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold leading-tight text-foreground">Turn on notifications</span>
        <span className="block text-[12.5px] leading-snug text-muted-foreground">Know the moment your data arrives</span>
      </span>
      <button type="button" onClick={later} className="shrink-0 px-1.5 py-2 text-[13px] font-medium text-muted-foreground">Not now</button>
      <button type="button" onClick={() => void turnOn()} disabled={busy} className="yg-appbar-cta">{busy ? "Turning on…" : "Turn on"}</button>
    </div>
  );
}
