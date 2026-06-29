import { chromium } from "playwright";

const WORKER_URL = process.env.WORKER_URL;

if (!WORKER_URL) {
  console.error("WORKER_URL env var required");
  process.exit(1);
}

async function main() {
  console.log("Fetching watches from", WORKER_URL);
  const watchesRes = await fetch(`${WORKER_URL}/api/watches`);
  const { watches } = await watchesRes.json();

  if (!watches || watches.length === 0) {
    console.log("No watches configured — nothing to scrape");
    return;
  }

  console.log(`Found ${watches.length} watched event(s)`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });

  const results = [];

  for (const watch of watches) {
    const now = new Date();
    if (new Date(watch.date) < now) {
      console.log(`Skipping ${watch.slug} — event already passed`);
      continue;
    }

    // Scrape Ticketmaster event page
    const url = watch.url || (watch.ticketmasterEventId
      ? `https://www.ticketmaster.com/event/${watch.ticketmasterEventId}`
      : null);

    if (!url) {
      console.log(`No URL for ${watch.slug}, skipping`);
      continue;
    }

    const price = await scrapePage(context, url, watch.slug);
    if (price) results.push(price);
  }

  await browser.close();

  if (results.length > 0) {
    console.log(`\nPosting ${results.length} price(s) to worker...`);
    const res = await fetch(`${WORKER_URL}/api/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prices: results }),
    });
    const body = await res.json();
    console.log("Worker response:", JSON.stringify(body));
  } else {
    console.log("\nNo prices scraped this run");
  }
}

async function scrapePage(context, url, slug) {
  console.log(`\nScraping ${slug}: ${url}`);
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(5000);

    const priceData = await page.evaluate(() => {
      // Strategy 1: Look for specific Ticketmaster price elements
      const selectors = [
        '[data-testid="price-range"]',
        '[class*="PriceRange"]',
        '[class*="price-range"]',
        '[class*="EventPrice"]',
        '[class*="resale-price"]',
        '[class*="starting-at"]',
        '[data-testid="resale-price"]',
        '[class*="UpsellCard"]',
        '[class*="ticket-price"]',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.includes("$")) return el.textContent.trim();
      }

      // Strategy 2: Regex the full page text for price patterns
      const text = document.body.innerText;
      const patterns = [
        /(?:starting at|starts at|from|get[- ]in|lowest)[:\s]*\$(\d[\d,]*(?:\.\d{2})?)/i,
        /\$(\d[\d,]*(?:\.\d{2})?)\s*[-–]\s*\$(\d[\d,]*(?:\.\d{2})?)/,
      ];
      for (const pat of patterns) {
        const m = text.match(pat);
        if (m) return m[0];
      }

      // Strategy 3: Find elements that look like prices
      const els = document.querySelectorAll("span, div, p, button, a");
      for (const el of els) {
        const t = el.textContent?.trim() || "";
        if (/^\$\d{2,4}(\.\d{2})?\s*([-–]\s*\$\d{2,4}(\.\d{2})?)?$/.test(t)) {
          return t;
        }
      }

      return null;
    });

    let minPrice = null;
    let maxPrice = null;

    if (priceData) {
      const prices = [];
      const matches = priceData.matchAll(/\$(\d[\d,]*(?:\.\d{2})?)/g);
      for (const m of matches) {
        prices.push(parseFloat(m[1].replace(",", "")));
      }
      if (prices.length > 0) {
        minPrice = Math.min(...prices);
        maxPrice = Math.max(...prices);
      }
    }

    const pageUrl = page.url();

    if (minPrice !== null) {
      console.log(`  Found: $${minPrice}${maxPrice !== minPrice ? " – $" + maxPrice : ""}`);
    } else {
      console.log("  No price found");
      await page.screenshot({
        path: `scraper/debug-${slug}.png`,
        fullPage: false,
      });
      console.log("  Debug screenshot saved");
    }

    await page.close();

    return minPrice !== null
      ? {
          timestamp: Date.now(),
          source: "ticketmaster",
          matchSlug: slug,
          minPrice,
          maxPrice: maxPrice || minPrice,
          currency: "USD",
          url: pageUrl,
        }
      : null;
  } catch (err) {
    console.error(`  Error: ${err.message}`);
    await page.close();
    return null;
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
