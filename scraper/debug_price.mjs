import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();
await page.goto("https://www.ticketdata.com/events/22325499", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(5000);
const text = await page.evaluate(() => document.body.innerText);
console.log(text.slice(0, 2000));
await browser.close();
