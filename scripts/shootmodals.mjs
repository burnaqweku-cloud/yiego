/**
 * Batch modal/sheet screenshots for theme QA: Buy Data flow, receipt,
 * appearance sheet, search palette — one Edge instance.
 * Usage: node scripts/shootmodals.mjs <outdir> [theme]
 */
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [outdir, theme = "dark"] = process.argv.slice(2);
if (!outdir) { console.error("usage: node scripts/shootmodals.mjs <outdir> [theme]"); process.exit(1); }
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Click the first visible button whose text or aria-label matches.
 *  Exact match wins; scoped to the top-most dialog if one is open. */
async function clickText(page, matcher) {
  const ok = await page.evaluate((m) => {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    const scope = dialogs.length ? dialogs[dialogs.length - 1] : document;
    const btns = [...scope.querySelectorAll("button, a")];
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    let el =
      btns.find((b) => norm(b.textContent) === m) ||
      btns.find((b) => norm(b.getAttribute("aria-label")) === m) ||
      btns.find((b) => norm(b.textContent).includes(m)) ||
      btns.find((b) => norm(b.getAttribute("aria-label") || "").includes(m));
    if (el) { el.click(); return true; }
    return false;
  }, matcher);
  if (!ok) throw new Error(`clickText: no match for "${matcher}"`);
}

try {
  if (!(await waitForCDP())) throw new Error("CDP never came up");
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument((t) => {
    try { localStorage.setItem("yiego_theme_v1", t); } catch {}
  }, theme);
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  const shot = (name) => page.screenshot({ path: join(outdir, `${name}.png`) });
  const esc = async () => { await page.keyboard.press("Escape"); await sleep(450); };

  // 1. Buy Data flow (from home quick actions)
  await page.goto("http://localhost:8188/", { waitUntil: "networkidle0", timeout: 30000 });
  await sleep(1200);
  await clickText(page, "Buy Data");
  await sleep(700);
  await shot("flow-buydata");
  await esc();

  // 2. Search palette
  await page.keyboard.press("/");
  await sleep(600);
  await shot("search");
  await esc();

  // 3. Receipt (first wallet transaction)
  await page.goto("http://localhost:8188/wallet", { waitUntil: "networkidle0", timeout: 30000 });
  await sleep(1200);
  await clickText(page, "view receipt");
  await sleep(700);
  await shot("receipt");
  await esc();

  // 4. Appearance sheet
  await page.goto("http://localhost:8188/account", { waitUntil: "networkidle0", timeout: 30000 });
  await sleep(1200);
  await clickText(page, "Appearance");
  await sleep(700);
  await shot("appearance");
  await esc();

  console.log("done:", outdir);
  browser.disconnect();
} finally {
  proc.kill();
}
