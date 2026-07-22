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

async function postToWorker(price, failure) {
  const body = { prices: price ? [price] : [], failures: failure ? [failure] : [] };
  try {
    const res = await fetch(`${WORKER_URL}/api/ingest`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    console.log("  Worker response:", JSON.stringify(await res.json()));
  } catch (err) {
    // Posting is best-effort per event — a network blip here shouldn't
    // abandon the rest of the run or lose results already scraped.
    console.error("  Failed to post to worker:", err.message);
  }
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

  const now = new Date();
  const upcomingWatches = watches.filter((w) => {
    if (new Date(w.date) < now) {
      console.log(`Skipping ${w.slug} — already passed`);
      return false;
    }
    return true;
  });

  const browser = await chromium.launch({ headless: true });

  let succeeded = 0;
  let failed = 0;
  const MAX_ATTEMPTS = 3;
  const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

  for (let i = 0; i < upcomingWatches.length; i++) {
    const watch = upcomingWatches[i];
    console.log(`\nProcessing: ${watch.name}`);

    let found = null;
    let lastErr = null;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (attempt > 1) {
        const backoffMs = 5000 * (attempt - 1);
        console.log(`  Retry ${attempt}/${MAX_ATTEMPTS} in ${backoffMs / 1000}s (likely a Cloudflare bot check)...`);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
      // Fresh, isolated browser context per attempt (not just a fresh page).
      // ticketdata.com's Cloudflare protection lets the first page visited in
      // a session through cleanly but challenges follow-up pages hit
      // back-to-back in the same session — a new context resets that state.
      const context = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 800 } });
      const page = await context.newPage();
      try {
        found = await scrapeFromPerformerPage(page, watch);
        lastErr = null;
        if (found) {
          await context.close();
          break;
        }
        if (attempt === MAX_ATTEMPTS) {
          console.log("  No price found after retries — saving debug screenshot");
          await page.screenshot({ path: `debug-${watch.slug}.png` }).catch(() => {});
        }
      } catch (err) {
        lastErr = err;
        console.error(`  Error (attempt ${attempt}/${MAX_ATTEMPTS}): ${err.message}`);
        if (attempt === MAX_ATTEMPTS) {
          await page.screenshot({ path: `debug-${watch.slug}-error.png` }).catch(() => {});
        }
      }
      await context.close();
    }

    if (found) {
      succeeded++;
      await postToWorker({
        timestamp: Date.now(),
        source: "get-in",
        matchSlug: watch.slug,
        minPrice: found.price,
        maxPrice: found.price,
        currency: "USD",
        url: found.url,
      }, null);
    } else {
      failed++;
      if (lastErr) console.error(`  Giving up on ${watch.slug}: ${lastErr.message}`);
      await postToWorker(null, { matchSlug: watch.slug, reason: lastErr ? "error" : "no-price" });
    }

    // A real gap before the next performer page, on top of the fresh
    // context — back-to-back visits with no pause still read as automated.
    if (i < upcomingWatches.length - 1) {
      console.log("  Waiting 10s before next event...");
      await new Promise((r) => setTimeout(r, 10000));
    }
  }

  await browser.close();
  console.log(`\nDone: ${succeeded} succeeded, ${failed} failed, out of ${upcomingWatches.length} event(s).`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
