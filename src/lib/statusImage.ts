import type { Phase1Product } from "@/lib/phase1-api";

/* ══════════════════════════════════════════════════════════════
   Status maker: a 1080×1920 WhatsApp-status image for one bundle,
   a promo, or a whole network, drawn on the phone from live prices.

   Each store template has its own look so the image reads like the
   store it points to:
     market  — chalk paper, ink-blue board, sun-yellow tag, coral price, Rubik
     studio  — white, slate text, accent button, Plus Jakarta Sans
     classic — deep green, accent highlights, Manrope
   The store's logo, name, accent and link are on every one. Nothing
   of DataYego's.
   ══════════════════════════════════════════════════════════════ */

export type StatusTemplate = "classic" | "market" | "studio";
export type StatusKind = "bundle" | "two" | "three" | "promo" | "network";
/** How many bundles each kind needs on the image (network = all of them). */
export const bundlesFor = (k: StatusKind) => k === "two" ? 2 : k === "three" ? 3 : k === "network" ? 0 : 1;
export interface StatusStore { name: string; link: string; logoUrl?: string | null; accent?: string | null; tagline?: string | null }
export interface StatusBundle { product: Phase1Product; price: number; wasPrice?: number | null; endsAt?: string | null }
export interface StatusInput { template: StatusTemplate; kind: StatusKind; store: StatusStore; bundles: StatusBundle[]; network: string }

const W = 1080, H = 1920;
const FONTS: Record<StatusTemplate, string> = { market: "https://fonts.googleapis.com/css2?family=Rubik:wght@500;700;900&display=swap", studio: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap", classic: "https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&display=swap" };
const FAMILY: Record<StatusTemplate, string> = { market: "Rubik", studio: "Plus Jakarta Sans", classic: "Manrope" };

export const sizeOf = (p: Phase1Product) => p.name.replace(/^.*?—\s*/, "").trim();
export const networkOf = (p: Phase1Product) => (p.app_product_code ?? "").startsWith("mtn") ? "MTN" : (p.app_product_code ?? "").startsWith("tel") ? "Telecel" : "AirtelTigo";
const money = (n: number) => `GH₵${n.toFixed(2).replace(/\.00$/, "")}`;
const hex = (v: string | null | undefined, fallback: string) => (v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback);
const until = (iso?: string | null) => iso ? `until ${new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "short" })}` : "";

/** Make sure the template's font is loaded before drawing, so the canvas doesn't fall back to Arial. */
async function ensureFont(t: StatusTemplate) {
  const href = FONTS[t];
  if (!document.querySelector(`link[href="${href}"]`)) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.appendChild(l); }
  const fam = FAMILY[t];
  try { await Promise.all([900, 800, 700, 600, 500].map((w) => document.fonts.load(`${w} 40px "${fam}"`).catch(() => []))); await document.fonts.ready; } catch { /* draw with fallback */ }
}
async function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => res(null); i.src = url; });
}
function rr(x: CanvasRenderingContext2D, X: number, Y: number, w: number, h: number, r: number) { x.beginPath(); x.roundRect(X, Y, w, h, r); }
function fit(x: CanvasRenderingContext2D, text: string, max: number, px: number, weight: number, fam: string, min = 28) {
  let s = px; x.font = `${weight} ${s}px "${fam}", Arial, sans-serif`;
  while (x.measureText(text).width > max && s > min) { s -= 2; x.font = `${weight} ${s}px "${fam}", Arial, sans-serif`; }
  return s;
}
function logoCircle(x: CanvasRenderingContext2D, img: HTMLImageElement | null, cx: number, cy: number, r: number, bg: string, ring: string) {
  x.save(); x.fillStyle = bg; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
  x.lineWidth = 6; x.strokeStyle = ring; x.stroke();
  if (img) { x.beginPath(); x.arc(cx, cy, r - 8, 0, Math.PI * 2); x.clip(); const s = Math.max((r * 2 - 16) / img.width, (r * 2 - 16) / img.height); const w = img.width * s, h = img.height * s; x.drawImage(img, cx - w / 2, cy - h / 2, w, h); }
  x.restore();
}
function initial(x: CanvasRenderingContext2D, name: string, cx: number, cy: number, px: number, color: string, fam: string) {
  x.fillStyle = color; x.font = `900 ${px}px "${fam}", Arial, sans-serif`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(name.trim().slice(0, 1).toUpperCase(), cx, cy + px * 0.04); x.textAlign = "left"; x.textBaseline = "alphabetic";
}

