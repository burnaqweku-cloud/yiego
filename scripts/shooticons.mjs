/**
 * Screenshots the icon-heavy surfaces: wallet card cashback chip,
 * redeem-cashback sheet, notifications list, wallet transaction rows,
 * and a provider-less plan list (generic plan icon).
 * Usage: node scripts/shooticons.mjs <outdir> [theme]
 */
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [outdir, theme = "light"] = process.argv.slice(2);
if (!outdir) { console.error("usage: node scripts/shooticons.mjs <outdir> [theme]"); process.exit(1); }
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

async function clickText(page, matcher) {
  const ok = await page.evaluate((m) => {
    const dialogs = [...document.querySelectorAll('[role="dialog"]')];
    const scope = dialogs.length ? dialogs[dialogs.length - 1] : document;
    const btns = [...scope.querySelectorAll("button, a")];
    const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
    const el =
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
  const shot = (n) => page.screenshot({ path: join(outdir, `${n}.png`) });
  const esc = async () => { await page.keyboard.press("Escape"); await sleep(450); };

  // Wallet card cashback chip + transaction list (per-type tx icons)
  await page.goto("http://localhost:8188/wallet", { waitUntil: "networkidle0", timeout: 30000 });
  await sleep(1300);
  await shot("wallet-top");

  // Redeem cashback sheet (hero icon)
  await clickText(page, "Redeem cashback");
  await sleep(700);
  await shot("redeem-cashback");
  await esc();

  // Notifications list (per-notice icons)
  await clickText(page, "Notifications");
  await sleep(700);
  await shot("notifications");
  await esc();

  // Provider-less plan list → shows the generic plan icon (VPN, Bulk SMS,
  // Results Checker, School Placement and E-Vouchers all render this).
  await page.goto("http://localhost:8188/services", { waitUntil: "networkidle0", timeout: 30000 });
  await sleep(1200);
  await clickText(page, "VPN Access");
  await sleep(800);
  await shot("plan-list");

  console.log("done:", outdir);
  browser.disconnect();
} finally {
  proc.kill();
}
