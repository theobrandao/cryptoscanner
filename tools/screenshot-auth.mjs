// Captura páginas autenticadas: faz login via API e reutiliza o cookie.
import { chromium } from "playwright";
const [,, base, email, password, ...pairs] = process.argv;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
await page.goto(`${base}/login`, { waitUntil: "networkidle" });
await page.fill("#email", email);
await page.fill("#password", password);
await page.click("button[type=submit]");
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 20000 });
for (let i = 0; i < pairs.length; i += 2) {
  await page.goto(`${base}${pairs[i]}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: pairs[i + 1], fullPage: true });
}
console.log(errors.length ? errors.join("\n") : "no console errors");
await browser.close();
