import { Env, PriceSnapshot } from "./types";
import { getWatches, getLatestPrice, getLastCheck, getPriceHistory, getSettings, getScrapeBlocked } from "./storage";

const SOURCES = ["get-in"];
const SOURCE_LABELS: Record<string, string> = { "get-in": "Resale Get-In" };

export async function renderDashboard(env: Env): Promise<Response> {
  const watches = await getWatches(env);
  const settings = await getSettings(env);

  const watchData = await Promise.all(
    watches.map(async (event) => {
      const sources: Record<string, { latest: PriceSnapshot | null; lastCheck: string | null; history: PriceSnapshot[] }> = {};
      await Promise.all(
        SOURCES.map(async (source) => {
          const [latest, lastCheck, history] = await Promise.all([
            getLatestPrice(env, event.slug, source),
            getLastCheck(env, event.slug, source),
            getPriceHistory(env, event.slug, source),
          ]);
          sources[source] = { latest, lastCheck, history };
        })
      );
      const scrapeBlocked = await getScrapeBlocked(env, event.slug);
      return { ...event, sources, scrapeBlocked };
    })
  );

  return new Response(buildHtml(watchData, settings), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function handleApiPrices(env: Env, slug: string): Promise<Response> {
  const result: Record<string, PriceSnapshot[]> = {};
  await Promise.all(SOURCES.map(async (s) => { result[s] = await getPriceHistory(env, slug, s); }));
  return new Response(JSON.stringify(result), {
    headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
  });
}

function buildHtml(watchData: any[], settings: any): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🌼</text></svg>">
  <title>Event Ticket Tracker</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3"></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Inter',system-ui,-apple-system,sans-serif;background-color:#e4dae9;color:#3a2d4f;padding:16px;max-width:960px;margin:0 auto;min-height:100vh;position:relative}
    body::before{content:'';position:fixed;top:0;left:0;right:0;bottom:0;background-image:url('/bg.png');background-size:cover;background-attachment:fixed;background-position:center;opacity:.7;z-index:0;pointer-events:none}
    body>*{position:relative;z-index:1}
    h1{font-family:'Playfair Display',serif;font-size:2rem;color:#5a3d7a;margin-bottom:2px;font-weight:900}
    h2{font-family:'Playfair Display',serif;font-size:1.2rem;color:#5a3d7a;margin:18px 0 10px;font-weight:700;font-style:italic}
    .subtitle{color:#8a7699;font-size:.82rem;margin-bottom:16px}
    .tabs{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;border-bottom:2px solid #e6dced;padding-bottom:8px}
    .tab{padding:8px 16px;border-radius:20px;border:none;background:transparent;color:#8a7699;cursor:pointer;font-family:'Playfair Display',serif;font-size:.88rem;font-weight:700;font-style:italic;transition:all .15s}
    .tab:hover{background:#efe6f5;color:#5a3d7a}
    .tab.active{background:#9b72b0;color:#fff}
    .tab.active:hover{background:#8a5fa0}
    .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-bottom:16px}
    .card{background:rgba(255,255,255,.85);backdrop-filter:blur(8px);border:1px solid #e6dced;border-radius:14px;padding:14px;transition:box-shadow .15s}
    .card:hover{box-shadow:0 4px 16px rgba(90,61,122,.08)}
    .card-label{font-size:.7rem;color:#8a7699;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
    .card-value{font-size:1.6rem;font-weight:700;color:#3a2d4f}
    .card-value.green{color:#6a9e6f}.card-value.amber{color:#c9a050}.card-value.auburn{color:#b8674a}.card-value.red{color:#a13d4c}.card-value.na{color:#c4b5cc;font-size:1.1rem}
    .card-sub{font-size:.72rem;color:#8a7699;margin-top:3px}
    .chart-box{background:rgba(255,255,255,.85);backdrop-filter:blur(8px);border:1px solid #e6dced;border-radius:14px;padding:14px;margin-bottom:16px}
    canvas{max-height:300px}
    a{color:#9b72b0;text-decoration:none}a:hover{text-decoration:underline;color:#7a5694}
    .panel{background:rgba(255,255,255,.85);backdrop-filter:blur(8px);border:1px solid #e6dced;border-radius:14px;padding:16px;margin-bottom:16px}
    input,select{background:#f8f4fb;border:1px solid #e6dced;color:#3a2d4f;border-radius:8px;padding:8px 10px;font-size:.85rem;width:100%}
    input:focus,select:focus{outline:none;border-color:#9b72b0}
    .btn{padding:8px 16px;border-radius:20px;border:none;font-size:.84rem;font-weight:600;cursor:pointer;transition:all .15s}
    .btn-primary{background:#9b72b0;color:#fff}.btn-primary:hover{background:#8a5fa0}
    .btn-mint{background:#b6e0c1;color:#fff}.btn-mint:hover{background:#9ed4ab}
    .btn-pink{background:#ff94d8;color:#fff}.btn-pink:hover{background:#f07cc4}
    .btn-danger{background:#f5d5e0;color:#8b3a4a}.btn-danger:hover{background:#f0c0cf}
    .btn-sm{padding:5px 12px;font-size:.75rem}
    .form-row{display:flex;gap:8px;align-items:start;margin-bottom:10px}
    .form-group{flex:1}
    .form-group label{display:block;font-size:.72rem;color:#8a7699;margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em}
    .search-results{max-height:500px;overflow-y:auto;margin-top:10px}
    .search-item{display:flex;gap:12px;padding:12px;border:1px solid #e6dced;border-radius:12px;margin-bottom:8px;background:rgba(255,255,255,.85);backdrop-filter:blur(8px);align-items:center;transition:box-shadow .15s}
    .search-item:hover{box-shadow:0 2px 12px rgba(90,61,122,.06)}
    .si-img{width:80px;height:50px;border-radius:8px;object-fit:cover;flex-shrink:0}
    .si-info{flex:1;min-width:0}
    .si-name{font-size:.88rem;color:#3a2d4f;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .si-detail{font-size:.78rem;color:#8a7699;margin-top:2px}
    .si-price{font-size:.9rem;font-weight:700;color:#6a9e6f;white-space:nowrap}
    .si-genre{display:inline-block;padding:2px 8px;border-radius:10px;font-size:.65rem;font-weight:600;background:#efe6f5;color:#7a5694;margin-top:3px}
    .badge{display:inline-block;padding:2px 10px;border-radius:10px;font-size:.68rem;font-weight:600}
    .badge-on{background:#b6e0c1;color:#fff}.badge-off{background:#efe6f5;color:#8a7699}
    .empty{text-align:center;color:#c4b5cc;padding:40px;font-size:.9rem}
    .empty::before{content:'\\1F338 ';font-size:1.2em}
    .empty::after{content:' \\1F338';font-size:1.2em}
    .footer{text-align:center;font-size:.68rem;color:#c4b5cc;margin-top:24px}
    .info-row{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:10px}
    .info-detail{font-size:.78rem;color:#8a7699}
    .watch-item{display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid #e6dced;border-radius:10px;margin-bottom:6px;background:#f8f4fb}
    .hidden{display:none}
    .modal-bg{position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,.4);z-index:100;display:flex;align-items:center;justify-content:center;padding:20px}
    .modal{background:#fff;border-radius:16px;padding:24px;max-width:500px;width:100%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.15)}
    .modal h3{font-family:'Playfair Display',serif;font-size:1.1rem;color:#5a3d7a;margin-bottom:8px;font-style:italic}
    .modal p{font-size:.85rem;color:#3a2d4f;line-height:1.5;margin-bottom:8px}
    .modal .close-btn{float:right;background:none;border:none;font-size:1.5rem;cursor:pointer;color:#8a7699;line-height:1}
    .si-name.clickable{cursor:pointer;text-decoration:underline;text-decoration-style:dotted;text-underline-offset:3px}
    .accordion{border:1px solid #e6dced;border-radius:14px;margin-bottom:10px;overflow:hidden;background:rgba(255,255,255,.85);backdrop-filter:blur(8px)}
    .accordion-header{display:flex;justify-content:space-between;align-items:center;padding:14px 16px;cursor:pointer;transition:background .15s}
    .accordion-header:hover{background:rgba(230,220,237,.3)}
    .accordion-title{font-family:'Playfair Display',serif;font-weight:700;font-style:italic;font-size:.95rem;color:#3a2d4f}
    .accordion-meta{font-size:.75rem;color:#8a7699}
    .accordion-arrow{font-size:1.2rem;color:#8a7699;transition:transform .2s}
    .accordion-arrow.open{transform:rotate(180deg)}
    .accordion-body{padding:0 16px 16px;display:none}
    .accordion-body.open{display:block}
    .hero{text-align:center;padding:20px 0 10px}
    .hero h1{font-family:'Playfair Display',serif;font-size:2.2rem;font-weight:900}
    .hero h1 .grad{background:linear-gradient(135deg,#7a4d9e,#c47a9e);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
    .hero-search{max-width:600px;margin:0 auto}
  </style>
</head>
<body>
  <div class="hero">
    <h1>&#127804; <span class="grad">Event Ticket Tracker</span> &#127804;</h1>
    <p class="subtitle">&#127800; Search events &#127800; Track prices &#127800; Get alerts when they drop &#127800;</p>
  </div>

  <div class="tabs" id="tabs"></div>
  <div id="view"></div>

  <div class="footer">
    &#127800; Powered by Ticketmaster Discovery API &middot; Prices may not reflect all resale listings &#127800;
  </div>

<script>
const WATCHES = ${JSON.stringify(watchData)};
const SETTINGS = ${JSON.stringify(settings)};
const SOURCE_LABELS = ${JSON.stringify(SOURCE_LABELS)};
let activeView = '_search';
let chart = null;

function init() {
  renderTabs();
  showView(activeView);
}

function renderTabs() {
  const c = document.getElementById('tabs');
  let html = '<button class="tab'+(activeView==='_search'?' active':'')+'" data-view="_search">&#127804; Explore Events</button>';
  if (WATCHES.length > 0) {
    html += '<button class="tab'+(activeView==='_tracked'?' active':'')+'" data-view="_tracked">&#127804; Tracked ('+WATCHES.length+')</button>';
  }
  html += '<button class="tab'+(activeView==='_alerts'?' active':'')+'" data-view="_alerts">&#127804; Alerts &amp; Settings</button>';
  c.innerHTML = html;
  c.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    activeView = t.dataset.view;
    renderTabs();
    showView(activeView);
  }));
}

function showView(view) {
  const v = document.getElementById('view');
  if (view === '_search') { renderSearchView(v); return; }
  if (view === '_tracked') { renderTrackedView(v); return; }
  if (view === '_alerts') { renderSettingsView(v); return; }
  v.innerHTML = '<div class="empty">Select a tab</div>';
}

// =============== SEARCH VIEW ===============
function renderSearchView(container) {
  container.innerHTML =
    '<div class="panel hero-search">'+
      '<div class="form-row">'+
        '<div class="form-group" style="flex:2"><label>Search</label>'+
          '<input type="text" id="searchQ" placeholder="Artist, team, event..." value=""></div>'+
        '<div class="form-group"><label>City</label>'+
          '<input type="text" id="searchCity" placeholder="Any city"></div>'+
        '<div class="form-group" style="flex:.8"><label>Category</label>'+
          '<select id="searchCat">'+
            '<option value="all">All</option>'+
            '<option value="Music">Music</option>'+
            '<option value="Sports">Sports</option>'+
            '<option value="Arts & Theatre">Arts</option>'+
            '<option value="Comedy">Comedy</option>'+
          '</select></div>'+
        '<div><button class="btn btn-primary" id="searchBtn">Search</button></div>'+
      '</div>'+
    '</div>'+
    '<div id="searchResults"><div class="empty">Search for any event above</div></div>';

  document.getElementById('searchBtn').addEventListener('click', doSearch);
  document.getElementById('searchQ').addEventListener('keydown', e => { if (e.key==='Enter') doSearch(); });
  document.getElementById('searchCity').addEventListener('keydown', e => { if (e.key==='Enter') doSearch(); });
}

async function doSearch() {
  const q = document.getElementById('searchQ').value.trim();
  const city = document.getElementById('searchCity').value.trim();
  const cat = document.getElementById('searchCat').value;
  const box = document.getElementById('searchResults');
  if (!q && !city) { box.innerHTML = '<div class="empty">Enter a search term or city</div>'; return; }
  box.innerHTML = '<div class="empty">Searching...</div>';
  try {
    let url = '/api/search?q='+encodeURIComponent(q || 'events');
    if (city) url += '&city='+encodeURIComponent(city);
    if (cat !== 'all') url += '&category='+encodeURIComponent(cat);
    const res = await fetch(url);
    const data = await res.json();
    if (!data.results?.length) { box.innerHTML = '<div class="empty">No events found. Try different search terms.</div>'; return; }
    box.innerHTML = '<div class="search-results">'+data.results.map(r => {
      const d = r.date ? new Date(r.date).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '';
      const price = r.minPrice ? '$'+r.minPrice+(r.maxPrice&&r.maxPrice!==r.minPrice?' – $'+r.maxPrice:'') : '';
      const img = r.imageUrl ? '<img class="si-img" src="'+r.imageUrl+'" alt="">' : '';
      const seg = r.segment && r.segment !== 'Undefined' ? '<span class="si-genre" style="background:#e6dced;color:#5a3d7a">'+r.segment+'</span> ' : '';
      const genre = r.genre && r.genre !== 'Undefined' ? '<span class="si-genre">'+r.genre+'</span>' : '';
      const cityState = (r.city||'')+(r.state?', '+r.state:'');
      const loc = r.venue+(cityState?'; '+cityState:'');
      const isTracked = WATCHES.some(w => w.ticketmasterEventId === r.eventId);
      const hasInfo = r.info && r.info.length > 0;
      const infoData = hasInfo ? ' data-info="'+encodeURIComponent(r.info)+'" data-ename="'+encodeURIComponent(r.name)+'"' : '';
      const infoIcon = hasInfo ? ' <span style="font-size:.7em;opacity:.6" title="Click for details">&#8505;&#65039;</span>' : '';
      return '<div class="search-item">'+img+
        '<div class="si-info"><div class="si-name'+(hasInfo?' clickable':'')+'"'+infoData+'>'+r.name+infoIcon+'</div>'+
          '<div class="si-detail"><strong>'+loc+'</strong></div>'+
          (d?'<div class="si-detail" style="color:#5a3d7a;font-weight:500">'+d+'</div>':'')+seg+genre+
        '</div>'+
        (price?'<div class="si-price">'+price+'</div>':'')+
        (r.url?'<a href="'+r.url+'" target="_blank" class="btn btn-pink btn-sm" style="margin-right:4px">Buy Tickets</a>':'')+
        (isTracked
          ? '<span class="badge badge-on">&#127800; Tracking</span>'
          : '<button class="btn btn-mint btn-sm" data-event="'+encodeURIComponent(JSON.stringify(r))+'">Track</button>')+
      '</div>';
    }).join('')+'</div>';
    box.querySelectorAll('button[data-event]').forEach(btn => {
      btn.addEventListener('click', () => trackEvent(JSON.parse(decodeURIComponent(btn.dataset.event))));
    });
    box.querySelectorAll('.si-name.clickable').forEach(el => {
      el.addEventListener('click', () => {
        showModal(decodeURIComponent(el.dataset.ename), decodeURIComponent(el.dataset.info));
      });
    });
  } catch(e) { box.innerHTML = '<div class="empty">Search failed.</div>'; }
}

function trackEvent(event) {
  const slug = slugify(event.name + '-' + event.eventId);
  const defaultPrice = event.minPrice ? String(Math.round(event.minPrice * 0.9)) : '100';
  const d = event.date ? new Date(event.date).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'}) : '';

  showModal('&#127804; <span style="text-transform:uppercase;letter-spacing:.08em;font-size:.85em">Track:</span> '+event.name,
    '<div style="margin-bottom:12px"><strong>'+(event.venue||'')+'</strong>'+(d?' &middot; '+d:'')+'</div>'+
    '<div class="form-group" style="margin-bottom:12px"><label>&#127804; Alert when price drops below ($)</label>'+
      '<input type="number" id="trackPrice" value="'+defaultPrice+'" min="1" style="font-size:1.1rem;text-align:center"></div>'+
    '<div class="form-group" style="margin-bottom:12px"><label>&#127804; How many tickets?</label>'+
      '<input type="number" id="trackQty" value="2" min="1" max="10" style="font-size:1.1rem;text-align:center"></div>'+
    '<div style="display:flex;gap:8px;justify-content:center;margin-top:16px">'+
      '<button class="btn btn-mint" id="trackConfirm" style="padding:10px 28px;font-size:.95rem">&#127804; Start Tracking</button>'+
      '<button class="btn" id="trackCancel" style="padding:10px 20px;background:#e6dced;color:#5a3d7a">Cancel</button>'+
    '</div>',
    true
  );

  document.getElementById('trackCancel').addEventListener('click', () => {
    document.querySelector('.modal-bg').remove();
  });
  document.getElementById('trackConfirm').addEventListener('click', async () => {
    const watch = {
      slug,
      name: event.name,
      date: event.date || new Date().toISOString(),
      venue: event.venue || '',
      city: (event.city||'')+(event.state?', '+event.state:''),
      ticketmasterEventId: event.eventId,
      ticketsWanted: parseInt(document.getElementById('trackQty').value) || 2,
      maxPrice: parseInt(document.getElementById('trackPrice').value) || 100,
      alertsEnabled: true,
      url: event.url || 'https://www.ticketmaster.com/event/'+event.eventId,
    };
    await fetch('/api/watches', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(watch)});
    location.reload();
  });
}

// =============== TRACKED VIEW ===============
function renderTrackedView(container) {
  if (WATCHES.length === 0) {
    container.innerHTML = '<div class="empty">No events tracked yet. Search and track events from the Explore tab.</div>';
    return;
  }

  let html = '<h2>&#127800; Your Tracked Events</h2>';
  const si = SETTINGS.scrapeIntervalMinutes || 60;
  WATCHES.forEach((event, idx) => {
    const d = new Date(event.date);
    const isPast = d < new Date();
    const dateStr = d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
    const daysLeft = Math.max(0, Math.ceil((d - Date.now()) / 86400000));
    const badge = event.alertsEnabled
      ? '<span class="badge badge-on">Alert &le;$'+event.maxPrice+'</span>'
      : '<span class="badge badge-off">Tracking only</span>';

    if (isPast) {
      html += '<div class="accordion" style="border-color:#e6dced;opacity:.85">'+
        '<div class="accordion-header" style="cursor:default">'+
          '<div>'+
            '<div class="accordion-title" style="color:#a090b8">&#127804; '+event.name+'</div>'+
            '<div class="accordion-meta">'+event.venue+', '+event.city+' &middot; '+dateStr+'</div>'+
          '</div>'+
        '</div>'+
        '<div style="padding:10px 16px 14px;display:flex;align-items:center;gap:12px;background:rgba(255,240,245,.6);border-top:1px solid #f0e4f7">'+
          '<span style="font-size:.82rem;color:#9b72b0">&#9888;&#65039; This show has already occurred.</span>'+
          '<button class="btn btn-pink btn-sm remove-watch" data-slug="'+event.slug+'" style="margin-left:auto">Remove</button>'+
        '</div>'+
      '</div>';
      return;
    }

    let cardsHtml = '';
    for (const [source, data] of Object.entries(event.sources || {})) {
      const label = SOURCE_LABELS[source] || source.charAt(0).toUpperCase() + source.slice(1);
      const latest = data.latest;
      let cls='na', val='No data yet', sub='';
      if (latest && latest.minPrice !== null) {
        const p = latest.minPrice;
        cls = p <= event.maxPrice * 0.85 ? 'green' : p <= event.maxPrice ? 'amber' : p <= event.maxPrice * 1.15 ? 'auburn' : 'red';
        val = '$'+p;
        if (latest.maxPrice && latest.maxPrice !== latest.minPrice) sub = 'Range: $'+latest.minPrice+' – $'+latest.maxPrice;
      }
      const chk = data.lastCheck ? timeAgo(new Date(data.lastCheck)) : 'never';
      const buyUrl = latest?.url;
      const link = buyUrl ? ' &middot; <a href="'+buyUrl+'" target="_blank">Buy tickets</a>' : '';
      cardsHtml += '<div class="card"><div class="card-label">'+label+'</div><div class="card-value '+cls+'">'+val+'</div>'+
        (sub?'<div class="card-sub">'+sub+'</div>':'')+
        '<div class="card-sub">Checked '+chk+link+'</div></div>';
    }

    html += '<div class="accordion">'+
      '<div class="accordion-header" data-acc="'+idx+'">'+
        '<div><div class="accordion-title">&#127804; '+event.name+'</div>'+
          '<div class="accordion-meta">'+event.venue+', '+event.city+' &middot; '+dateStr+' &middot; '+daysLeft+' days '+badge+'</div>'+
        '</div>'+
        '<span class="accordion-arrow" id="arrow-'+idx+'">&#9660;</span>'+
      '</div>'+
      '<div class="accordion-body" id="body-'+idx+'">'+
        '<div style="margin-bottom:10px;display:flex;gap:6px;align-items:center;flex-wrap:wrap">'+
          (event.url?'<a href="'+event.url+'" target="_blank" class="btn btn-pink btn-sm">Buy Tickets</a>':'')+
          '<button class="btn btn-primary btn-sm trigger-scrape">&#127804; Scrape Prices</button>'+
          '<span class="scrape-status" style="font-size:.75rem;color:#8a7699"></span>'+
          '<span style="margin-left:auto;display:flex;align-items:center;gap:6px">'+
            '<label style="font-size:.72rem;color:#8a7699;text-transform:uppercase;letter-spacing:.04em">Scrape every</label>'+
            '<select class="scrape-interval" style="width:auto;padding:5px 8px;font-size:.75rem">'+
              '<option value="15"'+(si===15?' selected':'')+'>15 min</option>'+
              '<option value="30"'+(si===30?' selected':'')+'>30 min</option>'+
              '<option value="60"'+(si===60?' selected':'')+'>1 hr</option>'+
              '<option value="120"'+(si===120?' selected':'')+'>2 hrs</option>'+
              '<option value="240"'+(si===240?' selected':'')+'>4 hrs</option>'+
              '<option value="360"'+(si===360?' selected':'')+'>6 hrs</option>'+
            '</select>'+
          '</span>'+
        '</div>'+
        (event.scrapeBlocked?'<div class="card-sub" style="color:#c45c6e;margin-bottom:8px">&#9888;&#65039; Resale scraper is currently blocked by the source site’s bot check &mdash; we’ll notify you when it recovers.</div>':'')+
        '<div class="cards">'+cardsHtml+'</div>'+
        '<div class="chart-box"><canvas id="chart-'+idx+'"></canvas></div>'+
        '<div class="panel">'+
          '<div class="form-row">'+
            '<div class="form-group"><label>Max Price ($)</label><input type="number" class="edit-price" data-idx="'+idx+'" value="'+event.maxPrice+'" min="1"></div>'+
            '<div class="form-group"><label>Tickets</label><input type="number" class="edit-qty" data-idx="'+idx+'" value="'+event.ticketsWanted+'" min="1" max="10"></div>'+
            '<div class="form-group"><label>Alerts</label><select class="edit-alerts" data-idx="'+idx+'"><option value="true"'+(event.alertsEnabled?' selected':'')+'>On</option><option value="false"'+(!event.alertsEnabled?' selected':'')+'>Off</option></select></div>'+
            '<div><button class="btn btn-primary btn-sm save-watch" data-idx="'+idx+'">Save</button></div>'+
          '</div>'+
        '</div>'+
        '<button class="btn btn-danger btn-sm remove-watch" data-slug="'+event.slug+'">Remove from tracking</button>'+
      '</div>'+
    '</div>';
  });

  container.innerHTML = html;

  // Accordion toggle
  container.querySelectorAll('.accordion-header').forEach(hdr => {
    hdr.addEventListener('click', () => {
      const idx = hdr.dataset.acc;
      const body = document.getElementById('body-'+idx);
      const arrow = document.getElementById('arrow-'+idx);
      const isOpen = body.classList.toggle('open');
      arrow.classList.toggle('open', isOpen);
      if (isOpen) renderAccordionChart(idx);
    });
  });

  // Save
  container.querySelectorAll('.save-watch').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = parseInt(btn.dataset.idx);
      const updated = Object.assign({}, WATCHES[i]);
      delete updated.sources;
      updated.maxPrice = parseInt(container.querySelector('.edit-price[data-idx="'+i+'"]').value) || 100;
      updated.ticketsWanted = parseInt(container.querySelector('.edit-qty[data-idx="'+i+'"]').value) || 2;
      updated.alertsEnabled = container.querySelector('.edit-alerts[data-idx="'+i+'"]').value === 'true';
      await fetch('/api/watches', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(updated)});
      location.reload();
    });
  });

  // Trigger scraper
  container.querySelectorAll('.trigger-scrape').forEach(btn => {
    btn.addEventListener('click', async () => {
      const status = btn.nextElementSibling;
      btn.disabled = true;
      btn.textContent = 'Starting scraper...';
      try {
        const res = await fetch('/api/scrape', {method:'POST'});
        const data = await res.json();
        if (data.ok) {
          btn.textContent = 'Scraper running...';
          let sec = 60;
          status.textContent = 'Refreshing in '+sec+'s';
          const timer = setInterval(() => {
            sec--;
            status.textContent = 'Refreshing in '+sec+'s';
            if (sec <= 0) { clearInterval(timer); location.reload(); }
          }, 1000);
        } else {
          btn.textContent = '\\u{1F33C} Scrape Prices';
          status.textContent = 'Failed — check GitHub PAT secret';
          btn.disabled = false;
        }
      } catch(e) {
        btn.textContent = '\\u{1F33C} Scrape Prices';
        status.textContent = 'Error triggering scraper';
        btn.disabled = false;
      }
    });
  });

  // Remove
  container.querySelectorAll('.remove-watch').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Stop tracking this event?')) return;
      await fetch('/api/watches/'+btn.dataset.slug, {method:'DELETE'});
      location.reload();
    });
  });

  // Scrape interval (global setting, editable from any card)
  container.querySelectorAll('.scrape-interval').forEach(sel => {
    sel.addEventListener('change', async () => {
      const minutes = parseInt(sel.value);
      const s = Object.assign({}, SETTINGS, {scrapeIntervalMinutes: minutes});
      await fetch('/api/settings', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(s)});
      SETTINGS.scrapeIntervalMinutes = minutes;
      container.querySelectorAll('.scrape-interval').forEach(other => { other.value = String(minutes); });
    });
  });
}

function renderAccordionChart(idx) {
  const event = WATCHES[idx];
  const canvas = document.getElementById('chart-'+idx);
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const datasets = [];
  const colors = {'get-in':'#ff94d8'};
  for (const [source, data] of Object.entries(event.sources || {})) {
    if (!data.history || data.history.length === 0) continue;
    datasets.push({
      label: SOURCE_LABELS[source] || source.charAt(0).toUpperCase()+source.slice(1),
      data: data.history.filter(h=>h.minPrice!==null).map(h=>({x:h.timestamp,y:h.minPrice})),
      borderColor:colors[source]||'#9b72b0',backgroundColor:(colors[source]||'#9b72b0')+'20',
      borderWidth:2,pointRadius:1.5,tension:0.3,fill:true,
    });
  }
  if (event.alertsEnabled && datasets.length > 0) {
    datasets.push({
      label:'Target ($'+event.maxPrice+')',
      data:[{x:datasets[0].data[0]?.x||Date.now(),y:event.maxPrice},{x:Date.now(),y:event.maxPrice}],
      borderColor:'#f0c0cf',borderWidth:2,borderDash:[6,4],pointRadius:0,fill:false,
    });
  }
  new Chart(ctx,{
    type:'line',data:{datasets},
    options:{
      responsive:true,interaction:{mode:'index',intersect:false},
      scales:{
        x:{type:'time',time:{tooltipFormat:'MMM d, h:mm a'},grid:{color:'#efe6f5'},ticks:{color:'#8a7699'}},
        y:{beginAtZero:false,grid:{color:'#efe6f5'},ticks:{color:'#8a7699',callback:v=>'$'+v}},
      },
      plugins:{legend:{labels:{color:'#8a7699'}},tooltip:{callbacks:{label:c=>c.dataset.label+': $'+c.parsed.y}}},
    },
  });
}

// =============== EVENT VIEW (unused, kept for direct links) ===============
function renderEventView(container, event) {
  const d = new Date(event.date);
  const dateStr = d.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const daysLeft = Math.max(0, Math.ceil((d - Date.now()) / 86400000));
  const badge = event.alertsEnabled
    ? '<span class="badge badge-on">Alerts on &le;$'+event.maxPrice+'</span>'
    : '<span class="badge badge-off">Tracking only</span>';

  let cardsHtml = '';
  for (const [source, data] of Object.entries(event.sources)) {
    const label = SOURCE_LABELS[source] || source.charAt(0).toUpperCase() + source.slice(1);
    const latest = data.latest;
    let cls='na', val='No data yet', sub='';
    if (latest && latest.minPrice !== null) {
      const p = latest.minPrice;
      cls = p <= event.maxPrice * 0.85 ? 'green' : p <= event.maxPrice ? 'amber' : p <= event.maxPrice * 1.15 ? 'auburn' : 'red';
      val = '$'+p;
      if (latest.maxPrice && latest.maxPrice !== latest.minPrice) sub = 'Range: $'+latest.minPrice+' – $'+latest.maxPrice;
    }
    const chk = data.lastCheck ? timeAgo(new Date(data.lastCheck)) : 'never';
    const buyUrl = latest?.url || (source === 'ticketmaster' ? event.url : null);
    const link = buyUrl ? ' &middot; <a href="'+buyUrl+'" target="_blank">Buy tickets</a>' : '';
    cardsHtml += '<div class="card"><div class="card-label">'+label+'</div><div class="card-value '+cls+'">'+val+'</div>'+
      (sub?'<div class="card-sub">'+sub+'</div>':'')+
      '<div class="card-sub">Checked '+chk+link+'</div></div>';
  }

  container.innerHTML =
    '<div class="info-row"><span class="info-detail">'+event.venue+', '+event.city+' &middot; '+dateStr+' &middot; '+daysLeft+' days &middot; '+event.ticketsWanted+' tickets</span>'+badge+'</div>'+
    (event.url?'<div style="margin-bottom:12px"><a href="'+event.url+'" target="_blank" class="btn btn-primary btn-sm">View on Ticketmaster</a></div>':'')+
    '<div class="cards">'+cardsHtml+'</div>'+
    '<div class="chart-box"><canvas id="priceChart"></canvas></div>'+
    '<div class="panel">'+
      '<div class="form-row">'+
        '<div class="form-group"><label>Max Price ($)</label><input type="number" id="editPrice" value="'+event.maxPrice+'" min="1"></div>'+
        '<div class="form-group"><label>Tickets</label><input type="number" id="editQty" value="'+event.ticketsWanted+'" min="1" max="10"></div>'+
        '<div class="form-group"><label>Alerts</label><select id="editAlerts"><option value="true"'+(event.alertsEnabled?' selected':'')+'>On</option><option value="false"'+(!event.alertsEnabled?' selected':'')+'>Off</option></select></div>'+
        '<div><button class="btn btn-primary btn-sm" id="saveBtn">Save</button></div>'+
      '</div>'+
    '</div>'+
    '<button class="btn btn-danger btn-sm" id="removeBtn">Remove from tracking</button>';

  renderChart(event);

  document.getElementById('saveBtn').addEventListener('click', async () => {
    const updated = Object.assign({}, event);
    delete updated.sources;
    updated.maxPrice = parseInt(document.getElementById('editPrice').value) || 100;
    updated.ticketsWanted = parseInt(document.getElementById('editQty').value) || 2;
    updated.alertsEnabled = document.getElementById('editAlerts').value === 'true';
    await fetch('/api/watches', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(updated)});
    location.reload();
  });
  document.getElementById('removeBtn').addEventListener('click', async () => {
    if (!confirm('Stop tracking '+event.name+'?')) return;
    await fetch('/api/watches/'+event.slug, {method:'DELETE'});
    location.reload();
  });
}

function renderChart(event) {
  const ctx = document.getElementById('priceChart').getContext('2d');
  if (chart) chart.destroy();
  const datasets = [];
  const colors = {'get-in':'#ff94d8'};
  for (const [source, data] of Object.entries(event.sources)) {
    if (data.history.length === 0) continue;
    datasets.push({
      label: SOURCE_LABELS[source] || source.charAt(0).toUpperCase()+source.slice(1),
      data: data.history.filter(h=>h.minPrice!==null).map(h=>({x:h.timestamp,y:h.minPrice})),
      borderColor:colors[source]||'#c9a88c',backgroundColor:(colors[source]||'#c9a88c')+'20',
      borderWidth:2,pointRadius:1.5,tension:0.3,fill:true,
    });
  }
  if (event.alertsEnabled && datasets.length > 0) {
    datasets.push({
      label:'Target ($'+event.maxPrice+')',
      data:[{x:datasets[0].data[0]?.x||Date.now(),y:event.maxPrice},{x:Date.now(),y:event.maxPrice}],
      borderColor:'#f0c0cf',borderWidth:2,borderDash:[6,4],pointRadius:0,fill:false,
    });
  }
  chart = new Chart(ctx,{
    type:'line',data:{datasets},
    options:{
      responsive:true,interaction:{mode:'index',intersect:false},
      scales:{
        x:{type:'time',time:{tooltipFormat:'MMM d, h:mm a'},grid:{color:'#efe6f5'},ticks:{color:'#8a7699'}},
        y:{beginAtZero:false,grid:{color:'#efe6f5'},ticks:{color:'#8a7699',callback:v=>'$'+v}},
      },
      plugins:{legend:{labels:{color:'#8a7699'}},tooltip:{callbacks:{label:c=>c.dataset.label+': $'+c.parsed.y}}},
    },
  });
}

// =============== SETTINGS VIEW ===============
function renderSettingsView(container) {
  const curMethod = SETTINGS.alertMethod || 'ntfy';
  const si = SETTINGS.scrapeIntervalMinutes || 60;
  container.innerHTML =
    '<h2>&#127800; Notification Settings</h2>'+
    '<div class="panel">'+
      '<div class="form-group" style="margin-bottom:12px"><label>Alert Method</label>'+
        '<select id="sMethod"><option value="ntfy"'+(curMethod==='ntfy'?' selected':'')+'>ntfy (push notifications)</option><option value="sms"'+(curMethod==='sms'?' selected':'')+'>SMS (text messages)</option><option value="both"'+(curMethod==='both'?' selected':'')+'>Both</option></select></div>'+
      '<div class="form-group" style="margin-bottom:12px"><label>Resale Scrape Interval</label>'+
        '<select id="sScrapeInterval">'+
          '<option value="15"'+(si===15?' selected':'')+'>Every 15 minutes</option>'+
          '<option value="30"'+(si===30?' selected':'')+'>Every 30 minutes</option>'+
          '<option value="60"'+(si===60?' selected':'')+'>Every hour</option>'+
          '<option value="120"'+(si===120?' selected':'')+'>Every 2 hours</option>'+
          '<option value="240"'+(si===240?' selected':'')+'>Every 4 hours</option>'+
          '<option value="360"'+(si===360?' selected':'')+'>Every 6 hours</option>'+
        '</select>'+
        '<div class="card-sub" style="margin-top:4px">GitHub Actions checks every 15 min and skips runs that are not due yet. Increase frequency as event date gets closer.</div></div>'+
      '<div id="ntfySettings"'+(curMethod==='sms'?' class="hidden"':'')+'>'+
        '<div class="form-group" style="margin-bottom:10px"><label>ntfy Topic</label><input type="text" id="sNtfy" value="'+(SETTINGS.ntfyTopic||'')+'" placeholder="my-ticket-alerts">'+
          '<div class="card-sub" style="margin-top:4px">Install <a href="https://ntfy.sh" target="_blank">ntfy app</a> and subscribe to this topic.</div></div></div>'+
      '<div id="smsSettings"'+(curMethod==='ntfy'?' class="hidden"':'')+'>'+
        '<div class="form-group" style="margin-bottom:10px"><label>SMS Gateway Email</label><input type="text" id="sSms" value="'+(SETTINGS.smsGatewayEmail||'')+'" placeholder="2065551234@tmomail.net">'+
          '<div class="card-sub" style="margin-top:4px">Your 10-digit number + carrier domain. Find yours:<br>'+
            '&#127804; <strong>T-Mobile:</strong> number@tmomail.net<br>'+
            '&#127804; <strong>AT&amp;T:</strong> number@txt.att.net<br>'+
            '&#127804; <strong>Verizon:</strong> number@vtext.com<br>'+
            '&#127804; <strong>Sprint:</strong> number@messaging.sprintpcs.com<br>'+
            '<a href="https://avtech.com/articles/138/list-of-carrier-gateway-addresses/" target="_blank">Full list of carrier gateways &rarr;</a></div>'+
        '</div></div>'+
      '<button class="btn btn-primary" id="saveSettings">Save Settings</button>'+
    '</div>'+
    '<h2>&#127800; New Event Alerts</h2>'+
    '<div class="panel">'+
      '<div class="card-sub" style="margin-bottom:10px">Get notified when new events are announced in your city.</div>'+
      '<div id="cityWatchList"></div>'+
      '<div class="form-row" style="margin-top:10px">'+
        '<div class="form-group"><label>City</label><input type="text" id="cwCity" placeholder="e.g. Seattle, LA, NYC"></div>'+
        '<div class="form-group"><label>Categories</label>'+
          '<select id="cwCat" multiple style="height:80px">'+
            '<option value="Music" selected>Music</option>'+
            '<option value="Sports">Sports</option>'+
            '<option value="Arts & Theatre">Arts & Theatre</option>'+
            '<option value="Comedy">Comedy</option>'+
          '</select></div>'+
        '<div><button class="btn btn-mint btn-sm" id="addCityWatch">Add</button></div>'+
      '</div>'+
    '</div>'+
    '<h2>&#127800; Tracked Events</h2>'+
    '<div class="panel" id="watchList"></div>'+
    '<h2>&#127800; Manual Actions</h2>'+
    '<div class="panel"><button class="btn btn-primary" id="manualCheck">&#127804; Scrape All Prices</button> <span id="checkStatus" style="font-size:.82rem;color:#8a7699"></span></div>';

  const wl = document.getElementById('watchList');
  if (WATCHES.length === 0) {
    wl.innerHTML = '<div class="empty">No events tracked yet. Search and add events from the Explore tab.</div>';
  } else {
    wl.innerHTML = WATCHES.map(w => {
      const d = new Date(w.date).toLocaleDateString('en-US',{month:'short',day:'numeric'});
      return '<div class="watch-item"><div><strong>'+w.name+'</strong><br><span style="font-size:.75rem;color:#8a7265">'+w.venue+', '+w.city+' &middot; '+d+' &middot; Alert: '+(w.alertsEnabled?'&le;$'+w.maxPrice:'off')+'</span></div>'+
        '<button class="btn btn-danger btn-sm" data-slug="'+w.slug+'">Remove</button></div>';
    }).join('');
    wl.querySelectorAll('button[data-slug]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove?')) return;
        await fetch('/api/watches/'+btn.dataset.slug, {method:'DELETE'});
        location.reload();
      });
    });
  }

  // City watch list
  const cwl = document.getElementById('cityWatchList');
  const cityWatches = SETTINGS.cityWatches || [];
  if (cityWatches.length > 0) {
    cwl.innerHTML = cityWatches.map((cw, i) =>
      '<div class="watch-item"><div>&#127800; <strong>'+cw.city+'</strong> &mdash; '+cw.categories.join(', ')+
        (cw.enabled?'':' <span style="color:#c4b5cc">(paused)</span>')+'</div>'+
        '<button class="btn btn-danger btn-sm" data-cwi="'+i+'">Remove</button></div>'
    ).join('');
    cwl.querySelectorAll('button[data-cwi]').forEach(btn => {
      btn.addEventListener('click', async () => {
        cityWatches.splice(parseInt(btn.dataset.cwi), 1);
        const s = Object.assign({}, SETTINGS, {cityWatches});
        await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(s)});
        location.reload();
      });
    });
  } else {
    cwl.innerHTML = '<div class="card-sub">No city watches set up yet.</div>';
  }

  document.getElementById('addCityWatch').addEventListener('click', async () => {
    const city = document.getElementById('cwCity').value.trim();
    if (!city) { alert('Enter a city'); return; }
    const sel = document.getElementById('cwCat');
    const cats = Array.from(sel.selectedOptions).map(o => o.value);
    if (cats.length === 0) { alert('Select at least one category'); return; }
    cityWatches.push({city, categories: cats, enabled: true});
    const s = Object.assign({}, SETTINGS, {cityWatches});
    await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(s)});
    location.reload();
  });

  document.getElementById('sMethod').addEventListener('change', function() {
    document.getElementById('ntfySettings').classList.toggle('hidden', this.value==='sms');
    document.getElementById('smsSettings').classList.toggle('hidden', this.value==='ntfy');
  });
  document.getElementById('saveSettings').addEventListener('click', async () => {
    const method = document.getElementById('sMethod').value;
    const s = {alertMethod:method, ntfyTopic:document.getElementById('sNtfy').value.trim(), smsGatewayEmail:document.getElementById('sSms').value.trim()||undefined, cityWatches, scrapeIntervalMinutes:parseInt(document.getElementById('sScrapeInterval').value)};
    await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(s)});
    alert('Settings saved!');
  });
  document.getElementById('manualCheck').addEventListener('click', async () => {
    const btn = document.getElementById('manualCheck');
    const status = document.getElementById('checkStatus');
    btn.disabled = true;
    btn.textContent = 'Starting scraper...';
    try {
      const res = await fetch('/api/scrape',{method:'POST'});
      const data = await res.json();
      if (data.ok) {
        btn.textContent = 'Scraper running...';
        let sec = 60;
        status.textContent = 'Refreshing in '+sec+'s';
        const timer = setInterval(() => {
          sec--;
          status.textContent = 'Refreshing in '+sec+'s';
          if (sec <= 0) { clearInterval(timer); location.reload(); }
        }, 1000);
      } else {
        btn.textContent = '\\u{1F33C} Scrape All Prices';
        status.textContent = 'Failed — is GitHub PAT configured?';
        btn.disabled = false;
      }
    } catch(e) {
      btn.textContent = '\\u{1F33C} Scrape All Prices';
      status.textContent = 'Error';
      btn.disabled = false;
    }
  });
}

// =============== UTILS ===============
function showModal(title, content, isHtml) {
  const existing = document.querySelector('.modal-bg');
  if (existing) existing.remove();
  const modal = document.createElement('div');
  modal.className = 'modal-bg';
  const body = isHtml ? content : '<p>'+content.replace(/\\n/g,'<br>')+'</p>';
  modal.innerHTML = '<div class="modal"><button class="close-btn">&times;</button><h3>'+title+'</h3>'+body+'</div>';
  modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
  modal.querySelector('.close-btn').addEventListener('click', () => modal.remove());
  document.body.appendChild(modal);
}

function slugify(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').substring(0,60); }
function timeAgo(d) {
  const s = Math.floor((Date.now()-d.getTime())/1000);
  if (s<60) return s+'s ago'; if (s<3600) return Math.floor(s/60)+'m ago';
  if (s<86400) return Math.floor(s/3600)+'h ago'; return Math.floor(s/86400)+'d ago';
}

init();
setTimeout(()=>location.reload(), 5*60*1000);
</script>
</body>
</html>`;
}