/* ─────────────── TWO / THREE BUNDLE LAYOUTS (shared) ───────────────
   Fixed layouts so the image never breaks: two bundles sit side by side
   ("this or that"), three stack as rows with the middle one tagged. Each
   template passes its own colours; geometry is the same. */
interface MultiStyle { fam: string; card: string; size: string; sub: string; price: string; tagBg: string; tagInk: string; cardRadius: number; weightSize: number; weightPrice: number }
function drawTwo(x: CanvasRenderingContext2D, bundles: StatusBundle[], y0: number, y1: number, st: MultiStyle) {
  const left = 130, gap = 28, cw = Math.floor((W - 260 - gap) / 2), ch = y1 - y0; const rows = bundles.slice(0, 2);
  // one size for all cards, so 45.65 and 88 don't come out different
  const sz = Math.min(...rows.map((b) => fit(x, sizeOf(b.product), cw - 60, 150, st.weightSize, st.fam, 70)));
  const pz = Math.min(...rows.map((b) => fit(x, money(b.price), cw - 50, 92, st.weightPrice, st.fam, 50)));
  rows.forEach((b, i) => {
    const cx = left + i * (cw + gap);
    x.fillStyle = st.card; rr(x, cx, y0, cw, ch, st.cardRadius); x.fill();
    x.fillStyle = st.size; x.font = `${st.weightSize} ${sz}px "${st.fam}", Arial, sans-serif`; x.textAlign = "center"; x.fillText(sizeOf(b.product), cx + cw / 2, y0 + ch * 0.36);
    x.fillStyle = st.sub; x.font = `500 30px "${st.fam}", Arial, sans-serif`; x.fillText(b.product.validity ?? "No expiry", cx + cw / 2, y0 + ch * 0.36 + 56);
    x.fillStyle = st.price; x.font = `${st.weightPrice} ${pz}px "${st.fam}", Arial, sans-serif`; x.fillText(money(b.price), cx + cw / 2, y0 + ch * 0.78);
    x.textAlign = "left";
  });
  // "or" between the cards
  const mx = left + cw + gap / 2, my = y0 + ch / 2;
  x.fillStyle = st.tagBg; x.beginPath(); x.arc(mx, my, 40, 0, Math.PI * 2); x.fill();
  x.fillStyle = st.tagInk; x.font = `900 30px "${st.fam}", Arial, sans-serif`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("or", mx, my + 2); x.textAlign = "left"; x.textBaseline = "alphabetic";
}
function drawThree(x: CanvasRenderingContext2D, bundles: StatusBundle[], y0: number, y1: number, st: MultiStyle) {
  const rows = bundles.slice(0, 3); const gap = 26; const rh = Math.floor((y1 - y0 - gap * 2) / 3);
  const sz = Math.min(...rows.map((b) => fit(x, sizeOf(b.product), 380, 108, st.weightSize, st.fam, 60)));
  const pz = Math.min(...rows.map((b) => fit(x, money(b.price), 380, 92, st.weightPrice, st.fam, 50)));
  rows.forEach((b, i) => {
    const ry = y0 + i * (rh + gap); const popular = i === 1 && rows.length === 3;
    x.fillStyle = st.card; rr(x, 130, ry, W - 260, rh, st.cardRadius); x.fill();
    if (popular) { x.strokeStyle = st.tagBg; x.lineWidth = 4; rr(x, 132, ry + 2, W - 264, rh - 4, st.cardRadius - 2); x.stroke(); }
    x.fillStyle = st.size; x.font = `${st.weightSize} ${sz}px "${st.fam}", Arial, sans-serif`; x.fillText(sizeOf(b.product), 170, ry + rh * 0.56);
    x.fillStyle = st.sub; x.font = `500 28px "${st.fam}", Arial, sans-serif`; x.fillText(b.product.validity ?? "No expiry", 174, ry + rh * 0.56 + 48);
    x.fillStyle = st.price; x.font = `${st.weightPrice} ${pz}px "${st.fam}", Arial, sans-serif`; x.textAlign = "right"; x.fillText(money(b.price), W - 170, ry + rh * 0.56 + 16); x.textAlign = "left";
    if (popular) {
      x.fillStyle = st.tagBg; rr(x, W - 170 - 250, ry - 24, 250, 50, 25); x.fill();
      x.fillStyle = st.tagInk; x.font = `900 24px "${st.fam}", Arial, sans-serif`; x.textAlign = "center"; x.fillText("MOST POPULAR", W - 170 - 125, ry + 10); x.textAlign = "left";
    }
  });
}

