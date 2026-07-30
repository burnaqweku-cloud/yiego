/**
 * Batch screenshots: all 5 routes x 2 widths, one Edge instance.
 * Usage: node shootall.mjs <outdir> [theme]   theme = dark|light (sets localStorage pre-load)
 */
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [outdir, theme = "dark"] = process.argv.slice(2);
if (!outdir) { console.error("usage: node shootall.mjs <outdir> [theme]"); process.exit(1); }
mkdirSync(outdir, { recursive: true });

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

async function waitForCDP(retries = 50) {
  for (let i = 0; i < retries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return true; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

const ROUTES = [
  ["home", "/"],
  ["services", "/services"],
  ["payments", "/payments"],
  ["wallet", "/wallet"],
  ["account", "/account"],
];
const SIZES = [["m", 390, 844], ["d", 1440, 900]];

try {
  if (!(await waitForCDP())) throw new Error("CDP never came up");
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((t) => {
    try { localStorage.setItem("yiego_theme_v1", t); } catch {}
  }, theme);

  for (const [sz, w, h] of SIZES) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2 });
    for (const [name, path] of ROUTES) {
      await page.goto(`http://localhost:8188${path}`, { waitUntil: "networkidle0", timeout: 30000 });
      await new Promise((r) => setTimeout(r, 1300));
      const out = join(outdir, `${name}-${sz}.png`);
      await page.screenshot({ path: out, fullPage: true });
      console.log("saved:", out);
    }
  }
  browser.disconnect();
} finally {
  proc.kill();
}
