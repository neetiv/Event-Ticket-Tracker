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
    '<div style="margin-top:10px"><button class="btn btn-danger btn-sm" id="removeBtn">Remove this match</button></div>';

  renderChart(match);

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
        '<div class="form-group" style="flex:3"><label>Search Ticketmaster</label>'+
          '<input type="text" id="searchInput" placeholder="e.g. FIFA World Cup Seattle" value="FIFA World Cup 2026"></div>'+
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
  const box = document.getElementById('searchResults');
  if (!q) return;
  box.innerHTML = '<div class="empty">Searching...</div>';
  try {
    const res = await fetch('/api/search?q='+encodeURIComponent(q));
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
        '<button class="btn btn-success btn-sm" data-event=\''+JSON.stringify(r).replace(/'/g,"&#39;")+'\'>Track</button></div>';
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

// =============== SETTINGS VIEW ===============
function renderSettingsView(container) {
  container.innerHTML =
    '<h2>Notification Settings</h2>'+
    '<div class="panel">'+
      '<div class="form-group" style="margin-bottom:10px"><label>ntfy Topic</label>'+
        '<input type="text" id="sNtfy" value="'+(SETTINGS.ntfyTopic||'')+'" placeholder="fifa-egypt-iran-tickets">'+
        '<div class="card-sub" style="margin-top:4px">Install <a href="https://ntfy.sh" target="_blank">ntfy app</a> on your phone(s) and subscribe to this topic to get push notifications.</div>'+
      '</div>'+
      '<div class="form-group" style="margin-bottom:10px"><label>SMS Gateway Email (optional)</label>'+
        '<input type="text" id="sSms" value="'+(SETTINGS.smsGatewayEmail||'')+'" placeholder="2065551234@tmomail.net">'+
        '<div class="card-sub" style="margin-top:4px">Carrier email-to-SMS gateway for backup alerts on a second device.</div>'+
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

  document.getElementById('saveSettings').addEventListener('click', async () => {
    const s = {
      ntfyTopic: document.getElementById('sNtfy').value.trim(),
      smsGatewayEmail: document.getElementById('sSms').value.trim() || undefined,
    };
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
