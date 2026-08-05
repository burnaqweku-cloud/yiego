/**
 * Turns the supplied brand PNG into the assets the site actually needs:
 *
 *   yiego-lockup.png       mark + wordmark, white knocked out  (light theme)
 *   yiego-lockup-dark.png  same, dark ink lifted to near-white (dark theme)
 *   yiego-full.png         the whole lockup including the tagline
 *   yiego-full-dark.png    ditto for the dark theme
 *
 * Pixel work runs in a headless Edge canvas — fast, and no image library to
 * install. The tagline band is found by looking for the blank rows between it
 * and the wordmark, so nothing is hard-coded to this particular export.
 *
 * Usage: node scripts/makelogo.mjs <source.png> <outDir>
 */
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [source, outDir = "src/assets"] = process.argv.slice(2);
if (!source || !existsSync(source)) {
  console.error("usage: node scripts/makelogo.mjs <source.png> [outDir]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const EDGE = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));
const PORT = 9300 + (process.pid % 500);
const profileDir = mkdtempSync(join(tmpdir(), "yiego-logo-"));
const proc = spawn(EDGE, ["--headless", "--disable-gpu", "--no-first-run",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, "about:blank"], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitCDP(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return true; } catch {}
    await sleep(200);
  }
  return false;
}

const dataUrl = `data:image/png;base64,${readFileSync(source).toString("base64")}`;

try {
  if (!(await waitCDP())) throw new Error("no devtools endpoint");
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
  const page = await browser.newPage();

  const out = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const src32 = ctx.getImageData(0, 0, w, h);
    const px = src32.data;

    const NEAR_WHITE = 238;          // anything this bright is background
    // Already-transparent pixels carry RGB 0,0,0 — without the alpha test
    // every row of a transparent PNG reads as solid black ink.
    const isInk = (i) =>
      px[i + 3] > 16 && !(px[i] >= NEAR_WHITE && px[i + 1] >= NEAR_WHITE && px[i + 2] >= NEAR_WHITE);

    // ── Find horizontal bands of content ─────────────────────────
    const rowHasInk = [];
    for (let y = 0; y < h; y++) {
      let found = false;
      for (let x = 0; x < w; x++) {
        if (isInk((y * w + x) * 4)) { found = true; break; }
      }
      rowHasInk.push(found);
    }
    const bands = [];
    let start = -1;
    for (let y = 0; y < h; y++) {
      if (rowHasInk[y] && start === -1) start = y;
      if ((!rowHasInk[y] || y === h - 1) && start !== -1) {
        bands.push([start, rowHasInk[y] ? y : y - 1]);
        start = -1;
      }
    }
    // The mark on the left runs the full height of the artwork, so no row is
    // ever blank and the tagline cannot be found by scanning rows alone.
    // Find the gutter between the mark and the type first, then look for the
    // blank row inside the type column only.
    const colHasInk = [];
    for (let x = 0; x < w; x++) {
      let found = false;
      for (let y = 0; y < h; y++) {
        if (isInk((y * w + x) * 4)) { found = true; break; }
      }
      colHasInk.push(found);
    }
    let gutterStart = -1, gutterEnd = -1, bestGutter = 0;
    let run = -1;
    for (let x = 0; x < w; x++) {
      if (!colHasInk[x] && run === -1) run = x;
      if ((colHasInk[x] || x === w - 1) && run !== -1) {
        const end = colHasInk[x] ? x - 1 : x;
        if (end - run + 1 > bestGutter && run > 0 && end < w - 1) {
          bestGutter = end - run + 1;
          gutterStart = run;
          gutterEnd = end;
        }
        run = -1;
      }
    }
    const typeLeft = gutterEnd >= 0 ? gutterEnd + 1 : 0;

    // Row bands within the type column: [wordmark, tagline].
    const typeBands = [];
    let tStart = -1;
    for (let y = 0; y < h; y++) {
      let found = false;
      for (let x = typeLeft; x < w; x++) {
        if (isInk((y * w + x) * 4)) { found = true; break; }
      }
      if (found && tStart === -1) tStart = y;
      if ((!found || y === h - 1) && tStart !== -1) {
        typeBands.push([tStart, found ? y : y - 1]);
        tStart = -1;
      }
    }
    const mergedType = [];
    for (const band of typeBands) {
      const last = mergedType[mergedType.length - 1];
      if (last && band[0] - last[1] <= Math.round(h * 0.03)) last[1] = band[1];
      else mergedType.push([...band]);
    }
    // Anything below the wordmark band, in the type column, is the tagline.
    const taglineTop = mergedType.length > 1 ? mergedType[1][0] : -1;
    const merged = bands;

    // ── Column bounds for a given row range ──────────────────────
    const colBounds = (y0, y1) => {
      let left = w, right = -1;
      for (let y = y0; y <= y1; y++) {
        for (let x = 0; x < w; x++) {
          if (isInk((y * w + x) * 4)) {
            if (x < left) left = x;
            if (x > right) right = x;
          }
        }
      }
      return [left, right];
    };

    /**
     * Crop a region, knock the white background out to transparent, and
     * optionally lift the dark ink so it survives on a dark background.
     * Antialiased edge pixels are turned into partial alpha rather than a
     * hard cut, so the curves stay smooth.
     */
    const render = (y0, y1, lift, dropTagline) => {
      // Erase the tagline before measuring, so the crop tightens around what
      // is left rather than around a hole.
      const erased = new Set();
      if (dropTagline && taglineTop > 0) {
        for (let y = taglineTop; y <= y1; y++) {
          for (let x = typeLeft; x < w; x++) erased.add(y * w + x);
        }
      }
      const inkAt = (i) => isInk(i * 4) && !erased.has(i);

      let left = w, right = -1, top = -1, bottom = -1;
      for (let y = y0; y <= y1; y++) {
        for (let x = 0; x < w; x++) {
          if (!inkAt(y * w + x)) continue;
          if (x < left) left = x;
          if (x > right) right = x;
          if (top === -1) top = y;
          bottom = y;
        }
      }
      const [bx0, bx1] = [left, right];
      y0 = top === -1 ? y0 : top;
      y1 = bottom === -1 ? y1 : bottom;
      const [x0, x1] = [bx0, bx1];
      const cw = x1 - x0 + 1;
      const ch = y1 - y0 + 1;
      const cut = document.createElement("canvas");
      cut.width = cw;
      cut.height = ch;
      const cctx = cut.getContext("2d", { willReadFrequently: true });
      const region = cctx.createImageData(cw, ch);

      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const s = ((y + y0) * w + (x + x0)) * 4;
          const d = (y * cw + x) * 4;
          let r = px[s], g = px[s + 1], b = px[s + 2];

          // Distance from white drives alpha: pure white disappears, ink stays.
          // Existing transparency is respected — it can only take alpha down.
          // Alpha comes from the DARKEST channel, not the brightest: a
          // saturated amber is (245,166,35), so judging it by its red channel
          // would treat it as almost-white and erase it.
          const darkest = Math.min(r, g, b);
          const fromWhite = Math.min(255, Math.round((255 - darkest) * (255 / (255 - 200))));
          const alpha = erased.has((y + y0) * w + (x + x0)) ? 0 : Math.min(px[s + 3], fromWhite);

          if (lift) {
            // Neutral dark ink → light ink. Coloured pixels (the greens and
            // the amber) keep their hue; only the near-neutral ones flip.
            const max = Math.max(r, g, b), min = Math.min(r, g, b);
            const neutral = max - min < 34;
            if (neutral && max < 150) {
              r = 242; g = 251; b = 246;
            }
          }

          region.data[d] = r;
          region.data[d + 1] = g;
          region.data[d + 2] = b;
          region.data[d + 3] = alpha;
        }
      }
      cctx.putImageData(region, 0, 0);
      return { url: cut.toDataURL("image/png"), width: cw, height: ch };
    };

    const [fullTop] = merged[0] ?? [0];
    const fullBottom = merged[merged.length - 1]?.[1] ?? h - 1;

    return {
      rawBands: bands,
      bands: merged,
      typeBands: mergedType,
      gutter: [gutterStart, gutterEnd],
      lockup: render(fullTop, fullBottom, false, true),
      lockupDark: render(fullTop, fullBottom, true, true),
      full: render(fullTop, fullBottom, false, false),
      fullDark: render(fullTop, fullBottom, true, false),
    };
  }, dataUrl);

  console.log("raw bands:", JSON.stringify(out.rawBands));
  console.log("type bands:", JSON.stringify(out.typeBands), " gutter:", JSON.stringify(out.gutter));
  const write = (name, asset) => {
    writeFileSync(join(outDir, name), Buffer.from(asset.url.split(",")[1], "base64"));
    console.log(`${name}  ${asset.width}x${asset.height}`);
  };
  write("yiego-lockup.png", out.lockup);
  write("yiego-lockup-dark.png", out.lockupDark);
  write("yiego-full.png", out.full);
  write("yiego-full-dark.png", out.fullDark);

  browser.disconnect();
} finally {
  proc.kill();
}
