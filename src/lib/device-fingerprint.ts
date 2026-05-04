/**
 * Generate a stable device fingerprint hash from browser properties.
 * Used for anti-abuse detection in referral system.
 */
export async function generateDeviceFingerprint(): Promise<string> {
  const components: string[] = [];

  // User agent
  components.push(navigator.userAgent || 'unknown');

  // Screen resolution
  components.push(`${screen.width}x${screen.height}x${screen.colorDepth}`);

  // Timezone
  components.push(Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown');

  // Language
  components.push(navigator.language || 'unknown');

  // Device memory (if available)
  const nav = navigator as any;
  if (nav.deviceMemory) {
    components.push(`mem:${nav.deviceMemory}`);
  }

  // Hardware concurrency
  if (navigator.hardwareConcurrency) {
    components.push(`cores:${navigator.hardwareConcurrency}`);
  }

  // Platform
  components.push(navigator.platform || 'unknown');

  // Touch support
  components.push(`touch:${navigator.maxTouchPoints || 0}`);

  const raw = components.join('|');

  // Create SHA-256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
