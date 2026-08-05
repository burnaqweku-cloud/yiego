/**
 * Full-page screenshot that first scrolls the whole page so
 * IntersectionObserver reveals fire and lazy sections mount.
 *
 * Usage: node scripts/shootpage.mjs <path> <outfile> <width> <height> [theme]
 *   e.g. node scripts/shootpage.mjs / out.png 390 900 light
 */
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [path = "/", out, w = "390", h = "900", theme = "light", mode = "full"] = process.argv.slice(2);
const viewportOnly = mode === "viewport";
if (!out) {
  console.error("usage: node scripts/shootpage.mjs <path> <outfile> <width> <height> [theme]");
  process.exit(1);
}

const EDGE_PATHS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const executablePath = EDGE_PATHS.find((p) => existsSync(p));
const PORT = Number(process.env.YIEGO_SHOT_PORT) || 9300 + (process.pid % 500);
const profileDir = mkdtempSync(join(tmpdir(), "yiego-shot-"));

const proc = spawn(executablePath, [
  "--headless", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, "about:blank",
], { stdio: "ignore" });

async function waitForCDP(retries = 60) {
  for (let i = 0; i < retries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  if (!(await waitForCDP())) throw new Error("CDP never came up");
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((t) => {
    try { localStorage.setItem("yiego_theme_v1", t); } catch {}
  }, theme);
  await page.setViewport({ width: Number(w), height: Number(h), deviceScaleFactor: 2 });
  await page.goto(`http://localhost:8188${path}`, { waitUntil: "networkidle0", timeout: 40000 });
  await sleep(900);

  // Walk the page so reveals trigger and lazy sections mount.
  await page.evaluate(async () => {
    // The site sets `scroll-behavior: smooth`, so every step here would
    // ANIMATE — the loop then outruns the real scroll position and the last
    // sections never enter the viewport. Walk instantly, restore afterwards.
    const root = document.documentElement;
    const previousBehavior = root.style.scrollBehavior;
    root.style.scrollBehavior = "auto";
    const step = Math.round(window.innerHeight * 0.6);
    let y = 0;
    // Re-read scrollHeight every step: lazy sections mount as we descend
    // and keep extending the page.
    for (let guard = 0; guard < 400; guard++) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 150));
      const bottom = document.documentElement.scrollHeight - window.innerHeight;
      if (y >= bottom) break;
      y = Math.min(y + step, bottom);
    }
    await new Promise((r) => setTimeout(r, 700));
    window.scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 400));
    root.style.scrollBehavior = previousBehavior;
  });
  await sleep(900);

  // Report anything still invisible — that would be a real bug, not a capture artifact.
  const hiddenList = await page.evaluate(() =>
    [...document.querySelectorAll("[data-reveal]")]
      // `display:none` elements (responsive duplicates) never intersect and
      // never reveal — that is correct, not a bug. Only judge rendered ones.
      .filter((el) => el.getClientRects().length > 0)
      .filter((el) => Number(getComputedStyle(el).opacity) < 0.9)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className.toString().split(" ").slice(0, 2).join(".")} — ${(el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 48)}`),
  );
  const hidden = hiddenList.length;
  const overflow = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  await page.screenshot({ path: out, fullPage: !viewportOnly });
  console.log(`saved: ${out}`);
  console.log(`still-hidden reveal elements: ${hidden}`);
  hiddenList.slice(0, 12).forEach((d) => console.log(`   · ${d}`));
  console.log(`overflow: scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth}${overflow.scrollWidth > overflow.clientWidth ? "  <-- HORIZONTAL OVERFLOW" : "  (ok)"}`);
  browser.disconnect();
} finally {
  proc.kill();
}
