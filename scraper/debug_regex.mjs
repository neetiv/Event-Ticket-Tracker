import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();
await page.goto("https://www.ticketdata.com/events/22325499", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(5000);

const result = await page.evaluate(() => {
  const text = document.body.innerText;
  // Show the characters around the price area
  const idx = text.indexOf("Current Get-In Price");
  const snippet = text.slice(idx, idx + 100);
  const chars = Array.from(snippet).map(c => `${c}(${c.charCodeAt(0)})`).join(' ');
  
  // Test regex
  const m = text.match(/Current Get-In Price[\s\S]{0,80}?\$([\d,]+)/i);
  
  // Also try alternate patterns
  const m2 = text.match(/\$(\d[\d,]*)/);
  const m3 = text.match(/Get-In Price[^$]*\$(\d+)/i);
  
  return { snippet, chars: chars.slice(0, 500), m: m?.[1], m2: m2?.[1], m3: m3?.[1] };
});
console.log("Snippet:", result.snippet);
console.log("Chars:", result.chars);
console.log("Regex 1 (original):", result.m);
console.log("Regex 2 (first $):", result.m2);
console.log("Regex 3 (alt):", result.m3);
await browser.close();
