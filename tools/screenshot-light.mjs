import { chromium } from "playwright";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem("cs-theme", "light"); } catch {} });
const page = await ctx.newPage();
await page.goto("http://127.0.0.1:3001/graficos?symbol=BTC", { waitUntil: "networkidle" });
await page.waitForTimeout(6000);
await page.screenshot({ path: process.argv[2], fullPage: false });
await browser.close();
