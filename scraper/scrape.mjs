import { chromium } from "playwright";

const WORKER_URL = process.env.WORKER_URL;
const WORKER_SECRET = process.env.WORKER_SECRET;

if (!WORKER_URL) {
  console.error("WORKER_URL env var required");
  process.exit(1);
}

async function main() {
  const watchesRes = await fetch(`${WORKER_URL}/api/watches`);
  const { watches } = await watchesRes.json();

  if (!watches || watches.length === 0) {
    console.log("No watches configured — nothing to scrape");
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });

  const results = [];

  for (const watch of watches) {
    const now = new Date();
    if (new Date(watch.date) < now) continue;

    // Scrape Ticketmaster
    if (watch.ticketmasterEventId) {
      const url = `https://www.ticketmaster.com/event/${watch.ticketmasterEventId}`;
      const price = await scrapePage(context, url, watch.slug, "ticketmaster");
      if (price) results.push(price);
    }

    // Scrape SeatGeek — build URL from event data
    const sgLink = watch.links?.find((l) => l.label === "SeatGeek");
    const sgUrl =
      sgLink?.url ||
      (watch.seatgeekEventSlug
        ? `https://seatgeek.com/${watch.seatgeekEventSlug}`
        : null);
    if (sgUrl) {
      const price = await scrapePage(context, sgUrl, watch.slug, "seatgeek");
      if (price) results.push(price);
    }

    // Also try SeatGeek search if no direct URL
    if (!sgUrl && watch.name) {
      const searchUrl = `https://seatgeek.com/search?search=${encodeURIComponent(watch.name)}`;
      console.log(`No SeatGeek URL for ${watch.slug}, trying search: ${searchUrl}`);
    }
  }

  await browser.close();

  // Post results to worker
  if (results.length > 0) {
    console.log(`\nPosting ${results.length} price(s) to worker...`);
    const res = await fetch(`${WORKER_URL}/api/ingest`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(WORKER_SECRET ? { Authorization: `Bearer ${WORKER_SECRET}` } : {}),
      },
      body: JSON.stringify({ prices: results }),
    });
    const body = await res.json();
    console.log("Worker response:", JSON.stringify(body));
  } else {
    console.log("\nNo prices scraped this run");
  }
}

async function scrapePage(context, url, matchSlug, source) {
  console.log(`\nScraping ${source} for ${matchSlug}: ${url}`);
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    // Wait for price elements to render
    await page.waitForTimeout(5000);

    let minPrice = null;
    let maxPrice = null;
    let pageUrl = url;

    if (source === "ticketmaster") {
      // Ticketmaster shows prices in various elements
      // Look for "Starting at" or price displays
      const priceText = await page.evaluate(() => {
        const selectors = [
          '[data-testid="price-range"]',
          '[class*="PriceRange"]',
          '[class*="price-range"]',
          '[class*="starting-at"]',
          '[class*="EventPrice"]',
          ".resale-price",
          '[data-testid="resale-price"]',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el?.textContent) return el.textContent.trim();
        }
        // Fallback: find any element with a dollar amount
        const allText = document.body.innerText;
        const priceMatch = allText.match(
          /(?:starting at|from|get[- ]in[- ]price|lowest price)[:\s]*\$(\d[\d,]*)/i
        );
        if (priceMatch) return "$" + priceMatch[1];
        // Last resort: find price-looking elements
        const elements = document.querySelectorAll("span, div, p");
        for (const el of elements) {
          const text = el.textContent.trim();
          if (/^\$\d{2,4}(\.\d{2})?$/.test(text)) return text;
        }
        return null;
      });
      if (priceText) {
        const prices = extractPrices(priceText);
        minPrice = prices.min;
        maxPrice = prices.max;
      }
      pageUrl = page.url();
    }

    if (source === "seatgeek") {
      const priceText = await page.evaluate(() => {
        const selectors = [
          '[class*="ListingPrice"]',
          '[class*="listing-price"]',
          '[data-testid*="price"]',
          '[class*="EventPrice"]',
          '[class*="get-in-price"]',
          '[class*="priceButton"]',
        ];
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el?.textContent) return el.textContent.trim();
        }
        const allText = document.body.innerText;
        const priceMatch = allText.match(
          /(?:from|starting at|get[- ]in)[:\s]*\$(\d[\d,]*)/i
        );
        if (priceMatch) return "$" + priceMatch[1];
        // Look for price-like elements
        const elements = document.querySelectorAll("span, div, button, a");
        for (const el of elements) {
          const text = el.textContent.trim();
          if (/^\$\d{2,4}(\s*[-–]\s*\$\d{2,4})?$/.test(text)) return text;
        }
        return null;
      });
      if (priceText) {
        const prices = extractPrices(priceText);
        minPrice = prices.min;
        maxPrice = prices.max;
      }
      pageUrl = page.url();
    }

    if (minPrice !== null) {
      console.log(`  Found: $${minPrice}${maxPrice ? " – $" + maxPrice : ""}`);
    } else {
      console.log("  No price found on page");
      // Take a screenshot for debugging
      await page.screenshot({
        path: `scraper/debug-${source}-${matchSlug}.png`,
        fullPage: false,
      });
      console.log(`  Debug screenshot saved`);
    }

    await page.close();
    return minPrice !== null
      ? {
          timestamp: Date.now(),
          source,
          matchSlug,
          minPrice,
          maxPrice: maxPrice || minPrice,
          currency: "USD",
          url: pageUrl,
        }
      : null;
  } catch (err) {
    console.error(`  Error scraping ${source}: ${err.message}`);
    await page.close();
    return null;
  }
}

function extractPrices(text) {
  const prices = [];
  const matches = text.matchAll(/\$(\d[\d,]*(?:\.\d{2})?)/g);
  for (const m of matches) {
    prices.push(parseFloat(m[1].replace(",", "")));
  }
  if (prices.length === 0) return { min: null, max: null };
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
