import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Returns true when the app is running in standalone / installed-PWA mode. */
export function isPWAInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  // iOS Safari sets navigator.standalone
  if ((window.navigator as any).standalone === true) return true;
  // Android Chrome / other browsers
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
  return false;
}

/** Returns 'ios' | 'android' | 'desktop' based on user-agent. */
function detectPlatform(): string {
  const ua = navigator.userAgent || '';
  if (/iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

/**
 * Lightweight fingerprint — not unique enough for identity but good enough
 * for rough device-level analytics deduplication.
 */
function buildFingerprint(): string {
  const ua = navigator.userAgent || '';
  const lang = navigator.language || '';
  const tz = Intl?.DateTimeFormat?.()?.resolvedOptions?.()?.timeZone ?? '';
  const w = screen?.width ?? 0;
  const h = screen?.height ?? 0;
  const raw = `${ua}|${lang}|${tz}|${w}x${h}`;

  // Simple djb2-style hash → hex string
  let hash = 5381;
  for (let i = 0; i < raw.length; i++) {
    hash = ((hash << 5) + hash) ^ raw.charCodeAt(i);
    hash = hash & hash; // keep 32-bit
  }
  return Math.abs(hash).toString(16).padStart(8, '0') +
    '-' + (w + h).toString(16) +
    '-' + lang.replace(/[^a-z]/gi, '').slice(0, 6);
}

// ─── Hook ────────────────────────────────────────────────────────────────────

/**
 * Silently tracks PWA install status.
 * - For logged-in users: updates `profiles` table fields.
 * - For all visitors: upserts `pwa_devices` table.
 * Runs once per session; throttled to avoid hammering the DB.
 */
export function usePWATracking(userId: string | null | undefined) {
  const trackedRef = useRef(false);

  useEffect(() => {
    // Only run once per session mount
    if (trackedRef.current) return;
    trackedRef.current = true;

    const run = async () => {
      const isPWA = isPWAInstalled();
      const platform = detectPlatform();
      const ua = navigator.userAgent || '';
      const fingerprint = buildFingerprint();
      const now = new Date().toISOString();

      // ── Guest / device-level tracking ─────────────────────────────────
      // Lightweight upsert on pwa_devices
      const devicePayload: Record<string, unknown> = {
        device_fingerprint: fingerprint,
        last_seen_at: now,
        user_agent: ua,
        platform,
        is_pwa: isPWA,
      };
      if (isPWA) {
        devicePayload.last_pwa_seen_at = now;
      }

      await supabase
        .from('pwa_devices' as any)
        .upsert(devicePayload, {
          onConflict: 'device_fingerprint',
          ignoreDuplicates: false,
        })
        .then(({ error }) => {
          // Non-blocking — ignore errors silently
          if (error) console.debug('[PWA] device upsert error', error.message);
        });

      // Set first_pwa_detected_at only if not yet set (done server-side via upsert logic below)
      if (isPWA) {
        await supabase
          .from('pwa_devices' as any)
          .update({ first_pwa_detected_at: now })
          .eq('device_fingerprint', fingerprint)
          .is('first_pwa_detected_at', null)
          .then(() => {});
      }

      // ── Logged-in user tracking ────────────────────────────────────────
      if (!userId) return;

      // Fetch current profile PWA state
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_pwa_user, pwa_first_detected_at')
        .eq('id', userId)
        .maybeSingle();

      if (!profile) return;

      if (isPWA) {
        const updates: Record<string, unknown> = { pwa_last_seen_at: now };
        if (!profile.is_pwa_user) {
          updates.is_pwa_user = true;
          updates.pwa_first_detected_at = now;
        }
        await supabase
          .from('profiles')
          .update(updates as any)
          .eq('id', userId)
          .then(() => {});
      }
    };

    // Run after a short delay so it doesn't block initial render
    const timer = setTimeout(run, 1500);
    return () => clearTimeout(timer);
  }, [userId]);
}
