/* A stable, privacy-safe device fingerprint: a hash of hardware/browser traits.
   Used only to stop one device creating several "referred" accounts. */
async function sha256(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function canvasTrait() {
  try {
    const c = document.createElement("canvas"); c.width = 200; c.height = 40;
    const x = c.getContext("2d"); if (!x) return "nocanvas";
    x.textBaseline = "top"; x.font = "14px Arial"; x.fillStyle = "#f60"; x.fillRect(10, 5, 80, 20);
    x.fillStyle = "#069"; x.fillText("DataYego \u2022 gh", 2, 2); x.fillStyle = "rgba(102,204,0,0.7)"; x.fillText("DataYego \u2022 gh", 4, 4);
    return c.toDataURL().slice(-64);
  } catch { return "nocanvas"; }
}
let cached: string | null = null;
export async function deviceHash(): Promise<string> {
  if (cached) return cached;
  const n = navigator as Navigator & { deviceMemory?: number };
  const traits = [
    n.userAgent, n.language, (n.languages ?? []).join(","), n.platform, String(n.hardwareConcurrency ?? ""), String(n.deviceMemory ?? ""),
    String(screen.width), String(screen.height), String(screen.colorDepth), String(window.devicePixelRatio),
    Intl.DateTimeFormat().resolvedOptions().timeZone, String(n.maxTouchPoints ?? ""), canvasTrait(),
  ].join("|");
  cached = await sha256(traits);
  return cached;
}
