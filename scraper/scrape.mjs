import { chromium } from "playwright";

const WORKER_URL = process.env.WORKER_URL;
if (!WORKER_URL) {
  console.error("WORKER_URL env var required");
  process.exit(1);
}

// "Ariana Grande - The Eternal Sunshine Tour" → "ariana-grande"
function toPerformerSlug(name) {
  const base = name.split(/\s*[-–:]\s*/)[0].trim();
  return base.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "-");
}

async function scrapeFromPerformerPage(page, watch) {
  const slugVariants = [
    toPerformerSlug(watch.name),
    watch.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "-").slice(0, 60),
  ];

  for (const slug of [...new Set(slugVariants)]) {
    const url = `https://www.ticketdata.com/performer/${slug}`;
    console.log(`  Trying: ${url}`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
      await page.waitForTimeout(4000);

      // Extract all event rows with href, date text, and price
      const rows = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href*="/events/"]'))
          .map((a) => {
            const row = a.closest("tr") || a.closest("[class*='row']") || a.parentElement;
            const text = row ? row.innerText : a.innerText;
            const priceMatch = text.match(/\$([\d,]+)/);
            return {
              href: a.href,
              text: text.trim(),
              price: priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : null,
            };
          })
          .filter((r) => /\/events\/\d+/.test(r.href) && r.price !== null);
      });

      if (rows.length === 0) {
        console.log("  No priced events on performer page");
        continue;
      }

      console.log(`  Found ${rows.length} priced event rows`);

      // Match by date and/or venue
      const watchDate = new Date(watch.date);
      const mm = watchDate.getMonth() + 1;
      // Try both UTC day and local day since stored dates can be either
      const ddUTC = watchDate.getUTCDate();
      const ddLocal = watchDate.getDate();
      const yyyy = watchDate.getFullYear();
      const venuePart = watch.venue.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10);
      const cityPart = watch.city.split(",")[0].toLowerCase().replace(/[^a-z]/g, "");

      let best = null;
      let bestScore = 0;
      for (const row of rows) {
        const t = row.text.toLowerCase();
        const tClean = t.replace(/[^a-z0-9/\s]/g, "");
        let score = 0;
        if (tClean.includes(`${mm}/${ddUTC}`) || tClean.includes(`${mm}/${ddLocal}`)) score += 3;
        if (t.includes(String(yyyy))) score += 1;
        if (venuePart && tClean.replace(/\s/g, "").includes(venuePart)) score += 3;
        if (cityPart && tClean.includes(cityPart)) score += 2;
        if (score > bestScore) { bestScore = score; best = row; }
      }

      const chosen = best || rows[0];
      console.log(`  Best match (score ${bestScore}): ${chosen.href}`);
      console.log(`  Row text: ${chosen.text.slice(0, 120)}`);
      console.log(`  Price: $${chosen.price}`);
      return { price: chosen.price, url: chosen.href };
    } catch (err) {
      console.log(`  Error for "${slug}": ${err.message}`);
    }
  }
  return null;
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
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 800 },
  });

  const results = [];

  for (const watch of watches) {
    if (new Date(watch.date) < new Date()) {
      console.log(`Skipping ${watch.slug} — already passed`);
      continue;
    }
    console.log(`\nProcessing: ${watch.name}`);

    const page = await context.newPage();
    try {
      const found = await scrapeFromPerformerPage(page, watch);
      if (found) {
        results.push({
          timestamp: Date.now(),
          source: "get-in",
          matchSlug: watch.slug,
          minPrice: found.price,
          maxPrice: found.price,
          currency: "USD",
          url: found.url,
        });
      } else {
        console.log("  No price found — saving debug screenshot");
        await page.screenshot({ path: `debug-${watch.slug}.png` }).catch(() => {});
      }
    } catch (err) {
      console.error(`  Error: ${err.message}`);
      await page.screenshot({ path: `debug-${watch.slug}-error.png` }).catch(() => {});
    }
    await page.close();
  }

  await browser.close();

  console.log(`\nPosting ${results.length} price(s) to worker...`);
  const res = await fetch(`${WORKER_URL}/api/ingest`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prices: results }),
  });
  console.log("Worker response:", JSON.stringify(await res.json()));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