/* ───────────────────────── MARKET ───────────────────────── */
function drawMarket(x: CanvasRenderingContext2D, inp: StatusInput, logo: HTMLImageElement | null) {
  const fam = FAMILY.market; const accent = hex(inp.store.accent, "#ff5a3c"); const INK = "#1d2460", SUN = "#ffd23f", CHALK = "#fff8ec";
  x.fillStyle = CHALK; x.fillRect(0, 0, W, H);
  // faint paper texture: dots
  x.fillStyle = "rgba(29,36,96,0.05)"; for (let i = 0; i < 260; i++) { x.beginPath(); x.arc((i * 137) % W, (i * 241) % H, 2 + (i % 3), 0, Math.PI * 2); x.fill(); }
  // header: logo + store name
  logoCircle(x, logo, 150, 190, 90, "#ffffff", INK); if (!logo) initial(x, inp.store.name, 150, 190, 80, INK, fam);
  const nameSize = fit(x, inp.store.name, W - 300 - 80, 64, 900, fam, 36); x.fillStyle = INK; x.font = `900 ${nameSize}px "${fam}", Arial, sans-serif`; x.fillText(inp.store.name, 270, 180);
  x.fillStyle = "#4b5178"; x.font = `500 30px "${fam}", Arial, sans-serif`; x.fillText(inp.store.tagline || "MTN · Telecel · AirtelTigo", 270, 232);
  // the board
  const top = 330, bh = 1180; x.fillStyle = accent; rr(x, 80 + 14, top + 14, W - 160, bh, 44); x.fill();
  x.fillStyle = INK; rr(x, 80, top, W - 160, bh, 44); x.fill();
  const b = inp.bundles[0];
  const multi = inp.kind === "two" || inp.kind === "three";
  if (multi && b) {
    x.save(); x.translate(150, top + 110); x.rotate(-0.06); x.fillStyle = SUN; rr(x, 0, -44, 300, 88, 20); x.fill(); x.fillStyle = INK; x.font = `900 40px "${fam}", Arial, sans-serif`; x.fillText(networkOf(b.product), 36, 14); x.restore();
    x.fillStyle = "rgba(255,255,255,0.7)"; x.font = `500 36px "${fam}", Arial, sans-serif`; x.textAlign = "right"; x.fillText(inp.kind === "two" ? "Pick one" : "Pick your size", W - 130, top + 124); x.textAlign = "left";
    const st: MultiStyle = { fam, card: "rgba(255,255,255,0.09)", size: "#fff", sub: "rgba(255,255,255,0.6)", price: accent, tagBg: SUN, tagInk: INK, cardRadius: 32, weightSize: 900, weightPrice: 900 };
    if (inp.kind === "two") drawTwo(x, inp.bundles, top + 220, top + 920, st); else drawThree(x, inp.bundles, top + 230, top + 940, st);
    x.fillStyle = SUN; rr(x, 130, top + 1010, W - 260, 110, 55); x.fill(); x.fillStyle = INK; x.font = `900 44px "${fam}", Arial, sans-serif`; x.textAlign = "center"; x.fillText("BUY NOW  →", W / 2, top + 1082); x.textAlign = "left";
  } else if (inp.kind !== "network" && b) {
    // yellow network tag, tilted
    x.save(); x.translate(150, top + 110); x.rotate(-0.06); x.fillStyle = SUN; rr(x, 0, -44, 300, 88, 20); x.fill(); x.fillStyle = INK; x.font = `900 40px "${fam}", Arial, sans-serif`; x.fillText(networkOf(b.product), 36, 14); x.restore();
    if (inp.kind === "promo") { x.save(); x.translate(W - 150, top + 110); x.rotate(0.08); x.fillStyle = accent; rr(x, -270, -44, 270, 88, 20); x.fill(); x.fillStyle = "#fff"; x.font = `900 40px "${fam}", Arial, sans-serif`; x.textAlign = "right"; x.fillText("PROMO", -32, 14); x.textAlign = "left"; x.restore(); }
    // size, huge
    const size = sizeOf(b.product); const sz = fit(x, size, W - 280, 260, 900, fam, 120);
    x.fillStyle = "#fff"; x.font = `900 ${sz}px "${fam}", Arial, sans-serif`; x.fillText(size, 130, top + 460);
    x.fillStyle = "rgba(255,255,255,0.7)"; x.font = `500 40px "${fam}", Arial, sans-serif`; x.fillText(`${b.product.validity ?? "No expiry"} · any ${networkOf(b.product)} number`, 134, top + 540);
    // price
    if (b.wasPrice && b.wasPrice > b.price) { x.fillStyle = "rgba(255,255,255,0.55)"; x.font = `700 56px "${fam}", Arial, sans-serif`; const t = money(b.wasPrice); x.fillText(t, 134, top + 690); const w = x.measureText(t).width; x.strokeStyle = accent; x.lineWidth = 8; x.beginPath(); x.moveTo(130, top + 672); x.lineTo(138 + w, top + 672); x.stroke(); }
    const pz = fit(x, money(b.price), W - 280, 190, 900, fam, 100); x.fillStyle = accent; x.font = `900 ${pz}px "${fam}", Arial, sans-serif`; x.fillText(money(b.price), 130, top + 880);
    if (inp.kind === "promo" && b.endsAt) { x.fillStyle = SUN; x.font = `700 38px "${fam}", Arial, sans-serif`; x.fillText(until(b.endsAt), 134, top + 950); }
    // buy button
    x.fillStyle = SUN; rr(x, 130, top + 1010, W - 260, 110, 55); x.fill(); x.fillStyle = INK; x.font = `900 44px "${fam}", Arial, sans-serif`; x.textAlign = "center"; x.fillText("BUY NOW  →", W / 2, top + 1082); x.textAlign = "left";
  } else {
    x.fillStyle = SUN; rr(x, 130, top + 70, 360, 88, 20); x.fill(); x.fillStyle = INK; x.font = `900 44px "${fam}", Arial, sans-serif`; x.fillText(`${inp.network} DATA`, 160, top + 132);
    x.fillStyle = "rgba(255,255,255,0.7)"; x.font = `500 34px "${fam}", Arial, sans-serif`; x.fillText("Today's prices", 134, top + 220);
    const rows = inp.bundles.slice(0, 12); const lh = Math.min(118, Math.floor(860 / Math.max(rows.length, 1))); const fz = Math.min(52, Math.round(lh * 0.5));
    let y = top + 300;
    for (const r of rows) {
      x.fillStyle = "#fff"; x.font = `700 ${fz}px "${fam}", Arial, sans-serif`; x.fillText(sizeOf(r.product), 140, y);
      x.fillStyle = "rgba(255,255,255,0.5)"; x.font = `500 ${Math.round(fz * 0.62)}px "${fam}", Arial, sans-serif`; x.fillText(r.product.validity ?? "", 440, y);
      x.fillStyle = accent; x.font = `900 ${fz}px "${fam}", Arial, sans-serif`; x.textAlign = "right"; x.fillText(money(r.price), W - 140, y); x.textAlign = "left";
      x.strokeStyle = "rgba(255,255,255,0.1)"; x.lineWidth = 2; x.beginPath(); x.moveTo(140, y + Math.round(lh * 0.3)); x.lineTo(W - 140, y + Math.round(lh * 0.3)); x.stroke();
      y += lh;
    }
  }
  // footer: link
  x.fillStyle = INK; x.font = `900 46px "${fam}", Arial, sans-serif`; x.textAlign = "center"; x.fillText(inp.store.link.replace(/^https?:\/\//, ""), W / 2, 1640); x.textAlign = "left";
  x.fillStyle = "#4b5178"; x.font = `500 32px "${fam}", Arial, sans-serif`; x.textAlign = "center"; x.fillText("Pay with MoMo or card · delivered to any number", W / 2, 1700); x.textAlign = "left";
  // sun stripe at the bottom
  x.fillStyle = SUN; x.fillRect(0, H - 24, W, 24); x.fillStyle = accent; x.fillRect(0, H - 48, W, 24);
}

/* ───────────────────────── STUDIO ───────────────────────── */
function drawStudio(x: CanvasRenderingContext2D, inp: StatusInput, logo: HTMLImageElement | null) {
  const fam = FAMILY.studio; const accent = hex(inp.store.accent, "#2563eb"); const INK = "#0f172a", SLATE = "#475569", MIST = "#f4f6fa", LINE = "#e5e9f0";
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
  x.fillStyle = MIST; x.fillRect(0, 0, W, 300);
  logoCircle(x, logo, 150, 150, 80, "#ffffff", LINE); if (!logo) initial(x, inp.store.name, 150, 150, 64, accent, fam);
  const nameSize = fit(x, inp.store.name, W - 300 - 80, 56, 800, fam, 34); x.fillStyle = INK; x.font = `800 ${nameSize}px "${fam}", Arial, sans-serif`; x.fillText(inp.store.name, 260, 142);
  x.fillStyle = SLATE; x.font = `500 28px "${fam}", Arial, sans-serif`; x.fillText(inp.store.tagline || "MTN · Telecel · AirtelTigo", 260, 190);
  const b = inp.bundles[0];
  const multi = inp.kind === "two" || inp.kind === "three";
  if (multi && b) {
    x.fillStyle = accent; rr(x, 120, 420, 220, 64, 32); x.fill(); x.fillStyle = "#fff"; x.font = `700 30px "${fam}", Arial, sans-serif`; x.textAlign = "center"; x.fillText(networkOf(b.product), 230, 462); x.textAlign = "left";
    x.fillStyle = SLATE; x.font = `600 34px "${fam}", Arial, sans-serif`; x.textAlign = "right"; x.fillText(inp.kind === "two" ? "Pick one" : "Pick your size", W - 120, 466); x.textAlign = "left";
    const st: MultiStyle = { fam, card: MIST, size: INK, sub: SLATE, price: accent, tagBg: accent, tagInk: "#fff", cardRadius: 32, weightSize: 800, weightPrice: 800 };
    if (inp.kind === "two") drawTwo(x, inp.bundles, 560, 1280, st); else drawThree(x, inp.bundles, 570, 1300, st);
    x.fillStyle = accent; rr(x, 120, 1380, W - 240, 112, 24); x.fill(); x.fillStyle = "#fff"; x.font = `700 40px "${fam}", Arial, sans-serif`; x.textAlign = "center"; x.fillText("Buy now", W / 2, 1452); x.textAlign = "left";
  } else if (inp.kind !== "network" && b) {
    // pill
    x.fillStyle = accent; rr(x, 120, 420, 220, 64, 32); x.fill(); x.fillStyle = "#fff"; x.font = `700 30px "${fam}", Arial, sans-serif`; x.textAlign = "center"; x.fillText(networkOf(b.product), 230, 462); x.textAlign = "left";
    if (inp.kind === "promo") { x.fillStyle = "#fff1e6"; rr(x, 360, 420, 220, 64, 32); x.fill(); x.fillStyle = "#c2410c"; x.font = `700 30px "${fam}", Arial, sans-serif`; x.textAlign = "center"; x.fillText("PROMO", 470, 462); x.textAlign = "left"; }
    const size = sizeOf(b.product); const sz = fit(x, size, W - 240, 240, 800, fam, 120);
    x.fillStyle = INK; x.font = `800 ${sz}px "${fam}", Arial, sans-serif`; x.fillText(size, 116, 780);
    x.fillStyle = SLATE; x.font = `500 38px "${fam}", Arial, sans-serif`; x.fillText(`${b.product.validity ?? "No expiry"} · any ${networkOf(b.product)} number`, 120, 850);
    // price card
    x.fillStyle = MIST; rr(x, 120, 940, W - 240, 360, 36); x.fill();
    x.fillStyle = SLATE; x.font = `600 30px "${fam}", Arial, sans-serif`; x.fillText(inp.kind === "promo" ? "Promo price" : "Price", 170, 1010);
    if (b.wasPrice && b.wasPrice > b.price) { x.fillStyle = "#94a3b8"; x.font = `600 48px "${fam}", Arial, sans-serif`; const t = money(b.wasPrice); x.fillText(t, 170, 1090); const w = x.measureText(t).width; x.strokeStyle = "#94a3b8"; x.lineWidth = 5; x.beginPath(); x.moveTo(168, 1074); x.lineTo(174 + w, 1074); x.stroke(); }
    const pz = fit(x, money(b.price), W - 340, 150, 800, fam, 90); x.fillStyle = accent; x.font = `800 ${pz}px "${fam}", Arial, sans-serif`; x.fillText(money(b.price), 170, 1240);
    if (inp.kind === "promo" && b.endsAt) { x.fillStyle = "#c2410c"; x.font = `600 32px "${fam}", Arial, sans-serif`; x.textAlign = "right"; x.fillText(until(b.endsAt), W - 170, 1250); x.textAlign = "left"; }
    x.fillStyle = accent; rr(x, 120, 1380, W - 240, 112, 24); x.fill(); x.fillStyle = "#fff"; x.font = `700 40px "${fam}", Arial, sans-serif`; x.textAlign = "center"; x.fillText("Buy now", W / 2, 1452); x.textAlign = "left";
  } else {
    x.fillStyle = INK; x.font = `800 72px "${fam}", Arial, sans-serif`; x.fillText(`${inp.network} bundles`, 120, 460);
    x.fillStyle = SLATE; x.font = `500 32px "${fam}", Arial, sans-serif`; x.fillText("Today's prices", 120, 520);
    const rows = inp.bundles.slice(0, 12); const lh = Math.min(120, Math.floor(960 / Math.max(rows.length, 1))); const fz = Math.min(52, Math.round(lh * 0.5));
    let y = 620;
    for (const r of rows) {
      x.fillStyle = INK; x.font = `700 ${fz}px "${fam}", Arial, sans-serif`; x.fillText(sizeOf(r.product), 130, y);
      x.fillStyle = "#94a3b8"; x.font = `500 ${Math.round(fz * 0.62)}px "${fam}", Arial, sans-serif`; x.fillText(r.product.validity ?? "", 430, y);
      x.fillStyle = accent; x.font = `800 ${fz}px "${fam}", Arial, sans-serif`; x.textAlign = "right"; x.fillText(money(r.price), W - 130, y); x.textAlign = "left";
      x.strokeStyle = LINE; x.lineWidth = 2; x.beginPath(); x.moveTo(130, y + Math.round(lh * 0.3)); x.lineTo(W - 130, y + Math.round(lh * 0.3)); x.stroke();
      y += lh;
    }
  }
  x.fillStyle = MIST; x.fillRect(0, H - 260, W, 260);
  x.fillStyle = INK; x.font = `800 44px "${fam}", Arial, sans-serif`; x.textAlign = "center"; x.fillText(inp.store.link.replace(/^https?:\/\//, ""), W / 2, H - 150);
  x.fillStyle = SLATE; x.font = `500 30px "${fam}", Arial, sans-serif`; x.fillText("Pay with MoMo or card · delivered to any number", W / 2, H - 90); x.textAlign = "left";
}

/* ───────────────────────── CLASSIC ───────────────────────── */
function drawClassic(x: CanvasRenderingContext2D, inp: StatusInput, logo: HTMLImageElement | null) {
  const fam = FAMILY.classic; const accent = hex(inp.store.accent, "#22c387"); const BG = "#0b1512", MUTED = "#9fb3a9";
  x.fillStyle = BG; x.fillRect(0, 0, W, H);
  const g = x.createRadialGradient(W / 2, 700, 100, W / 2, 700, 1100); g.addColorStop(0, accent + "33"); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = accent; x.fillRect(0, 0, W, 16);
  logoCircle(x, logo, 150, 190, 86, "#ffffff", accent); if (!logo) initial(x, inp.store.name, 150, 190, 72, BG, fam);
  const nameSize = fit(x, inp.store.name, W - 300 - 80, 60, 800, fam, 34); x.fillStyle = "#fff"; x.font = `800 ${nameSize}px "${fam}", Arial, sans-serif`; x.fillText(inp.store.name, 270, 182);
  x.fillStyle = MUTED; x.font = `500 28px "${fam}", Arial, sans-serif`; x.fillText(inp.store.tagline || "MTN · Telecel · AirtelTigo", 270, 232);
  const b = inp.bundles[0];
  const multi = inp.kind === "two" || inp.kind === "three";
  if (multi && b) {
    x.fillStyle = accent + "33"; rr(x, 110, 430, 240, 66, 33); x.fill(); x.fillStyle = accent; x.font = `700 30px "${fam}", Arial, sans-serif`; x.textAlign = "center"; x.fillText(networkOf(b.product), 230, 473); x.textAlign = "left";
    x.fillStyle = MUTED; x.font = `600 34px "${fam}", Arial, sans-serif`; x.textAlign = "right"; x.fillText(inp.kind === "two" ? "Pick one" : "Pick your size", W - 110, 476); x.textAlign = "left";
    const st: MultiStyle = { fam, card: "rgba(255,255,255,0.07)", size: "#fff", sub: MUTED, price: accent, tagBg: accent, tagInk: "#ffffff", cardRadius: 32, weightSize: 800, weightPrice: 800 };
    if (inp.kind === "two") drawTwo(x, inp.bundles, 570, 1270, st); else drawThree(x, inp.bundles, 570, 1290, st);
    x.fillStyle = accent; rr(x, 110, 1360, W - 220, 116, 28); x.fill();
    x.fillStyle = "#ffffff"; x.font = `700 42px "${fam}", Arial, sans-serif`; x.textAlign = "center"; x.fillText("Buy now", W / 2, 1434); x.textAlign = "left";
  } else if (inp.kind !== "network" && b) {
    x.fillStyle = accent + "33"; rr(x, 110, 430, 240, 66, 33); x.fill(); x.fillStyle = accent; x.font = `700 30px "${fam}", Arial, sans-serif`; x.textAlign = "center"; x.fillText(networkOf(b.product), 230, 473); x.textAlign = "left";
    if (inp.kind === "promo") { x.fillStyle = "#f59e0b33"; rr(x, 370, 430, 220, 66, 33); x.fill(); x.fillStyle = "#fbbf24"; x.font = `700 30px "${fam}", Arial, sans-serif`; x.textAlign = "center"; x.fillText("PROMO", 480, 473); x.textAlign = "left"; }
    const size = sizeOf(b.product); const sz = fit(x, size, W - 220, 250, 800, fam, 120);
    x.fillStyle = "#fff"; x.font = `800 ${sz}px "${fam}", Arial, sans-serif`; x.fillText(size, 106, 800);
    x.fillStyle = MUTED; x.font = `500 38px "${fam}", Arial, sans-serif`; x.fillText(`${b.product.validity ?? "No expiry"} · any ${networkOf(b.product)} number`, 110, 870);
    if (b.wasPrice && b.wasPrice > b.price) { x.fillStyle = MUTED; x.font = `600 52px "${fam}", Arial, sans-serif`; const t = money(b.wasPrice); x.fillText(t, 110, 1010); const w = x.measureText(t).width; x.strokeStyle = "#fbbf24"; x.lineWidth = 6; x.beginPath(); x.moveTo(108, 992); x.lineTo(114 + w, 992); x.stroke(); }
    const pz = fit(x, money(b.price), W - 220, 170, 800, fam, 90); x.fillStyle = accent; x.font = `800 ${pz}px "${fam}", Arial, sans-serif`; x.fillText(money(b.price), 106, 1180);
    if (inp.kind === "promo" && b.endsAt) { x.fillStyle = "#fbbf24"; x.font = `600 34px "${fam}", Arial, sans-serif`; x.fillText(until(b.endsAt), 110, 1250); }
    x.fillStyle = accent; rr(x, 110, 1360, W - 220, 116, 28); x.fill();
    x.fillStyle = "#ffffff"; x.font = `700 42px "${fam}", Arial, sans-serif`; x.textAlign = "center"; x.fillText("Buy now", W / 2, 1434); x.textAlign = "left";
  } else {
    x.fillStyle = accent; x.font = `800 72px "${fam}", Arial, sans-serif`; x.fillText(`${inp.network} bundles`, 110, 470);
    x.fillStyle = MUTED; x.font = `500 32px "${fam}", Arial, sans-serif`; x.fillText("Today's prices", 110, 530);
    const rows = inp.bundles.slice(0, 12); const lh = Math.min(120, Math.floor(960 / Math.max(rows.length, 1))); const fz = Math.min(52, Math.round(lh * 0.5));
    let y = 630;
    for (const r of rows) {
      x.fillStyle = "#fff"; x.font = `700 ${fz}px "${fam}", Arial, sans-serif`; x.fillText(sizeOf(r.product), 120, y);
      x.fillStyle = MUTED; x.font = `500 ${Math.round(fz * 0.62)}px "${fam}", Arial, sans-serif`; x.fillText(r.product.validity ?? "", 420, y);
      x.fillStyle = accent; x.font = `800 ${fz}px "${fam}", Arial, sans-serif`; x.textAlign = "right"; x.fillText(money(r.price), W - 120, y); x.textAlign = "left";
      x.strokeStyle = "rgba(255,255,255,0.12)"; x.lineWidth = 2; x.beginPath(); x.moveTo(120, y + Math.round(lh * 0.3)); x.lineTo(W - 120, y + Math.round(lh * 0.3)); x.stroke();
      y += lh;
    }
  }
  x.fillStyle = accent; x.font = `800 44px "${fam}", Arial, sans-serif`; x.textAlign = "center"; x.fillText(inp.store.link.replace(/^https?:\/\//, ""), W / 2, H - 150);
  x.fillStyle = MUTED; x.font = `500 30px "${fam}", Arial, sans-serif`; x.fillText("Pay with MoMo or card · delivered to any number", W / 2, H - 90); x.textAlign = "left";
}

export async function statusImage(inp: StatusInput): Promise<Blob> {
  await ensureFont(inp.template);
  const logo = inp.store.logoUrl ? await loadImage(inp.store.logoUrl) : null;
  const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d")!;
  x.textBaseline = "alphabetic";
  if (inp.template === "market") drawMarket(x, inp, logo); else if (inp.template === "studio") drawStudio(x, inp, logo); else drawClassic(x, inp, logo);
  return await new Promise<Blob>((res) => c.toBlob((b) => res(b!), "image/png"));
}

/** The caption people share with the image. */
export function statusCaption(inp: StatusInput): string {
  const link = inp.store.link.replace(/^https?:\/\//, "");
  const b = inp.bundles[0];
  if (inp.kind === "network") return `${inp.network} data at ${inp.store.name}. Buy at ${link}`;
  if (!b) return `Buy data at ${link}`;
  if (inp.kind === "two" || inp.kind === "three") return `${networkOf(b.product)} ${inp.bundles.map((r) => `${sizeOf(r.product)} ${money(r.price)}`).join(" · ")}. Buy at ${link}`;
  const line = `${networkOf(b.product)} ${sizeOf(b.product)} for ${money(b.price)}${b.product.validity ? ` · ${b.product.validity}` : ""}`;
  return inp.kind === "promo" && b.wasPrice ? `🔥 ${line} (was ${money(b.wasPrice)})${b.endsAt ? ` ${until(b.endsAt)}` : ""}. Buy at ${link}` : `${line}. Buy at ${link}`;
}
