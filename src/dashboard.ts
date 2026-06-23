import { Env, PriceSnapshot } from "./types";
import { FIFA_DISCOUNT_FACTOR, FIFA_TICKETS_URL } from "./config";
import { getWatches, getLatestPrice, getLastCheck, getPriceHistory, getSettings } from "./storage";

const SOURCES = ["ticketmaster", "seatgeek"];

export async function renderDashboard(env: Env): Promise<Response> {
  const watches = await getWatches(env);
  const settings = await getSettings(env);

  const watchData = await Promise.all(
    watches.map(async (match) => {
      const sources: Record<string, { latest: PriceSnapshot | null; lastCheck: string | null; history: PriceSnapshot[] }> = {};
      await Promise.all(
        SOURCES.map(async (source) => {
          const [latest, lastCheck, history] = await Promise.all([
            getLatestPrice(env, match.slug, source),
            getLastCheck(env, match.slug, source),
            getPriceHistory(env, match.slug, source),
          ]);
          sources[source] = { latest, lastCheck, history };
        })
      );
      return { ...match, sources };
    })
  );

  return new Response(buildHtml(watchData, settings), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

export async function handleApiPrices(env: Env, matchSlug: string): Promise<Response> {
  const result: Record<string, PriceSnapshot[]> = {};
  await Promise.all(
    SOURCES.map(async (source) => {
      result[source] = await getPriceHistory(env, matchSlug, source);
    })
  );
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
  <title>FIFA Ticket Tracker</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3"></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0f1117;color:#e4e4e7;padding:16px;max-width:960px;margin:0 auto}
    h1{font-size:1.5rem;color:#fff;margin-bottom:4px}
    h2{font-size:1.1rem;color:#fff;margin:20px 0 10px}
    .subtitle{color:#71717a;font-size:.82rem;margin-bottom:16px}
    .tabs{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap}
    .tab{padding:7px 14px;border-radius:8px;border:1px solid #27272a;background:#18181b;color:#a1a1aa;cursor:pointer;font-size:.82rem;transition:all .15s}
    .tab:hover{border-color:#3f3f46}
    .tab.active{background:#22c55e20;border-color:#22c55e;color:#22c55e}
    .tab.settings-tab{margin-left:auto}
    .tab.settings-tab.active{background:#3b82f620;border-color:#3b82f6;color:#3b82f6}
    .cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin-bottom:16px}
    .card{background:#18181b;border:1px solid #27272a;border-radius:12px;padding:14px}
    .card-label{font-size:.72rem;color:#71717a;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px}
    .card-value{font-size:1.7rem;font-weight:700;color:#fff}
    .card-value.green{color:#22c55e}.card-value.yellow{color:#f59e0b}.card-value.red{color:#ef4444}.card-value.na{color:#3f3f46;font-size:1.1rem}
    .card-sub{font-size:.72rem;color:#71717a;margin-top:3px}
    .chart-box{background:#18181b;border:1px solid #27272a;border-radius:12px;padding:14px;margin-bottom:16px}
    canvas{max-height:320px}
    a{color:#3b82f6;text-decoration:none}a:hover{text-decoration:underline}
    .fifa-card{background:linear-gradient(135deg,#1a1a2e,#16213e);border:1px solid #f59e0b40;border-radius:12px;padding:14px;margin-bottom:14px}
    .fifa-hdr{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}
    .fifa-lbl{font-size:.72rem;color:#f59e0b;text-transform:uppercase;letter-spacing:.05em;font-weight:600}
    .fifa-btn{padding:6px 14px;background:#f59e0b;color:#000;border-radius:6px;font-size:.8rem;font-weight:600;text-decoration:none;display:inline-block}
    .fifa-btn:hover{background:#fbbf24;text-decoration:none}
    .fifa-est{font-size:1.3rem;font-weight:700;color:#fbbf24}
    .fifa-note{font-size:.72rem;color:#71717a;margin-top:3px}
    .links{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
    .link-btn{padding:6px 12px;border-radius:8px;border:1px solid #27272a;background:#18181b;color:#e4e4e7;font-size:.8rem;text-decoration:none;transition:all .15s}
    .link-btn:hover{border-color:#3b82f6;color:#3b82f6;text-decoration:none}
    .links-label{font-size:.68rem;color:#71717a;text-transform:uppercase;letter-spacing:.05em;margin-bottom:5px}
    .info-row{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:10px}
    .info-detail{font-size:.78rem;color:#71717a}
    .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.68rem;font-weight:600}
    .badge-on{background:#22c55e20;color:#22c55e}.badge-off{background:#3b82f620;color:#3b82f6}
    .panel{background:#18181b;border:1px solid #27272a;border-radius:12px;padding:16px;margin-bottom:16px}
    input,select{background:#27272a;border:1px solid #3f3f46;color:#e4e4e7;border-radius:6px;padding:8px 10px;font-size:.85rem;width:100%}
    input:focus,select:focus{outline:none;border-color:#3b82f6}
    .btn{padding:8px 16px;border-radius:8px;border:none;font-size:.85rem;font-weight:600;cursor:pointer;transition:all .15s}
    .btn-primary{background:#3b82f6;color:#fff}.btn-primary:hover{background:#2563eb}
    .btn-danger{background:#ef444420;color:#ef4444;border:1px solid #ef444440}.btn-danger:hover{background:#ef444440}
    .btn-success{background:#22c55e;color:#000}.btn-success:hover{background:#16a34a}
    .btn-sm{padding:5px 10px;font-size:.75rem}
    .form-row{display:flex;gap:8px;align-items:end;margin-bottom:10px}
    .form-group{flex:1}
    .form-group label{display:block;font-size:.72rem;color:#71717a;margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em}
    .search-results{max-height:350px;overflow-y:auto;margin-top:10px}
    .search-item{display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid #27272a;border-radius:8px;margin-bottom:6px;background:#0f1117}
    .search-item:hover{border-color:#3f3f46}
    .si-info{flex:1}
    .si-name{font-size:.85rem;color:#fff;font-weight:500}
    .si-detail{font-size:.72rem;color:#71717a;margin-top:2px}
    .si-price{font-size:.9rem;font-weight:600;color:#22c55e;margin-right:10px}
    .empty{text-align:center;color:#3f3f46;padding:40px;font-size:.9rem}
    .footer{text-align:center;font-size:.68rem;color:#3f3f46;margin-top:24px}
    .watch-item{display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid #27272a;border-radius:8px;margin-bottom:6px;background:#0f1117}
    .watch-controls{display:flex;gap:6px;align-items:center}
    .hidden{display:none}
  </style>
</head>
<body>
  <h1>FIFA Ticket Tracker</h1>
  <p class="subtitle">Auto-checks prices every 5 min &middot; Alerts via ntfy</p>

  <div class="tabs" id="tabs"></div>
  <div id="view"></div>

  <div class="footer">
    Data from Ticketmaster Discovery API &amp; SeatGeek &middot; Not affiliated with FIFA
  </div>

<script>
const WATCHES = ${JSON.stringify(watchData)};
const SETTINGS = ${JSON.stringify(settings)};
const FIFA_DISCOUNT = ${FIFA_DISCOUNT_FACTOR};
const FIFA_URL = '${FIFA_TICKETS_URL}';
let activeView = WATCHES.length > 0 ? WATCHES[0].slug : '_add';
let chart = null;

function init() {
  renderTabs();
  showView(activeView);
}

function renderTabs() {
  const c = document.getElementById('tabs');
  let html = '';
  WATCHES.forEach(w => {
    html += '<button class="tab'+(w.slug===activeView?' active':'')+'" data-view="'+w.slug+'">'+w.name+'</button>';
  });
  html += '<button class="tab'+(activeView==='_add'?' active':'')+'" data-view="_add">+ Add Match</button>';
  html += '<button class="tab'+(activeView==='_events'?' active':'')+'" data-view="_events">Local Events</button>';
  html += '<button class="tab settings-tab'+(activeView==='_settings'?' active':'')+'" data-view="_settings">Settings</button>';
  c.innerHTML = html;
  c.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => {
    activeView = t.dataset.view;
    renderTabs();
    showView(activeView);
  }));
}

function showView(view) {
  const v = document.getElementById('view');
  if (view === '_add') { renderAddView(v); return; }
  if (view === '_events') { renderEventsView(v); return; }
  if (view === '_settings') { renderSettingsView(v); return; }
  const match = WATCHES.find(w => w.slug === view);
  if (match) renderMatchView(v, match);
  else v.innerHTML = '<div class="empty">Select a match or add one</div>';
}

// =============== MATCH VIEW ===============
function renderMatchView(container, match) {
  const d = new Date(match.date);
  const dateStr = d.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const daysLeft = Math.max(0, Math.ceil((d - Date.now()) / 86400000));
  const badge = match.alertsEnabled
    ? '<span class="badge badge-on">ALERTS ON &le;$'+match.maxPrice+'</span>'
    : '<span class="badge badge-off">TRACKING ONLY</span>';

  // FIFA estimate
  let lowestPrice = null;
  for (const src of Object.values(match.sources)) {
    if (src.latest && src.latest.minPrice !== null) {
      if (lowestPrice === null || src.latest.minPrice < lowestPrice) lowestPrice = src.latest.minPrice;
    }
  }

  let fifaHtml = '';
  if (lowestPrice !== null) {
    const est = Math.round(lowestPrice * FIFA_DISCOUNT);
    const hot = est <= match.maxPrice;
    fifaHtml = '<div class="fifa-card"><div class="fifa-hdr">'+
      '<span class="fifa-lbl">FIFA Resale Estimate</span>'+
      '<a href="'+FIFA_URL+'" target="_blank" class="fifa-btn">'+(hot?'CHECK FIFA NOW!':'Check FIFA')+'</a>'+
      '</div><div class="fifa-est">~$'+est+'</div>'+
      '<div class="fifa-note">Based on lowest tracked ($'+lowestPrice+') &times; 20-25% FIFA discount'+
      (hot?' &mdash; <strong style="color:#22c55e">likely at/below your $'+match.maxPrice+' target!</strong>':'')+
      '</div></div>';
  } else {
    fifaHtml = '<div class="fifa-card"><div class="fifa-hdr">'+
      '<span class="fifa-lbl">FIFA Resale Estimate</span>'+
      '<a href="'+FIFA_URL+'" target="_blank" class="fifa-btn">Check FIFA</a>'+
      '</div><div class="fifa-note">No data yet — FIFA resale typically 20-25% below third-party prices</div></div>';
  }

  // Quick links
  let linksHtml = '';
  if (match.links && match.links.length > 0) {
    linksHtml = '<div class="links-label">Check prices on</div><div class="links">'+
      match.links.map(l => '<a href="'+l.url+'" target="_blank" class="link-btn">'+l.label+'</a>').join('')+
      '</div>';
  }

  // Source cards
  let cardsHtml = '';
  for (const [source, data] of Object.entries(match.sources)) {
    const label = source.charAt(0).toUpperCase() + source.slice(1);
    const latest = data.latest;
    let cls = 'na', val = 'No data', sub = '';
    if (latest && latest.minPrice !== null) {
      const p = latest.minPrice;
      cls = p <= match.maxPrice * 0.85 ? 'green' : p <= match.maxPrice ? 'yellow' : 'red';
      val = '$' + p;
      if (latest.maxPrice && latest.maxPrice !== latest.minPrice) sub = 'Range: $'+latest.minPrice+' – $'+latest.maxPrice;
    }
    const chk = data.lastCheck ? timeAgo(new Date(data.lastCheck)) : 'never';
    const link = latest && latest.url ? ' &middot; <a href="'+latest.url+'" target="_blank">Buy</a>' : '';
    cardsHtml += '<div class="card"><div class="card-label">'+label+'</div>'+
      '<div class="card-value '+cls+'">'+val+'</div>'+
      (sub?'<div class="card-sub">'+sub+'</div>':'')+
      '<div class="card-sub">Checked '+chk+link+'</div></div>';
  }

  container.innerHTML =
    '<div class="info-row"><span class="info-detail">'+match.venue+' &middot; '+dateStr+' &middot; '+daysLeft+' days &middot; Want '+match.ticketsWanted+' tix</span>'+badge+'</div>'+
    fifaHtml + linksHtml +
    '<div class="cards">'+cardsHtml+'</div>'+
    '<div class="chart-box"><canvas id="priceChart"></canvas></div>'+
    '<div class="panel" style="margin-top:12px">'+
      '<div class="form-row">'+
        '<div class="form-group"><label>Max Price ($)</label>'+
          '<input type="number" id="editPrice" value="'+match.maxPrice+'" min="1"></div>'+
        '<div class="form-group"><label>Tickets Wanted</label>'+
          '<input type="number" id="editQty" value="'+match.ticketsWanted+'" min="1" max="10"></div>'+
        '<div class="form-group"><label>Alerts</label>'+
          '<select id="editAlerts">'+
            '<option value="true"'+(match.alertsEnabled?' selected':'')+'>On</option>'+
            '<option value="false"'+(!match.alertsEnabled?' selected':'')+'>Off</option>'+
          '</select></div>'+
        '<div><button class="btn btn-primary btn-sm" id="saveMatchBtn">Save</button></div>'+
      '</div>'+
    '</div>'+
    '<div style="margin-top:8px"><button class="btn btn-danger btn-sm" id="removeBtn">Remove this match</button></div>';

  renderChart(match);

  document.getElementById('saveMatchBtn').addEventListener('click', async () => {
    const updated = Object.assign({}, match);
    delete updated.sources;
    updated.maxPrice = parseInt(document.getElementById('editPrice').value) || 400;
    updated.ticketsWanted = parseInt(document.getElementById('editQty').value) || 2;
    updated.alertsEnabled = document.getElementById('editAlerts').value === 'true';
    await fetch('/api/watches', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(updated)});
    location.reload();
  });

  document.getElementById('removeBtn').addEventListener('click', async () => {
    if (!confirm('Remove '+match.name+' from tracking?')) return;
    await fetch('/api/watches/'+match.slug, {method:'DELETE'});
    location.reload();
  });
}

function renderChart(match) {
  const ctx = document.getElementById('priceChart').getContext('2d');
  if (chart) chart.destroy();
  const datasets = [];
  const colors = {ticketmaster:'#3b82f6',seatgeek:'#22c55e'};
  for (const [source, data] of Object.entries(match.sources)) {
    if (data.history.length === 0) continue;
    datasets.push({
      label: source.charAt(0).toUpperCase()+source.slice(1),
      data: data.history.filter(h=>h.minPrice!==null).map(h=>({x:h.timestamp,y:h.minPrice})),
      borderColor: colors[source]||'#a78bfa',
      backgroundColor: (colors[source]||'#a78bfa')+'20',
      borderWidth:2, pointRadius:1.5, tension:0.3, fill:true,
    });
  }
  if (match.alertsEnabled && datasets.length > 0) {
    datasets.push({
      label:'Target ($'+match.maxPrice+')',
      data:[{x:datasets[0].data[0]?.x||Date.now(),y:match.maxPrice},{x:Date.now(),y:match.maxPrice}],
      borderColor:'#f59e0b',borderWidth:1,borderDash:[6,4],pointRadius:0,fill:false,
    });
  }
  chart = new Chart(ctx,{
    type:'line', data:{datasets},
    options:{
      responsive:true, interaction:{mode:'index',intersect:false},
      scales:{
        x:{type:'time',time:{tooltipFormat:'MMM d, h:mm a'},grid:{color:'#27272a'},ticks:{color:'#71717a'}},
        y:{beginAtZero:false,grid:{color:'#27272a'},ticks:{color:'#71717a',callback:v=>'$'+v}},
      },
      plugins:{
        legend:{labels:{color:'#a1a1aa'}},
        tooltip:{callbacks:{label:ctx=>ctx.dataset.label+': $'+ctx.parsed.y}},
      },
    },
  });
}

// =============== ADD MATCH VIEW ===============
function renderAddView(container) {
  container.innerHTML =
    '<h2>Add a Match to Track</h2>'+
    '<div class="panel">'+
      '<div class="form-row">'+
        '<div class="form-group" style="flex:3"><label>Search</label>'+
          '<input type="text" id="searchInput" placeholder="e.g. World Cup Match, Egypt vs Iran" value="World Cup Match"></div>'+
        '<div class="form-group" style="flex:1"><label>City (optional)</label>'+
          '<input type="text" id="searchCity" placeholder="e.g. Seattle, Houston"></div>'+
        '<div><button class="btn btn-primary" id="searchBtn">Search</button></div>'+
      '</div>'+
      '<div id="searchResults"></div>'+
    '</div>'+
    '<h2>Or Add Manually</h2>'+
    '<div class="panel" id="manualForm">'+
      '<div class="form-row">'+
        '<div class="form-group"><label>Match Name</label><input type="text" id="mName" placeholder="Egypt vs Iran"></div>'+
        '<div class="form-group"><label>Date &amp; Time</label><input type="datetime-local" id="mDate"></div>'+
      '</div>'+
      '<div class="form-row">'+
        '<div class="form-group"><label>Venue</label><input type="text" id="mVenue" placeholder="Lumen Field, Seattle"></div>'+
        '<div class="form-group"><label>Ticketmaster Event ID</label><input type="text" id="mTmId" placeholder="Z7r9jZ1A7434A (optional)"></div>'+
      '</div>'+
      '<div class="form-row">'+
        '<div class="form-group"><label>SeatGeek Event Slug</label><input type="text" id="mSgSlug" placeholder="fifa-world-cup-egypt-vs-iran (optional)"></div>'+
        '<div class="form-group"><label>Tickets Wanted</label><input type="number" id="mQty" value="2" min="1" max="10"></div>'+
      '</div>'+
      '<div class="form-row">'+
        '<div class="form-group"><label>Max Price ($)</label><input type="number" id="mPrice" value="400" min="1"></div>'+
        '<div class="form-group"><label>Alerts</label><select id="mAlerts"><option value="true">On</option><option value="false">Off (track only)</option></select></div>'+
      '</div>'+
      '<button class="btn btn-success" id="manualAddBtn" style="margin-top:8px">Add Match</button>'+
    '</div>';

  document.getElementById('searchBtn').addEventListener('click', doSearch);
  document.getElementById('searchInput').addEventListener('keydown', e => { if (e.key==='Enter') doSearch(); });
  document.getElementById('manualAddBtn').addEventListener('click', doManualAdd);
}

async function doSearch() {
  const q = document.getElementById('searchInput').value.trim();
  const city = document.getElementById('searchCity').value.trim();
  const box = document.getElementById('searchResults');
  if (!q) return;
  box.innerHTML = '<div class="empty">Searching...</div>';
  try {
    let searchUrl = '/api/search?q='+encodeURIComponent(q);
    if (city) searchUrl += '&city='+encodeURIComponent(city);
    const res = await fetch(searchUrl);
    const data = await res.json();
    if (!data.results || data.results.length === 0) {
      box.innerHTML = '<div class="empty">No results found. Try a different search or add manually below.</div>';
      return;
    }
    box.innerHTML = '<div class="search-results">'+data.results.map(r => {
      const d = r.date ? new Date(r.date).toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '';
      const price = r.minPrice ? '$'+r.minPrice+(r.maxPrice&&r.maxPrice!==r.minPrice?' – $'+r.maxPrice:'') : '';
      return '<div class="search-item"><div class="si-info"><div class="si-name">'+r.name+'</div>'+
        '<div class="si-detail">'+r.venue+(d?' &middot; '+d:'')+'</div></div>'+
        (price?'<div class="si-price">'+price+'</div>':'')+
        '<button class="btn btn-success btn-sm" data-event="'+JSON.stringify(r).replace(/"/g,"&quot;")+'">Track</button></div>';
    }).join('')+'</div>';
    box.querySelectorAll('button[data-event]').forEach(btn => {
      btn.addEventListener('click', () => trackFromSearch(JSON.parse(btn.dataset.event)));
    });
  } catch(e) {
    box.innerHTML = '<div class="empty">Search failed — is Ticketmaster API key configured?</div>';
  }
}

async function trackFromSearch(event) {
  const slug = slugify(event.name);
  const watch = {
    slug,
    name: event.name,
    date: event.date || new Date().toISOString(),
    venue: event.venue || '',
    ticketmasterEventId: event.eventId,
    seatgeekEventSlug: '',
    ticketsWanted: 2,
    maxPrice: 400,
    alertsEnabled: true,
    links: [
      {label:'FIFA Tickets', url:'${FIFA_TICKETS_URL}'},
      {label:'Ticketmaster', url: event.url || 'https://www.ticketmaster.com/event/'+event.eventId},
    ],
  };
  const ok = prompt('Set max price alert ($/ticket):', '400');
  if (ok === null) return;
  watch.maxPrice = parseInt(ok) || 400;
  await fetch('/api/watches', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(watch)});
  location.reload();
}

async function doManualAdd() {
  const name = document.getElementById('mName').value.trim();
  if (!name) { alert('Match name is required'); return; }
  const watch = {
    slug: slugify(name),
    name,
    date: document.getElementById('mDate').value ? new Date(document.getElementById('mDate').value).toISOString() : new Date().toISOString(),
    venue: document.getElementById('mVenue').value.trim(),
    ticketmasterEventId: document.getElementById('mTmId').value.trim() || undefined,
    seatgeekEventSlug: document.getElementById('mSgSlug').value.trim() || undefined,
    ticketsWanted: parseInt(document.getElementById('mQty').value) || 2,
    maxPrice: parseInt(document.getElementById('mPrice').value) || 400,
    alertsEnabled: document.getElementById('mAlerts').value === 'true',
    links: [],
  };
  await fetch('/api/watches', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(watch)});
  location.reload();
}

// =============== LOCAL EVENTS VIEW ===============
const HOST_CITIES = {
  Seattle: {
    site: 'https://www.seattlefwc26.org/events/event-calendar',
    events: [
      {name:'World Soccer Fan Celebration',venue:'Seattle Center, 305 Harrison St',dates:'Jun 11 – Jul 19',desc:'Large screens, DJ sets, and campus-wide activations. Free for all six Seattle home matches.',tags:['Watch Party','Free','Family-Friendly'],url:'https://www.seattlefwc26.org/events/seattle-fan-celebrations'},
      {name:'Seattle Soccer House',venue:'Pacific Place, 600 Pine St',dates:'Jun 15 – Jul 2',desc:'4-story interior LED screen, interactive activations, and daily programming. Free access.',tags:['Watch Party','Free','Indoor'],url:'https://www.seattlefwc26.org/events/seattle-fan-celebrations'},
      {name:'Soccer Celebration at the Waterfront',venue:'Waterfront Park, Pier 62',dates:'Match days',desc:'Hosted by Sounders FC, Reign FC & RAVE Foundation. Floating mini pitch, watch parties, music, food.',tags:['Watch Party','Free','Outdoor'],url:'https://www.seattlefwc26.org/events/seattle-fan-celebrations'},
      {name:'Match Day Live',venue:'Victory Hall, 1201 1st Ave S (SODO)',dates:'Match days',desc:'Hosted by Seattle Mariners. Watch matches on a 23-foot screen.',tags:['Watch Party','Free'],url:'https://www.seattlefwc26.org/events/seattle-fan-celebrations'},
      {name:'Global DJ Program',venue:'Seattle Center',dates:'Jun 11 – Jul 6',desc:'Local talent and global sounds activating public spaces.',tags:['Free','Outdoor','Music'],url:'https://www.seattlefwc26.org/events/event-calendar'},
      {name:'Global Marketplace',venue:'Seattle Center',dates:'Jun 14 – Jul 10',desc:'Support local businesses and community entrepreneurs.',tags:['Free','Family-Friendly'],url:'https://www.seattlefwc26.org/events/event-calendar'},
      {name:'The Beautiful Game Exhibition',venue:'MOHAI, 860 Terry Ave N',dates:'May 23 – Sep 7',desc:'Museum exhibit exploring how soccer unites people globally.',tags:['Paid','Indoor','Family-Friendly'],url:'https://www.seattlefwc26.org/events/event-calendar'},
      {name:'Sculpture Walk',venue:'Seattle Center',dates:'Jun 1 – Nov 1',desc:'Temporary art and cultural installations celebrating the tournament.',tags:['Free','Outdoor','Art'],url:'https://www.seattlefwc26.org/events/event-calendar'},
      {name:'Summer Fitness & Activities',venue:'Seattle Center',dates:'Jun 17 – Aug 26',desc:'Movement and fitness programming during the tournament.',tags:['Free','Outdoor','Family-Friendly'],url:'https://www.seattlefwc26.org/events/event-calendar'},
    ],
  },
  'Los Angeles': {site:'https://losangelesfwc26.com/',eventsUrl:'https://losangelesfwc26.com/',events:[
    {name:'FIFA Fan Festival LA',venue:'LA Coliseum area',dates:'Tournament duration',desc:'Official FIFA Fan Festival with live screenings, music, and entertainment.',tags:['Fan Festival','Free'],url:'https://losangelesfwc26.com/'},
  ]},
  'New York / NJ': {site:'https://nynjfwc26.com/',eventsUrl:'https://nynjfwc26.com/',events:[
    {name:'Jersey Fan Hub',venue:'Jersey City, NJ',dates:'Tournament duration',desc:'Official NYNJ World Cup fan hub.',tags:['Fan Zone','Free'],url:'https://nynjfwc26.com/'},
    {name:'Queens Group Stage HQ',venue:'Queens, NY',dates:'Group stage',desc:'Group stage fan headquarters in Queens.',tags:['Fan Zone','Free'],url:'https://nynjfwc26.com/'},
    {name:'Fan Village Rockefeller Center',venue:'Rockefeller Center, Manhattan',dates:'Tournament duration',desc:'Fan village at the iconic Rockefeller Center.',tags:['Fan Zone','Free'],url:'https://nynjfwc26.com/'},
    {name:'Staten Island Fan Zone',venue:'Staten Island, NY',dates:'Tournament duration',desc:'Fan zone on Staten Island.',tags:['Fan Zone','Free'],url:'https://nynjfwc26.com/'},
    {name:'Bronx Fan Zone',venue:'Bronx, NY',dates:'Tournament duration',desc:'Fan zone in the Bronx.',tags:['Fan Zone','Free'],url:'https://nynjfwc26.com/'},
    {name:'Brooklyn Fan Zone',venue:'Brooklyn, NY',dates:'Tournament duration',desc:'Fan zone in Brooklyn.',tags:['Fan Zone','Free'],url:'https://nynjfwc26.com/'},
  ]},
  Boston: {site:'https://bostonfwc26.com/',eventsUrl:'https://bostonfwc26.com/',events:[
    {name:'FIFA Fan Festival',venue:'Boston City Hall Plaza',dates:'16 days during tournament',desc:'Vibrant fan hub with celebration activities. Free and open to the public.',tags:['Fan Festival','Free'],url:'https://bostonfwc26.com/'},
    {name:'FIFA Stadium Express Bus',venue:'From Providence & regional locations',dates:'Match days',desc:'Direct bus service to Boston Stadium for matchday attendance.',tags:['Transport','Paid'],url:'https://bostonfwc26.com/'},
  ]},
  Dallas: {site:'https://www.dallasfwc26.com/',eventsUrl:'https://www.dallasfwc26.com/fifafanfestival-dallas/',events:[
    {name:'FIFA Fan Festival Dallas',venue:'Fair Park, Dallas',dates:'34 days, free admission',desc:'35,000 capacity. Live match broadcasts, two stages, food from local and international vendors, interactive experiences. Free general admission.',tags:['Fan Festival','Free','Family-Friendly'],url:'https://www.dallasfwc26.com/fifafanfestival-dallas/'},
    {name:'Latin Legacy Tour Concert',venue:'Fair Park (Fan Festival), Dallas',dates:'Jun 28',desc:'Baby Bash, Lil Rob, MC Magic, Concrete. Tickets from $26.',tags:['Concert','Paid','Music'],url:'https://www.dallasfwc26.com/fifafanfestival-dallas/'},
    {name:'Turnpike Troubadours Concert',venue:'Fair Park (Fan Festival), Dallas',dates:'Jul 4',desc:'Country/roots July 4th celebration. Tickets from $26.',tags:['Concert','Paid','Music'],url:'https://www.dallasfwc26.com/fifafanfestival-dallas/'},
    {name:'Major Lazer Concert',venue:'Fair Park (Fan Festival), Dallas',dates:'Jul 9',desc:'Diplo, Walshy Fire, Ape Drums. Electronic/dancehall. Tickets from $26.',tags:['Concert','Paid','Music'],url:'https://www.dallasfwc26.com/fifafanfestival-dallas/'},
    {name:'Croatian-American Friendship Parade',venue:'Choctaw Stadium & Ferris Plaza, Dallas',dates:'Jun 16, 7:15 PM CT',desc:'Parade with equestrian drill team, flags, traditional Croatian attire. Live music, food, drinks.',tags:['Cultural','Free','Family-Friendly'],url:'https://www.dallasfwc26.com/our-venues/match-schedule/'},
    {name:'Argentina Banderazo',venue:'Klyde Warren Park, Dallas',dates:'Jun 21, 5:00 PM & Jun 26, 6:00 PM CT',desc:'Traditional Argentine celebration with flags, songs, live drumming, and dancing.',tags:['Cultural','Free','Outdoor'],url:'https://www.dallasfwc26.com/our-venues/match-schedule/'},
  ]},
  Atlanta: {site:'https://atlantafwc26.com/',eventsUrl:'https://atlantafwc26.com/',events:[]},
  'SF Bay Area': {site:'https://bayareafwc26.com/',eventsUrl:'https://bayareafwc26.com/',events:[]},
  Houston: {site:'https://www.fwc26houston.com/',eventsUrl:'https://www.fwc26houston.com/fanfestival',events:[
    {name:'FIFA Fan Festival Houston',venue:'East Downtown Houston',dates:'Jun 11 – Jul 19 (every match day)',desc:'Free to public, no ticket needed. Live match viewing on giant screens, performances, and activities. Opens 90 min before first match daily.',tags:['Fan Festival','Free','Outdoor'],url:'https://www.fwc26houston.com/fanfestival'},
    {name:'Aramco Arena',venue:'East Downtown Houston (at Fan Festival)',dates:'Jun 11 – Jul 19',desc:'7v7 soccer field with 45-foot video display for match viewing, soccer simulator, and misting stations.',tags:['Free','Interactive','Outdoor'],url:'https://www.fwc26houston.com/fanfestival'},
    {name:'Esphera Projection Dome',venue:'East Downtown Houston (at Fan Festival)',dates:'Jun 11 – Jul 19',desc:'360-degree immersive experience from Space Center Houston.',tags:['Free','Indoor','Interactive'],url:'https://www.fwc26houston.com/fanfestival'},
    {name:'Houston Hall',venue:'East Downtown Houston (at Fan Festival)',dates:'Jun 11 – Jul 19',desc:'Climate-controlled venue with interactive attractions and food/beverage.',tags:['Free','Indoor','Family-Friendly'],url:'https://www.fwc26houston.com/fanfestival'},
    {name:'Road to the Cup Youth Tournament',venue:'Aramco Arena, East Downtown',dates:'During tournament',desc:'U11-U18/19 boys and girls 7v7 youth tournament.',tags:['Free','Youth','Outdoor'],url:'https://www.fwc26houston.com/fanfestival'},
  ]},
  'Kansas City': {site:'https://www.kansascityfwc26.com/',eventsUrl:'https://www.kansascityfwc26.com/',events:[
    {name:'FIFA Fan Festival Kansas City',venue:'Kansas City',dates:'Jun – Jul 2026',desc:'Thousands of fans cheering for their nations. Global headliners, local performers, live match screenings, and entertainment in the Heart of America.',tags:['Fan Festival','Free'],url:'https://www.kansascityfwc26.com/'},
    {name:'ConnectKC26 Motorcoach Service',venue:'Airport & stadium routes',dates:'Match days',desc:'Bus service connecting airport and stadium for matchday travel.',tags:['Transport','Paid'],url:'https://www.kansascityfwc26.com/'},
  ]},
  Miami: {site:'https://miamifwc26.com/',eventsUrl:'https://miamifwc26.com/fan-festival/',events:[
    {name:'FIFA Fan Festival Miami',venue:'Bayfront Park, Downtown Miami',dates:'Jun 13 – Jul 5',desc:'Free admission. Live match broadcasts, entertainment stages with DJs and concerts, cultural performances, interactive soccer experiences, diverse food vendors. Opens 60 min before first match.',tags:['Fan Festival','Free','Family-Friendly'],url:'https://miamifwc26.com/fan-festival/'},
  ]},
  Philadelphia: {site:'https://www.phillyfwc26.com/',eventsUrl:'https://www.phillyfwc26.com/',events:[]},
  Vancouver: {site:'https://vancouverfwc26.ca/',eventsUrl:'https://vancouverfwc26.ca/fifa-fan-festival',events:[
    {name:'FIFA Fan Festival Vancouver',venue:'PNE Grounds at Hastings Park',dates:'Jun 11 – Jul 19',desc:'Free general admission. New 10,000-capacity Amphitheatre, live match broadcasts, music from Canadian and global artists, food vendors, family activities, interactive zones.',tags:['Fan Festival','Free','Music','Family-Friendly'],url:'https://vancouverfwc26.ca/fifa-fan-festival'},
  ]},
  Toronto: {site:'https://torontofwc26.ca/',eventsUrl:'https://torontofwc26.ca/',events:[
    {name:'FIFA Fan Festival Toronto',venue:'Fort York, Toronto',dates:'Jun 11 – Jul 19',desc:'Open-air fan experience with cultural attractions, entertainment, and live match screenings. Features Tkaronto Market — Indigenous entrepreneur marketplace.',tags:['Fan Festival','Free','Cultural'],url:'https://torontofwc26.ca/'},
  ]},
  'Mexico City': {site:'https://www.mexicocityfwc26.com.mx/',eventsUrl:'https://www.mexicocityfwc26.com.mx/',events:[
    {name:'FIFA Fan Festival Mexico City',venue:'Zocalo, Mexico City',dates:'Tournament duration',desc:'Official fan festival at the iconic Zocalo plaza.',tags:['Fan Festival','Free'],url:'https://www.mexicocityfwc26.com.mx/'},
  ]},
  Guadalajara: {site:'https://guadalajarafwc26.com/',eventsUrl:'https://guadalajarafwc26.com/',events:[
    {name:'FIFA Fan Festival Guadalajara',venue:'Plaza Liberacion, Guadalajara',dates:'39 days during tournament',desc:'Cultural, tourism, and fan experiences. Guadalajara becomes a meeting point for fans worldwide.',tags:['Fan Festival','Free'],url:'https://guadalajarafwc26.com/'},
  ]},
  Monterrey: {site:'https://www.fwc26monterrey.com/',eventsUrl:'https://www.fwc26monterrey.com/',events:[
    {name:'FIFA Fan Festival Monterrey',venue:'Parque Fundidora, Monterrey',dates:'Tournament duration',desc:'Official fan festival at the historic Parque Fundidora.',tags:['Fan Festival','Free'],url:'https://www.fwc26monterrey.com/'},
  ]},
};

function renderEventsView(container) {
  const cityNames = Object.keys(HOST_CITIES);
  const cityOptions = cityNames.map(c =>
    '<option value="'+c+'"'+(c==='Seattle'?' selected':'')+'>'+c+'</option>'
  ).join('');

  container.innerHTML =
    '<h2>Local Events &amp; Fan Celebrations</h2>'+
    '<div class="panel">'+
      '<div class="form-row">'+
        '<div class="form-group"><label>Host City</label>'+
          '<select id="evCity">'+cityOptions+'</select></div>'+
      '</div>'+
    '</div>'+
    '<div id="evContent"></div>';

  document.getElementById('evCity').addEventListener('change', function() {
    renderCityEvents(this.value);
  });
  renderCityEvents('Seattle');
}

function renderCityEvents(cityName) {
  const box = document.getElementById('evContent');
  const city = HOST_CITIES[cityName];
  if (!city) { box.innerHTML = ''; return; }

  let html = '';

  const evUrl = city.eventsUrl || city.site;
  if (city.events.length > 0) {
    html += '<div class="card-sub" style="margin-bottom:10px">Source: <a href="'+city.site+'" target="_blank">'+cityName+' FWC26 Official Site</a></div>';
    html += '<div class="search-results" style="max-height:none">';
    city.events.forEach(ev => {
      html += '<div class="search-item" style="flex-direction:column;align-items:stretch">'+
        '<div style="display:flex;justify-content:space-between;align-items:start">'+
          '<div class="si-info"><div class="si-name">'+ev.name+'</div>'+
            '<div class="si-detail">'+ev.venue+' &middot; '+ev.dates+'</div>'+
          '</div>'+
          '<a href="'+ev.url+'" target="_blank" class="btn btn-primary btn-sm" style="flex-shrink:0">Details</a>'+
        '</div>'+
        '<div class="card-sub" style="margin-top:6px">'+ev.desc+'</div>'+
        '<div style="margin-top:4px">'+ev.tags.map(t =>
          '<span class="badge '+(t==='Free'?'badge-on':'badge-off')+'" style="margin-right:4px">'+t+'</span>'
        ).join('')+'</div>'+
      '</div>';
    });
    html += '</div>';
    html += '<div class="panel" style="margin-top:12px;text-align:center">'+
      '<div class="card-sub">This list may not be complete.</div>'+
      '<a href="'+evUrl+'" target="_blank" class="link-btn" style="margin-top:6px;display:inline-block">See more at '+cityName+' FWC26 Official Site &rarr;</a>'+
    '</div>';
  } else {
    html += '<div class="panel" style="text-align:center;padding:30px">'+
      '<div style="font-size:.9rem;color:#a1a1aa;margin-bottom:12px">Detailed event data for '+cityName+' coming soon</div>'+
      '<div class="links" style="justify-content:center">'+
        '<a href="'+evUrl+'" target="_blank" class="btn btn-primary">Events &amp; Fan Calendar</a>'+
        '<a href="'+city.site+'" target="_blank" class="btn btn-sm" style="background:#27272a;color:#e4e4e7">Official FWC26 Site</a>'+
      '</div>'+
      '<div class="card-sub" style="margin-top:10px">Check for fan festivals, watch parties, drone shows, and cultural activations.</div>'+
    '</div>';
  }

  box.innerHTML = html;
}

// =============== SETTINGS VIEW ===============
function renderSettingsView(container) {
  const curMethod = SETTINGS.alertMethod || 'ntfy';
  container.innerHTML =
    '<h2>Notification Settings</h2>'+
    '<div class="panel">'+
      '<div class="form-group" style="margin-bottom:12px"><label>Alert Method</label>'+
        '<select id="sMethod">'+
          '<option value="ntfy"'+(curMethod==='ntfy'?' selected':'')+'>ntfy (push notifications)</option>'+
          '<option value="sms"'+(curMethod==='sms'?' selected':'')+'>SMS (text messages)</option>'+
          '<option value="both"'+(curMethod==='both'?' selected':'')+'>Both ntfy + SMS</option>'+
        '</select>'+
      '</div>'+
      '<div id="ntfySettings"'+(curMethod==='sms'?' class="hidden"':'')+'>'+
        '<div class="form-group" style="margin-bottom:10px"><label>ntfy Topic</label>'+
          '<input type="text" id="sNtfy" value="'+(SETTINGS.ntfyTopic||'')+'" placeholder="fifa-egypt-iran-tickets">'+
          '<div class="card-sub" style="margin-top:4px">Install <a href="https://ntfy.sh" target="_blank">ntfy app</a> on your phone(s) and subscribe to this topic to get push notifications.</div>'+
        '</div>'+
      '</div>'+
      '<div id="smsSettings"'+(curMethod==='ntfy'?' class="hidden"':'')+'>'+
        '<div class="form-group" style="margin-bottom:10px"><label>Phone Number for SMS</label>'+
          '<input type="text" id="sSms" value="'+(SETTINGS.smsGatewayEmail||'')+'" placeholder="2065551234@tmomail.net">'+
          '<div class="card-sub" style="margin-top:4px">Your 10-digit number + carrier gateway. Examples:<br>'+
            'T-Mobile: 2065551234@tmomail.net<br>'+
            'AT&amp;T: 2065551234@txt.att.net<br>'+
            'Verizon: 2065551234@vtext.com</div>'+
        '</div>'+
      '</div>'+
      '<button class="btn btn-primary" id="saveSettings">Save Settings</button>'+
    '</div>'+
    '<h2>Watched Matches</h2>'+
    '<div class="panel" id="watchList"></div>'+
    '<h2>Manual Actions</h2>'+
    '<div class="panel">'+
      '<button class="btn btn-primary" id="manualCheck">Run Price Check Now</button>'+
      '<span id="checkStatus" style="margin-left:10px;font-size:.82rem;color:#71717a"></span>'+
    '</div>';

  // Watch list
  const wl = document.getElementById('watchList');
  if (WATCHES.length === 0) {
    wl.innerHTML = '<div class="empty">No matches being tracked yet</div>';
  } else {
    wl.innerHTML = WATCHES.map(w => {
      const d = new Date(w.date).toLocaleDateString('en-US',{month:'short',day:'numeric'});
      return '<div class="watch-item"><div><strong>'+w.name+'</strong><br>'+
        '<span style="font-size:.75rem;color:#71717a">'+w.venue+' &middot; '+d+' &middot; Alert: '+(w.alertsEnabled?'≤$'+w.maxPrice:'off')+'</span></div>'+
        '<button class="btn btn-danger btn-sm" data-slug="'+w.slug+'">Remove</button></div>';
    }).join('');
    wl.querySelectorAll('button[data-slug]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Remove this match?')) return;
        await fetch('/api/watches/'+btn.dataset.slug, {method:'DELETE'});
        location.reload();
      });
    });
  }

  document.getElementById('sMethod').addEventListener('change', function() {
    const v = this.value;
    document.getElementById('ntfySettings').classList.toggle('hidden', v === 'sms');
    document.getElementById('smsSettings').classList.toggle('hidden', v === 'ntfy');
  });

  document.getElementById('saveSettings').addEventListener('click', async () => {
    const method = document.getElementById('sMethod').value;
    const s = {
      alertMethod: method,
      ntfyTopic: document.getElementById('sNtfy').value.trim(),
      smsGatewayEmail: document.getElementById('sSms').value.trim() || undefined,
    };
    if ((method === 'ntfy' || method === 'both') && !s.ntfyTopic) {
      alert('Please enter an ntfy topic'); return;
    }
    if ((method === 'sms' || method === 'both') && !s.smsGatewayEmail) {
      alert('Please enter your SMS gateway email'); return;
    }
    await fetch('/api/settings', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(s)});
    alert('Settings saved!');
  });

  document.getElementById('manualCheck').addEventListener('click', async () => {
    const st = document.getElementById('checkStatus');
    st.textContent = 'Running...';
    await fetch('/api/check', {method:'POST'});
    st.textContent = 'Done! Refresh page to see results.';
  });
}

// =============== UTILS ===============
function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').substring(0,60);
}
function timeAgo(date) {
  const s = Math.floor((Date.now()-date.getTime())/1000);
  if (s<60) return s+'s ago';
  if (s<3600) return Math.floor(s/60)+'m ago';
  if (s<86400) return Math.floor(s/3600)+'h ago';
  return Math.floor(s/86400)+'d ago';
}

init();
setTimeout(()=>location.reload(), 5*60*1000);
</script>
</body>
</html>`;
}
