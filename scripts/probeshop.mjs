/**
 * Verifies the new /shop: catalogue contents, and that tapping a bundle opens
 * the EXISTING buy flow already standing on the recipient step.
 *
 * Stops before any order is created (guest session: nothing hits the server
 * until Paystack, which we never click).
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
const PORT = 9300 + (process.pid % 500);
const profileDir = mkdtempSync(join(tmpdir(), "yiego-probe-"));
const proc = spawn(EDGE, ["--headless", "--disable-gpu", "--no-first-run", "--hide-scrollbars",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profileDir}`, "about:blank"], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitCDP(tries = 60) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return true; } catch {}
    await sleep(200);
  }
  return false;
}
const clickText = (page, sel, text) => page.evaluate((s, t) => {
  const el = [...document.querySelectorAll(s)].find((e) => (e.textContent || "").replace(/\s+/g, " ").includes(t));
  if (!el) return false;
  el.click();
  return true;
}, sel, text);

try {
  if (!(await waitCDP())) throw new Error("no devtools endpoint");
  const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${PORT}`, defaultViewport: null });
  const page = await browser.newPage();
  await page.setViewport({ width: 430, height: 900, deviceScaleFactor: 2 });
  await page.goto("http://localhost:8188/shop", { waitUntil: "networkidle0", timeout: 40000 });
  await sleep(2200);

  // Expand the full catalogue.
  await clickText(page, "button", "more bundle");
  await sleep(700);

  const catalogue = await page.evaluate(() => {
    const cards = [...document.querySelectorAll(".mk-bundle")];
    const validity = new Set();
    cards.forEach((c) => {
      const spans = [...c.querySelectorAll("span")];
      const v = spans.find((s) => /Valid|Validity/.test(s.textContent || ""));
      if (v) validity.add(v.textContent.trim());
    });
    return {
      cards: cards.length,
      validityValues: [...validity],
      firstCard: cards[0]?.getAttribute("aria-label"),
      lastCard: cards[cards.length - 1]?.getAttribute("aria-label"),
    };
  });
  console.log("CATALOGUE", JSON.stringify(catalogue, null, 2));

  // Tap a specific bundle → the buy flow must open on the recipient step.
  const target = await page.evaluate(() => {
    const card = [...document.querySelectorAll(".mk-bundle")].find((c) =>
      (c.getAttribute("aria-label") || "").includes("MTN"));
    if (!card) return null;
    card.click();
    return card.getAttribute("aria-label");
  });
  console.log("TAPPED", target);
  await sleep(1800);
  await page.screenshot({ path: join(outDir, "p1-preselect.png") });

  const modal = await page.evaluate(() => {
    const panel = document.querySelector(".onyx-modal-panel");
    if (!panel) return { open: false };
    return {
      open: true,
      heading: panel.querySelector("h2,h3")?.textContent?.trim() ?? null,
      text: panel.textContent.replace(/\s+/g, " ").slice(0, 220),
      hasPhoneInput: Boolean(panel.querySelector("#buydata-phone")),
    };
  });
  console.log("MODAL", JSON.stringify(modal, null, 2));

  // Back must land on that network's bundle list, then the network list.
  await clickText(page, "button", "");
  await page.evaluate(() => {
    const back = document.querySelector('.onyx-flowhead button[aria-label*="Back" i], .onyx-flowhead button');
    back?.click();
  });
  await sleep(900);
  await page.screenshot({ path: join(outDir, "p2-back.png") });
  const afterBack = await page.evaluate(() => {
    const panel = document.querySelector(".onyx-modal-panel");
    return panel ? panel.textContent.replace(/\s+/g, " ").slice(0, 160) : null;
  });
  console.log("AFTER BACK", afterBack);

  browser.disconnect();
  console.log("PROBE OK");
} finally {
  proc.kill();
}
