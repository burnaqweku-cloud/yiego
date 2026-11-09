import { useEffect, useState } from "react";
import { Link2, ShieldCheck, X } from "lucide-react";
import {
  applyTikTokConsent,
} from "@/lib/tiktokPixel";
import {
  globalPrivacyControlEnabled,
  readAdvertisingConsent,
  requiresAdvertisingConsent,
  saveAdvertisingConsent,
  TIKTOK_CONSENT_NOTICE,
  TIKTOK_CONSENT_NOTICE_VERSION,
  TIKTOK_CONSENT_STORAGE_KEY,
  visitorRegion,
  type AdvertisingChoice,
} from "@/lib/tiktokConsent";

const SETTINGS_EVENT = "yiego:cookie-settings";

export function openCookieSettings(): void {
  window.dispatchEvent(new Event(SETTINGS_EVENT));
}

export default function TikTokConsent() {
  const [open, setOpen] = useState(false);
  const [region, setRegion] = useState("XX");
  const [gpc, setGpc] = useState(false);

  useEffect(() => {
    let active = true;
    let currentRegion = "XX";
    const apply = () => {
      const allowed = applyTikTokConsent(currentRegion);
      if (active) setGpc(globalPrivacyControlEnabled());
      return allowed;
    };

    void visitorRegion().then((resolved) => {
      if (!active) return;
      currentRegion = resolved;
      setRegion(resolved);
      apply();
      const record = readAdvertisingConsent();
      if (requiresAdvertisingConsent(resolved) && !record && !globalPrivacyControlEnabled()) setOpen(true);
    });

    const openSettings = () => setOpen(true);
    const storage = (event: StorageEvent) => {
      if (event.key === TIKTOK_CONSENT_STORAGE_KEY) apply();
    };
    window.addEventListener(SETTINGS_EVENT, openSettings);
    window.addEventListener("storage", storage);
    return () => {
      active = false;
      window.removeEventListener(SETTINGS_EVENT, openSettings);
      window.removeEventListener("storage", storage);
    };
  }, []);

  const choose = (choice: AdvertisingChoice) => {
    saveAdvertisingConsent(choice, region);
    applyTikTokConsent(region);
    setOpen(false);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] p-3 sm:p-5" role="dialog" aria-modal="true" aria-labelledby="tiktok-consent-title" aria-describedby="tiktok-consent-copy">
      <div className="mx-auto max-w-3xl rounded-3xl border border-border bg-background/95 p-5 text-foreground shadow-2xl backdrop-blur sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary-glow"><ShieldCheck size={20} /></span>
          <div className="min-w-0 flex-1">
            <h2 id="tiktok-consent-title" className="font-display text-lg font-semibold">Advertising cookies</h2>
            <p id="tiktok-consent-copy" className="mt-2 text-[13px] leading-5 text-muted-foreground">{TIKTOK_CONSENT_NOTICE}</p>
            <p className="mt-2 text-xs leading-5 text-faint-foreground">Notice version {TIKTOK_CONSENT_NOTICE_VERSION}. Essential ordering, payment and security features work either way. You can change this later under Cookie settings.</p>
          </div>
          <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground" aria-label="Close cookie settings"><X size={17} /></button>
        </div>
        {gpc && <p className="mt-4 rounded-2xl bg-muted p-3 text-[13px] leading-5 text-foreground">Your browser's Global Privacy Control signal is on, so TikTok tracking stays off even if you previously accepted.</p>}
        <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <a href="https://datayego.com/legal/privacy" target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-[13px] font-semibold text-primary-glow underline underline-offset-4"><Link2 size={14} />Privacy policy</a>
          <div className="grid grid-cols-2 gap-2 sm:min-w-[300px]">
            <button type="button" onClick={() => choose("denied")} className="min-h-11 rounded-xl bg-muted px-4 text-[13px] font-semibold text-foreground">Reject</button>
            {!gpc && <button type="button" onClick={() => choose("granted")} className="min-h-11 rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-foreground">Accept</button>}
            {gpc && <button type="button" onClick={() => setOpen(false)} className="min-h-11 rounded-xl bg-primary px-4 text-[13px] font-semibold text-primary-foreground">Got it</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
