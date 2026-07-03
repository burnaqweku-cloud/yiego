/**
 * Dev-only visual QA tool: screenshots the running dev server at exact
 * viewport sizes using the system Edge browser.
 *
 * Launches Edge headless with remote debugging, connects puppeteer-core
 * over CDP (Edge's own launcher rejects puppeteer's spawn flags on this
 * machine), screenshots, then kills the browser.
 *
 * Usage: node scripts/screenshot.mjs <url> <outfile> <width> <height> [fullPage]
 */
import puppeteer from "puppeteer-core";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, out, w, h, fullPage] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: node scripts/screenshot.mjs <url> <outfile> <width> <height> [fullPage]");
  process.exit(1);
}

const EDGE_PATHS = [
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
];
const executablePath = EDGE_PATHS.find((p) => existsSync(p));
if (!executablePath) {
  console.error("Edge not found");
  process.exit(1);
}

// Derive a per-process debugging port so parallel runs don't collide.
const PORT = Number(process.env.YIEGO_SHOT_PORT) || 9300 + (process.pid % 500);
const profileDir = mkdtempSync(join(tmpdir(), "yiego-shot-"));

const proc = spawn(
  executablePath,
  [
    "--headless",
    "--disable-gpu",
    "--no-first-run",
    "--hide-scrollbars",
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profileDir}`,
    "about:blank",
  ],
  { stdio: "ignore", detached: false },
);

// Wait for the DevTools endpoint to come up
async function waitForCDP(retries = 50) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

try {
  if (!(await waitForCDP())) throw new Error("Edge DevTools endpoint never came up");

  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${PORT}`,
    defaultViewport: null,
  });

  const page = await browser.newPage();
  await page.setViewport({
    width: Number(w) || 390,
    height: Number(h) || 844,
    deviceScaleFactor: 2, // crisp retina-quality captures
  });
  await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
  // Let fonts/entrance animations settle
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: out, fullPage: fullPage === "fullPage" });
  console.log("saved:", out);
  browser.disconnect();
} finally {
  proc.kill();
}
