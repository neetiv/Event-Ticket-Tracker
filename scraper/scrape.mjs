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
    if (new Date(watch.date) < new Date()) {
      console.log(`Skipping ${watch.slug} — already passed`);
      continue;
    }

    const searchName = watch.name.replace(/[-–:]/g, " ").replace(/\s+/g, " ").trim();
    const searchUrl = `https://www.ticketdata.com/search?q=${encodeURIComponent(searchName)}`;
    console.log(`\nSearching TicketData: ${searchName}`);

    const page = await context.newPage();
    try {
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(4000);

      // Find the first event link
      const eventLink = await page.evaluate(() => {
        const links = document.querySelectorAll('a[href*="/event/"]');
        return links.length > 0 ? links[0].href : null;
      });

      if (!eventLink) {
        console.log("  No event found in search results");
        await page.screenshot({ path: `scraper/debug-${watch.slug}-search.png` });
        await page.close();
        continue;
      }

      console.log(`  Event page: ${eventLink}`);
      await page.goto(eventLink, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(5000);

      // Extract per-platform prices
      const platformPrices = await page.evaluate(() => {
        const prices = {};
        const text = document.body.innerText;
        const platforms = ["StubHub", "SeatGeek", "Vivid Seats", "Gametime", "TickPick", "MegaSeats"];

        // Strategy 1: Look for platform names near dollar amounts
        for (const platform of platforms) {
          const patterns = [
            new RegExp(platform + "[\\s\\S]{0,50}?\\$(\\d[\\d,]*(?:\\.\\d{2})?)", "i"),
            new RegExp("\\$(\\d[\\d,]*(?:\\.\\d{2})?)\\s*(?:on|at|via)?\\s*" + platform, "i"),
          ];
          for (const pat of patterns) {
            const m = text.match(pat);
            if (m) {
              prices[platform.toLowerCase().replace(/\s+/g, "-")] = parseFloat(m[1].replace(",", ""));
              break;
            }
          }
        }

        // Strategy 2: Look for table rows or structured price listings
        const rows = document.querySelectorAll("tr, [class*='row'], [class*='listing'], [class*='price']");
        for (const row of rows) {
          const rowText = row.textContent || "";
          for (const platform of platforms) {
            if (rowText.toLowerCase().includes(platform.toLowerCase())) {
              const priceMatch = rowText.match(/\$(\d[\d,]*(?:\.\d{2})?)/);
              if (priceMatch && !prices[platform.toLowerCase().replace(/\s+/g, "-")]) {
                prices[platform.toLowerCase().replace(/\s+/g, "-")] = parseFloat(priceMatch[1].replace(",", ""));
              }
            }
          }
        }

        // Strategy 3: Get any "get-in" or "from" price as fallback
        let getInPrice = null;
        const getInMatch = text.match(/(?:get[- ]?in|from|starting at|lowest)[:\s]*\$(\d[\d,]*(?:\.\d{2})?)/i);
        if (getInMatch) getInPrice = parseFloat(getInMatch[1].replace(",", ""));

        // Also grab all dollar amounts on page as context
        const allPrices = [];
        const allMatches = text.matchAll(/\$(\d{2,4}(?:\.\d{2})?)/g);
        for (const m of allMatches) {
          const p = parseFloat(m[1]);
          if (p >= 10 && p <= 10000) allPrices.push(p);
        }

        return { platforms: prices, getInPrice, allPrices: [...new Set(allPrices)].sort((a, b) => a - b).slice(0, 10) };
      });

      console.log("  Platform prices:", JSON.stringify(platformPrices.platforms));
      console.log("  Get-in price:", platformPrices.getInPrice);
      console.log("  All prices on page:", platformPrices.allPrices);

      // Post per-platform prices as separate snapshots
      const platformEntries = Object.entries(platformPrices.platforms);
      if (platformEntries.length > 0) {
        for (const [platform, price] of platformEntries) {
          console.log(`  ${platform}: $${price}`);
          results.push({
            timestamp: Date.now(),
            source: platform,
            matchSlug: watch.slug,
            minPrice: price,
            maxPrice: price,
            currency: "USD",
            url: eventLink,
          });
        }
      } else if (platformPrices.getInPrice) {
        console.log(`  Get-in (no platform breakdown): $${platformPrices.getInPrice}`);
        results.push({
          timestamp: Date.now(),
          source: "ticketdata",
          matchSlug: watch.slug,
          minPrice: platformPrices.getInPrice,
          maxPrice: platformPrices.getInPrice,
          currency: "USD",
          url: eventLink,
        });
      } else if (platformPrices.allPrices.length > 0) {
        const lowest = platformPrices.allPrices[0];
        console.log(`  Fallback lowest price on page: $${lowest}`);
        results.push({
          timestamp: Date.now(),
          source: "ticketdata",
          matchSlug: watch.slug,
          minPrice: lowest,
          maxPrice: platformPrices.allPrices[platformPrices.allPrices.length - 1],
          currency: "USD",
          url: eventLink,
        });
      } else {
        console.log("  No prices found at all");
        await page.screenshot({ path: `scraper/debug-${watch.slug}-event.png` });
      }
    } catch (err) {
      console.error(`  Error: ${err.message}`);
      await page.screenshot({ path: `scraper/debug-${watch.slug}-error.png` }).catch(() => {});
    }
    await page.close();
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
    console.log("\nNo prices scraped");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
