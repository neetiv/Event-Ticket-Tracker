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

// Find best-matching event on a TicketData performer page
async function findEventLink(page, watch) {
  const slugVariants = [
    toPerformerSlug(watch.name),
    watch.name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, "-").slice(0, 60),
  ];

  for (const slug of [...new Set(slugVariants)]) {
    const url = `https://www.ticketdata.com/performer/${slug}`;
    console.log(`  Trying: ${url}`);
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(3000);

      const events = await page.evaluate(() =>
        Array.from(document.querySelectorAll('a[href*="/events/"]'))
          .map((a) => ({
            href: a.href,
            text: (a.closest("tr") || a).innerText || "",
          }))
          .filter((e) => /\/events\/\d+/.test(e.href))
      );

      if (events.length === 0) {
        console.log("  No events found on performer page");
        continue;
      }

      // Match by date and/or venue
      const watchDate = new Date(watch.date);
      const mm = watchDate.getMonth() + 1;
      const dd = watchDate.getDate();
      const yyyy = watchDate.getFullYear();
      const venuePart = watch.venue.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12);

      let best = null;
      for (const ev of events) {
        const t = ev.text.toLowerCase().replace(/[^a-z0-9/\s]/g, "");
        const dateHit = t.includes(`${mm}/${dd}`) || t.includes(String(yyyy));
        const venueHit = venuePart && t.replace(/\s/g, "").includes(venuePart);
        if (dateHit && venueHit) { best = ev; break; }
        if ((dateHit || venueHit) && !best) best = ev;
      }

      const chosen = best || events[0];
      console.log(`  Matched event: ${chosen.href}`);
      return chosen.href;
    } catch (err) {
      console.log(`  Error for slug "${slug}": ${err.message}`);
    }
  }
  return null;
}

async function scrapeEventPrice(page, eventUrl) {
  await page.goto(eventUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(5000);

  return await page.evaluate(() => {
    const text = document.body.innerText;

    // "Current Get-In Price\n$427\nper ticket"
    const m = text.match(/Current Get-In Price[\s\S]{0,80}?\$([\d,]+)/i);
    const price = m ? parseFloat(m[1].replace(/,/g, "")) : null;

    // Grab buy links
    const links = {};
    for (const a of document.querySelectorAll("a[href]")) {
      const href = a.href;
      const label = (a.textContent || "").toLowerCase();
      if (!links.ticketmaster && (href.includes("ticketmaster") || label.includes("ticketmaster"))) links.ticketmaster = href;
      if (!links.vivid && (href.includes("vividseats") || label.includes("vivid"))) links.vivid = href;
      if (!links.stubhub && (href.includes("stubhub") || label.includes("stubhub"))) links.stubhub = href;
    }
    return { price, links };
  });
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
      const eventUrl = await findEventLink(page, watch);
      if (!eventUrl) {
        console.log("  No TicketData page found");
        await page.screenshot({ path: `debug-${watch.slug}-notfound.png` });
        await page.close();
        continue;
      }

      const { price, links } = await scrapeEventPrice(page, eventUrl);
      console.log(`  Get-in price: ${price !== null ? "$" + price : "not found"}`);
      console.log(`  Buy links: ${JSON.stringify(links)}`);

      if (price !== null) {
        results.push({
          timestamp: Date.now(),
          source: "get-in",
          matchSlug: watch.slug,
          minPrice: price,
          maxPrice: price,
          currency: "USD",
          url: eventUrl,
        });
      } else {
        await page.screenshot({ path: `debug-${watch.slug}-noprice.png` });
      }
    } catch (err) {
      console.error(`  Error: ${err.message}`);
      await page.screenshot({ path: `debug-${watch.slug}-error.png` }).catch(() => {});
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
    console.log("Worker response:", JSON.stringify(await res.json()));
  } else {
    console.log("\nNo prices scraped");
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
