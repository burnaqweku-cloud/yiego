/**
 * Dev-only interactive verification: drives the Buy Data + Add Money flows
 * by clicking through each step and screenshotting, so we can confirm the
 * flow actually works end-to-end (and the wallet updates).
 *
 * Usage: node scripts/drive.mjs <outDir>
 */
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const outDir = process.argv[2] || ".";
mkdirSync(outDir, { recursive: true });

const EDGE = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
].find((p) => existsSync(p));
if (!EDGE) throw new Error("Edge not found");

const PORT = 9300 + (process.pid % 500);
const profileDir = mkdtempSync(join(tmpdir(), "yiego-drive-"));
const proc = spawn(
  EDGE,
  [
    "--headless",
    "--disable-gpu",
    "--no-first-run",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitCDP(tries = 50) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return true;
    } catch {}
    await sleep(200);
  }
  return false;
}

async function clickText(page, selector, text) {
  const ok = await page.evaluate(
    (sel, t) => {
      const els = [...document.querySelectorAll(sel)];
      const el = els.find((e) => (e.textContent || "").replace(/\s+/g, " ").includes(t));
      if (el) {
        el.click();
        return true;
      }
      return false;
    },
    selector,
    text,
  );
  if (!ok) throw new Error(`could not find "${text}" in ${selector}`);
  return ok;
}

async function readText(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    return el ? el.textContent.trim() : null;
  }, selector);
}

try {
  if (!(await waitCDP())) throw new Error("no devtools endpoint");
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });

  await page.goto("http://localhost:8188/", { waitUntil: "networkidle0", timeout: 30000 });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle0" });
  await sleep(1500);

  const balanceBefore = await readText(page, ".onyx-balance");
  console.log("balance before:", balanceBefore);
  await page.screenshot({ path: join(outDir, "d0-home.png") });

  // ── Buy Data ──
  await clickText(page, "button", "Buy Data");
  await sleep(500);
  await page.screenshot({ path: join(outDir, "d1-network.png") });

  await clickText(page, ".onyx-select", "MTN");
  await sleep(500);
  await page.screenshot({ path: join(outDir, "d2-bundle.png") });

  await clickText(page, ".onyx-select", "2GB");
  await sleep(500);
  await page.screenshot({ path: join(outDir, "d3-phone.png") });

  await clickText(page, "button", "Continue");
  await sleep(500);
  await page.screenshot({ path: join(outDir, "d4-review.png") });

  await clickText(page, "button", "Pay ");
  await sleep(600);
  await page.screenshot({ path: join(outDir, "d5-processing.png") });
  await sleep(1800);
  await page.screenshot({ path: join(outDir, "d6-success.png") });

  await clickText(page, "button", "Done");
  await sleep(800);
  const balanceAfter = await readText(page, ".onyx-balance");
  console.log("balance after buy:", balanceAfter);
  await page.screenshot({ path: join(outDir, "d7-home-after.png") });

  // ── Add Money ──
  await clickText(page, "button", "Add Money");
  await sleep(500);
  await page.screenshot({ path: join(outDir, "d8-amount.png") });

  await clickText(page, "button", "GH₵100");
  await sleep(200);
  await clickText(page, "button", "Continue");
  await sleep(500);
  await page.screenshot({ path: join(outDir, "d9-method.png") });

  await clickText(page, "button", "Add GH");
  await sleep(600);
  await sleep(1700);
  await page.screenshot({ path: join(outDir, "d10-added.png") });

  await clickText(page, "button", "Done");
  await sleep(800);
  const balanceFinal = await readText(page, ".onyx-balance");
  console.log("balance final:", balanceFinal);
  await page.screenshot({ path: join(outDir, "d11-home-final.png") });

  browser.disconnect();
  console.log("DRIVE OK");
} finally {
  proc.kill();
}
