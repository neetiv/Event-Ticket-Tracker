import { Env, PriceSnapshot } from "./types";
import { getWatches, getLatestPrice, getLastCheck, getPriceHistory, getSettings } from "./storage";

const SOURCES = ["ticketmaster"];

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
      return { ...event, sources };
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
  <title>Event Ticket Tracker</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns@3"></script>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:'Segoe UI',system-ui,-apple-system,sans-serif;background:#faf6f1;color:#3d2c1e;padding:16px;max-width:960px;margin:0 auto}
    h1{font-size:1.6rem;color:#3d2c1e;margin-bottom:2px}
    h2{font-size:1.1rem;color:#3d2c1e;margin:18px 0 10px}
    .subtitle{color:#8a7265;font-size:.82rem;margin-bottom:16px}
    .tabs{display:flex;gap:6px;margin-bottom:16px;flex-wrap:wrap;border-bottom:2px solid #e8ddd4;padding-bottom:8px}
    .tab{padding:8px 16px;border-radius:20px;border:none;background:transparent;color:#8a7265;cursor:pointer;font-size:.84rem;font-weight:500;transition:all .15s}
    .tab:hover{background:#f0e6dc;color:#3d2c1e}
    .tab.active{background:#c9a88c;color:#fff}
    .tab.active:hover{background:#b8956f}
    .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-bottom:16px}
    .card{background:#fff;border:1px solid #e8ddd4;border-radius:14px;padding:14px;transition:box-shadow .15s}
    .card:hover{box-shadow:0 4px 16px rgba(61,44,30,.08)}
    .card-label{font-size:.7rem;color:#8a7265;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
    .card-value{font-size:1.6rem;font-weight:700;color:#3d2c1e}
    .card-value.green{color:#5a9e6f}.card-value.amber{color:#c9a050}.card-value.red{color:#c45c5c}.card-value.na{color:#c4b5a8;font-size:1.1rem}
    .card-sub{font-size:.72rem;color:#8a7265;margin-top:3px}
    .chart-box{background:#fff;border:1px solid #e8ddd4;border-radius:14px;padding:14px;margin-bottom:16px}
    canvas{max-height:300px}
    a{color:#6b8f71;text-decoration:none}a:hover{text-decoration:underline;color:#5a9e6f}
    .panel{background:#fff;border:1px solid #e8ddd4;border-radius:14px;padding:16px;margin-bottom:16px}
    input,select{background:#faf6f1;border:1px solid #e8ddd4;color:#3d2c1e;border-radius:8px;padding:8px 10px;font-size:.85rem;width:100%}
    input:focus,select:focus{outline:none;border-color:#c9a88c}
    .btn{padding:8px 16px;border-radius:20px;border:none;font-size:.84rem;font-weight:600;cursor:pointer;transition:all .15s}
    .btn-primary{background:#c9a88c;color:#fff}.btn-primary:hover{background:#b8956f}
    .btn-mint{background:#a8d5ba;color:#3d2c1e}.btn-mint:hover{background:#8ec4a3}
    .btn-pink{background:#f0c4c8;color:#3d2c1e}.btn-pink:hover{background:#e6adb3}
    .btn-danger{background:#f0c4c8;color:#8b3a3a}.btn-danger:hover{background:#e6adb3}
    .btn-sm{padding:5px 12px;font-size:.75rem}
    .form-row{display:flex;gap:8px;align-items:end;margin-bottom:10px}
    .form-group{flex:1}
    .form-group label{display:block;font-size:.72rem;color:#8a7265;margin-bottom:3px;text-transform:uppercase;letter-spacing:.04em}
    .search-results{max-height:500px;overflow-y:auto;margin-top:10px}
    .search-item{display:flex;gap:12px;padding:12px;border:1px solid #e8ddd4;border-radius:12px;margin-bottom:8px;background:#fff;align-items:center;transition:box-shadow .15s}
    .search-item:hover{box-shadow:0 2px 12px rgba(61,44,30,.06)}
    .si-img{width:80px;height:50px;border-radius:8px;object-fit:cover;flex-shrink:0}
    .si-info{flex:1;min-width:0}
    .si-name{font-size:.88rem;color:#3d2c1e;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .si-detail{font-size:.72rem;color:#8a7265;margin-top:2px}
    .si-price{font-size:.9rem;font-weight:700;color:#5a9e6f;white-space:nowrap}
    .si-genre{display:inline-block;padding:2px 8px;border-radius:10px;font-size:.65rem;font-weight:600;background:#f0e6dc;color:#8a7265;margin-top:3px}
    .badge{display:inline-block;padding:2px 10px;border-radius:10px;font-size:.68rem;font-weight:600}
    .badge-on{background:#a8d5ba;color:#2d5e3a}.badge-off{background:#f0e6dc;color:#8a7265}
    .empty{text-align:center;color:#c4b5a8;padding:40px;font-size:.9rem}
    .footer{text-align:center;font-size:.68rem;color:#c4b5a8;margin-top:24px}
    .info-row{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;margin-bottom:10px}
    .info-detail{font-size:.78rem;color:#8a7265}
    .watch-item{display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid #e8ddd4;border-radius:10px;margin-bottom:6px;background:#faf6f1}
    .hidden{display:none}
    .hero{text-align:center;padding:20px 0 10px}
    .hero-search{max-width:600px;margin:0 auto}
  </style>
</head>
<body>
  <div class="hero">
    <h1>Event Ticket Tracker</h1>
    <p class="subtitle">Search events &middot; Track prices &middot; Get alerts when they drop</p>
  </div>

  <div class="tabs" id="tabs"></div>
  <div id="view"></div>

  <div class="footer">
    Powered by Ticketmaster Discovery API &middot; Prices may not reflect all resale listings
  </div>

<script>
const WATCHES = ${JSON.stringify(watchData)};
const SETTINGS = ${JSON.stringify(settings)};
let activeView = '_search';
let chart = null;

function init() {
  renderTabs();
  showView(activeView);
}

function renderTabs() {
  const c = document.getElementById('tabs');
  let html = '<button class="tab'+(activeView==='_search'?' active':'')+'" data-view="_search">Explore Events</button>';
  WATCHES.forEach(w => {
    html += '<button class="tab'+(w.slug===activeView?' active':'')+'" data-view="'+w.slug+'">'+w.name+'</button>';
  });
  html += '<button class="tab'+(activeView==='_alerts'?' active':'')+'" data-view="_alerts">Alerts &amp; Settings</button>';
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
  if (view === '_alerts') { renderSettingsView(v); return; }
  const w = WATCHES.find(e => e.slug === view);
  if (w) renderEventView(v, w);
  else v.innerHTML = '<div class="empty">Event not found</div>';
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
      const genre = r.genre ? '<span class="si-genre">'+r.genre+'</span>' : '';
      const isTracked = WATCHES.some(w => w.ticketmasterEventId === r.eventId);
      return '<div class="search-item">'+img+
        '<div class="si-info"><div class="si-name">'+r.name+'</div>'+
          '<div class="si-detail">'+r.venue+', '+r.city+(d?' &middot; '+d:'')+'</div>'+genre+
        '</div>'+
        (price?'<div class="si-price">'+price+'</div>':'')+
        (isTracked
          ? '<span class="badge badge-on">Tracking</span>'
          : '<button class="btn btn-mint btn-sm" data-event="'+encodeURIComponent(JSON.stringify(r))+'">Track</button>')+
      '</div>';
    }).join('')+'</div>';
    box.querySelectorAll('button[data-event]').forEach(btn => {
      btn.addEventListener('click', () => trackEvent(JSON.parse(decodeURIComponent(btn.dataset.event))));
    });
  } catch(e) { box.innerHTML = '<div class="empty">Search failed.</div>'; }
}

async function trackEvent(event) {
  const slug = slugify(event.name + '-' + event.eventId);
  const maxPrice = prompt('Alert when price drops below ($):', event.minPrice ? String(Math.round(event.minPrice * 0.9)) : '100');
  if (maxPrice === null) return;
  const watch = {
    slug,
    name: event.name,
    date: event.date || new Date().toISOString(),
    venue: event.venue || '',
    city: event.city || '',
    ticketmasterEventId: event.eventId,
    ticketsWanted: 2,
    maxPrice: parseInt(maxPrice) || 100,
    alertsEnabled: true,
    url: event.url || 'https://www.ticketmaster.com/event/'+event.eventId,
  };
  await fetch('/api/watches', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(watch)});
  location.reload();
}

// =============== EVENT VIEW ===============
function renderEventView(container, event) {
  const d = new Date(event.date);
  const dateStr = d.toLocaleDateString('en-US',{weekday:'long',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
  const daysLeft = Math.max(0, Math.ceil((d - Date.now()) / 86400000));
  const badge = event.alertsEnabled
    ? '<span class="badge badge-on">Alerts on &le;$'+event.maxPrice+'</span>'
    : '<span class="badge badge-off">Tracking only</span>';

  let cardsHtml = '';
  for (const [source, data] of Object.entries(event.sources)) {
    const label = source.charAt(0).toUpperCase() + source.slice(1);
    const latest = data.latest;
    let cls='na', val='No data yet', sub='';
    if (latest && latest.minPrice !== null) {
      const p = latest.minPrice;
      cls = p <= event.maxPrice * 0.85 ? 'green' : p <= event.maxPrice ? 'amber' : 'red';
      val = '$'+p;
      if (latest.maxPrice && latest.maxPrice !== latest.minPrice) sub = 'Range: $'+latest.minPrice+' – $'+latest.maxPrice;
    }
    const chk = data.lastCheck ? timeAgo(new Date(data.lastCheck)) : 'never';
    const link = latest?.url ? ' &middot; <a href="'+latest.url+'" target="_blank">Buy tickets</a>' : '';
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
  const colors = {ticketmaster:'#c9a88c',seatgeek:'#5a9e6f'};
  for (const [source, data] of Object.entries(event.sources)) {
    if (data.history.length === 0) continue;
    datasets.push({
      label: source.charAt(0).toUpperCase()+source.slice(1),
      data: data.history.filter(h=>h.minPrice!==null).map(h=>({x:h.timestamp,y:h.minPrice})),
      borderColor:colors[source]||'#c9a88c',backgroundColor:(colors[source]||'#c9a88c')+'20',
      borderWidth:2,pointRadius:1.5,tension:0.3,fill:true,
    });
  }
  if (event.alertsEnabled && datasets.length > 0) {
    datasets.push({
      label:'Target ($'+event.maxPrice+')',
      data:[{x:datasets[0].data[0]?.x||Date.now(),y:event.maxPrice},{x:Date.now(),y:event.maxPrice}],
      borderColor:'#f0c4c8',borderWidth:2,borderDash:[6,4],pointRadius:0,fill:false,
    });
  }
  chart = new Chart(ctx,{
    type:'line',data:{datasets},
    options:{
      responsive:true,interaction:{mode:'index',intersect:false},
      scales:{
        x:{type:'time',time:{tooltipFormat:'MMM d, h:mm a'},grid:{color:'#f0e6dc'},ticks:{color:'#8a7265'}},
        y:{beginAtZero:false,grid:{color:'#f0e6dc'},ticks:{color:'#8a7265',callback:v=>'$'+v}},
      },
      plugins:{legend:{labels:{color:'#8a7265'}},tooltip:{callbacks:{label:c=>c.dataset.label+': $'+c.parsed.y}}},
    },
  });
}

// =============== SETTINGS VIEW ===============
function renderSettingsView(container) {
  const curMethod = SETTINGS.alertMethod || 'ntfy';
  container.innerHTML =
    '<h2>Notification Settings</h2>'+
    '<div class="panel">'+
      '<div class="form-group" style="margin-bottom:12px"><label>Alert Method</label>'+
        '<select id="sMethod"><option value="ntfy"'+(curMethod==='ntfy'?' selected':'')+'>ntfy (push notifications)</option><option value="sms"'+(curMethod==='sms'?' selected':'')+'>SMS (text messages)</option><option value="both"'+(curMethod==='both'?' selected':'')+'>Both</option></select></div>'+
      '<div id="ntfySettings"'+(curMethod==='sms'?' class="hidden"':'')+'>'+
        '<div class="form-group" style="margin-bottom:10px"><label>ntfy Topic</label><input type="text" id="sNtfy" value="'+(SETTINGS.ntfyTopic||'')+'" placeholder="my-ticket-alerts">'+
          '<div class="card-sub" style="margin-top:4px">Install <a href="https://ntfy.sh" target="_blank">ntfy app</a> and subscribe to this topic.</div></div></div>'+
      '<div id="smsSettings"'+(curMethod==='ntfy'?' class="hidden"':'')+'>'+
        '<div class="form-group" style="margin-bottom:10px"><label>SMS Gateway Email</label><input type="text" id="sSms" value="'+(SETTINGS.smsGatewayEmail||'')+'" placeholder="2065551234@tmomail.net"></div></div>'+
      '<button class="btn btn-primary" id="saveSettings">Save Settings</button>'+
    '</div>'+
    '<h2>Tracked Events</h2>'+
    '<div class="panel" id="watchList"></div>'+
    '<h2>Manual Actions</h2>'+
    '<div class="panel"><button class="btn btn-primary" id="manualCheck">Run Price Check Now</button> <span id="checkStatus" style="font-size:.82rem;color:#8a7265"></span></div>';

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

  document.getElementById('sMethod').addEventListener('change', function() {
    document.getElementById('ntfySettings').classList.toggle('hidden', this.value==='sms');
    document.getElementById('smsSettings').classList.toggle('hidden', this.value==='ntfy');
  });
  document.getElementById('saveSettings').addEventListener('click', async () => {
    const method = document.getElementById('sMethod').value;
    const s = {alertMethod:method, ntfyTopic:document.getElementById('sNtfy').value.trim(), smsGatewayEmail:document.getElementById('sSms').value.trim()||undefined};
    await fetch('/api/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(s)});
    alert('Settings saved!');
  });
  document.getElementById('manualCheck').addEventListener('click', async () => {
    document.getElementById('checkStatus').textContent = 'Running...';
    await fetch('/api/check',{method:'POST'});
    document.getElementById('checkStatus').textContent = 'Done! Refresh to see results.';
  });
}

// =============== UTILS ===============
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
