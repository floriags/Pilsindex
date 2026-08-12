const STORAGE_KEY = 'beerindex_location';

function scoreColor(s){
  if(s<0.1) return '#c0392b'; // red
  if(s<0.2) return '#cb4f2b';
  if(s<0.3) return '#d5642c';
  if(s<0.4) return '#e07a2c'; // orange
  if(s<0.5) return '#e1892d';
  if(s<0.6) return '#e2982d';
  if(s<0.7) return '#e3a72e'; // yellow
  if(s<0.8) return '#b0dd2d';
  if(s<0.9) return '#47d62c';
  return '#2ecc71';           // green (brighter)
}

function verdictText(s){
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  if(s<0.125) return pick(['Kanskje best å komme seg på puben', 'Det finnes puber av en grunn', 'Hørt om innepils?']);
  if(s<0.25) return pick(['Utepils for de dedikerte', 'Karakterbyggende utepils', 'Du må være virkelig tørst']);
  if(s<0.375) return pick(['Jakke anbefales', 'Finnes ikke dårlig vær, bare dårlig pils', 'Du får uteserveringen for deg selv']);
  if(s<0.5) return pick(['Pilsen holder seg hvertfall kald en stund', 'Holder kanskje med én utepils', 'Helt midt på treet']);
  if(s<0.625) return pick(['Helt kurant med utepils', 'Ingen kommer til å angre på én utepils', 'Absolutt verdt et forsøk']);
  if(s<0.75) return pick(['Det lukter utepils', 'Fare for "bare en til"', 'Skal ikke kimse av utepilsen']);
  if(s<0.875) return pick(['En kald en hadde gjort seg', 'Ganske digg med en halvliter', 'Det er observert flere bjørnunger ute']);
  return pick(['Livsfarlig å være en utepils', 'På med raske solbriller og fram med pilsen', 'Ølboksene skjelver i kjøleskapet på nærbutikken']);
}

function weatherEmoji(cloudCover, rain){
  if(rain && cloudCover < 33) return '🌦️'; // sunny rain
  if(rain) return '🌧️';                    // rain
  if(cloudCover < 10) return '☀️';         // sun
  if(cloudCover < 33) return '🌤️';         // sun little cloud
  if(cloudCover < 67) return '⛅️';         // sun medium cloud
  if(cloudCover < 90) return '🌥️';         // sun big cloud
  return '☁️';                             // cloudy
}

// Per-factor scores are banded exactly like the reference (each tier a
// flat 0-1 value, narrowest band first), not smoothed curves - so a value
// well inside the ideal range genuinely scores as well as it should,
// rather than a formula quietly shaving points off for no clear reason.
function tempScore(t){
  if(t>=24 && t<=26) return 1.0;
  if(t>=22 && t<=29) return 0.9;
  if(t>=20 && t<=32) return 0.8;
  if(t>=18 && t<=35) return 0.7;
  if(t>=16 && t<=38) return 0.6;
  if(t>=14 && t<=40) return 0.5;
  if(t>=12 && t<=42) return 0.4;
  if(t>=10 && t<=44) return 0.3;
  if(t>=8  && t<=47) return 0.2;
  if(t>=6  && t<=50) return 0.1;
  return 0.0;
}
function cloudScore(c){
  if(c<10) return 1.0;
  if(c<33) return 0.8;
  if(c<67) return 0.6;
  if(c<90) return 0.4;
  return 0.2;
}
function humidityScore(h){
  if(h>=40 && h<=50) return 1.0;
  if(h>=30 && h<=60) return 0.9;
  if(h>=20 && h<=70) return 0.8;
  if(h>=10 && h<=80) return 0.7;
  return 0.5;
}
function windScore(w){
  if(w<=3) return 1.0;
  if(w<=5) return 0.9;
  if(w<=7) return 0.8;
  if(w<=9) return 0.7;
  return 0.5;
}
// Time of day on its own, separate from the weather itself - a perfect-
// weather hour at 3am still scores lower than the same weather at 5pm.
function hourScore(hh){
  if(hh < 3) return 0.75;
  if(hh < 8) return 0.25;
  if(hh < 12) return 0.50;
  if(hh < 16) return 0.75;
  return 1;
}
// Weighted AVERAGE of the bands above - not a product like the original
// Kotlin version multiplied them - so one factor being a tier below ideal
// only costs a slice of the score instead of compounding with every other
// factor and crushing it. Weighted by importance: temperature dominates,
// cloud cover is a clear second, wind, humidity and time of day matter
// much less. Rain is stacked ON TOP of the forecast-probability penalty,
// not instead of it - so actually raining is always strictly worse than
// merely a matching chance of rain (a naive "halve if raining, else
// subtract the chance" version could let an 80%-chance-but-dry hour score
// *worse* than an actually-raining one, which makes no sense).
function beerIndex(t,w,h,c,precipProb,rain,hh){
  const base = 0.40*tempScore(t) + 0.20*cloudScore(c) + 0.10*windScore(w) + 0.10*humidityScore(h) + 0.20*hourScore(hh);
  let score = base - (precipProb/100*0.3);
  if(rain) score *= 0.7;
  return Math.max(0, Math.min(1, score));
}

function fmtHour(iso){
  const d = new Date(iso);
  return d.toLocaleTimeString([], {hour:'numeric'}).replace(' ','');
}
// Hardcoded Norwegian names (rather than relying on the visitor's browser
// locale) so the app reads consistently in Norwegian for everyone.
const NB_WEEKDAYS = ['Søndag','Mandag','Tirsdag','Onsdag','Torsdag','Fredag','Lørdag'];
const NB_MONTHS = ['januar','februar','mars','april','mai','juni','juli','august','september','oktober','november','desember'];
function nbDatePart(date){ return `${date.getDate()}. ${NB_MONTHS[date.getMonth()]}`; }
function nbWeekday(date){ return NB_WEEKDAYS[date.getDay()]; }
function dayKey(d){ return d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate(); }
function dayHeaderLabel(dayIndex, date){
  if(dayIndex===0) return `I dag ${nbDatePart(date)}`;
  return `${nbWeekday(date)} ${nbDatePart(date)}`;
}

async function reverseGeocode(lat, lon){
  try{
    const r = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=no`);
    const j = await r.json();
    return j.city || j.locality || j.principalSubdivision || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  }catch(e){
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  }
}

async function fetchWeather(lat, lon){
  const params = new URLSearchParams({
    latitude: lat, longitude: lon,
    hourly: 'temperature_2m,relative_humidity_2m,precipitation_probability,precipitation,cloud_cover,wind_speed_10m',
    forecast_days: 7,
    timezone: 'auto'
  });
  const r = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if(!r.ok) throw new Error('Weather fetch failed');
  return r.json();
}

function buildHourly(data){
  const h = data.hourly;
  const rows = h.time.map((t,i)=>({
    time:t,
    temp:h.temperature_2m[i],
    hum:h.relative_humidity_2m[i],
    precipProb:h.precipitation_probability[i],
    // Just "is it raining right now", not how much - a 0.5mm drizzle and a
    // 15mm downpour are both "not nice to sit outside in", so there's no
    // real value in the app carrying the raw mm figure around.
    rain:h.precipitation[i] > 0.1,
    cloud:h.cloud_cover[i],
    wind:h.wind_speed_10m[i],
    hour:new Date(t).getHours()
  }));
  return rows;
}

// Group hourly rows (>= the current hour) into calendar days, in order.
// Using the start of the current hour rather than the exact current time
// means today's table still includes the row for right now - e.g. at
// 13:14 the 13:00 row (covering 13:00-14:00) is still "now", not the past.
function buildDayGroups(rows, now){
  const groups = [];
  const map = new Map();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const currentHourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());

  rows.forEach(r=>{
    const d = new Date(r.time);
    if(d < currentHourStart) return;
    const k = dayKey(d);
    if(!map.has(k)){
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      const dayIndex = Math.round((dayStart - todayStart) / 86400000);
      const group = {key:k, date:d, dayIndex, rows:[]};
      map.set(k, group);
      groups.push(group);
    }
    map.get(k).rows.push(r);
  });

  return groups.slice(0, 7);
}

// Split one day's hours into the four fixed 6-hour blocks Yr-style apps use.
// Score is the AVERAGE of each hour's own beerIndex() result, not one score
// computed from averaged inputs - so a single rainy/cold hour only pulls its
// own 1/6 share of the block down, instead of e.g. the rain penalty applying
// to the whole 6-hour block just because one hour in it rained. The icon is
// decided separately, purely for display: average cloud cover plus a
// majority-rule rain flag (more than half the hours), since one rainy hour
// out of six shouldn't make the block's symbol look fully rainy either.
function bucketQuarters(rows){
  const quarters = [[],[],[],[]];
  const labels = ['00-06','06-12','12-18','18-24'];
  rows.forEach(r=>{
    const h = new Date(r.time).getHours();
    quarters[Math.min(3, Math.floor(h/6))].push(r);
  });
  return quarters.map((chunk,i)=>{
    if(chunk.length===0) return null;
    const avg = k=>chunk.reduce((a,r)=>a+r[k],0)/chunk.length;
    const score = ()=>chunk.reduce((a,r)=>a+beerIndex(r.temp,r.wind,r.hum,r.cloud,r.precipProb,r.rain,r.hour),0)/chunk.length;
    const majorityRain = chunk.filter(r=>r.rain).length > chunk.length/2;
    return {
      label: labels[i],
      temp: avg('temp'),
      score: score(),
      emoji: weatherEmoji(avg('cloud'), majorityRain)
    };
  }).filter(Boolean);
}

function renderRow(label, temp, emoji, score){
  const color = scoreColor(score);
  return `<div class="day-row">
    <span class="row-time">${label}</span>
    <span class="row-emoji">${emoji}</span>
    <span class="row-temp">${Math.round(temp)}°</span>
    <span class="row-bi" style="background:${color}22;color:${color}">${score.toFixed(2)}</span>
  </div>`;
}

// One "box" per day. Today: always hour-by-hour (it's already short and
// partial). Every later day (tomorrow through day 7): 6-hour blocks by
// default, with a "Details" toggle to expand to the full hour-by-hour view -
// the hourly data is already in hand, so expanding is instant.
function renderDayCard(group){
  const hourlyRowsHtml = () => group.rows.map(r=>{
    const score = beerIndex(r.temp,r.wind,r.hum,r.cloud,r.precipProb,r.rain,r.hour);
    const emoji = weatherEmoji(r.cloud, r.rain);
    return renderRow(fmtHour(r.time), r.temp, emoji, score);
  }).join('');
  const quarterRowsHtml = () => bucketQuarters(group.rows).map(b=>renderRow(b.label, b.temp, b.emoji, b.score)).join('');

  if(group.dayIndex === 0){
    return `<div class="day-card">
      <div class="day-card-header">${dayHeaderLabel(group.dayIndex, group.date)}</div>
      <div class="day-rows">${hourlyRowsHtml()}</div>
    </div>`;
  }

  return `<div class="day-card">
    <div class="day-card-header">${dayHeaderLabel(group.dayIndex, group.date)}</div>
    <div class="day-rows" data-mode="quarters">${quarterRowsHtml()}</div>
    <div class="day-rows" data-mode="hourly" hidden>${hourlyRowsHtml()}</div>
    <button type="button" class="day-toggle" aria-expanded="false">Detaljer <span class="chev">▾</span></button>
  </div>`;
}

// Update the Home-page gauge + current conditions with the latest hour.
function renderHome(curScore, curColor, cur){
  const gauge = document.getElementById('homeGauge');
  const num = document.getElementById('homeGaugeNum');
  const verdict = document.getElementById('homeVerdict');
  if(gauge) gauge.style.background = curColor;
  if(num) num.textContent = curScore.toFixed(2);
  if(verdict) verdict.textContent = verdictText(curScore);

  const emoji = document.getElementById('homeNowEmoji');
  const temp = document.getElementById('homeNowTemp');
  if(emoji) emoji.textContent = weatherEmoji(cur.cloud, cur.rain);
  if(temp) temp.textContent = `${Math.round(cur.temp)}°`;
}

// Find the single upcoming hour (across the whole week) with the highest
// Beer Index - shown on the Details page as "Best time this week".
function bestTimeLabel(date, now){
  // Same "start of current hour" the row itself is keyed on (see
  // findBestUpcoming/buildDayGroups) - if the best row IS the current hour,
  // show "Nå" instead of "I dag kl. <hour>".
  const currentHourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
  if(date.getTime() === currentHourStart.getTime()) return 'Nå';
  const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayIndex = Math.round((dayStart - todayStart) / 86400000);
  const time = fmtHour(date);
  if(dayIndex === 0) return `I dag kl. ${time}`;
  return `${nbWeekday(date)} kl. ${time}`;
}

// Uses the start of the current hour (not the exact current time) as the
// cutoff, same as buildDayGroups - otherwise the current hour's own row
// (e.g. 13:00 when it's 13:14) would be treated as "past" and skipped, so
// the current hour could never win even if it has the best score.
function findBestUpcoming(rows, now){
  const currentHourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
  let best = null, bestScore = -1;
  rows.forEach(r=>{
    if(new Date(r.time) < currentHourStart) return;
    const s = beerIndex(r.temp, r.wind, r.hum, r.cloud, r.precipProb, r.rain, r.hour);
    if(s > bestScore){ bestScore = s; best = r; }
  });
  return best ? {time:best.time, score:bestScore} : null;
}

function renderBestTimeCard(rows, now){
  const best = findBestUpcoming(rows, now);
  if(!best) return '';
  const label = bestTimeLabel(new Date(best.time), now);
  const color = scoreColor(best.score);
  return `<div class="home-best">
    <div class="home-best-label">Beste tidspunkt for utepils de neste dagene</div>
    <div class="home-best-value">${label} <span class="home-best-score" style="background:${color}22;color:${color}">${best.score.toFixed(2)}</span></div>
  </div>`;
}

// The title bar is now position:fixed (out of normal flow entirely), so
// .wrap and each day-card header both need to know its real rendered
// height: .wrap uses it as top padding (to not render underneath the
// title), and each day-card header uses it as its sticky "top" offset, so
// it stacks right below the title. Measured via JS rather than hardcoded
// since it varies with the safe-area inset.
let headerHeightPx = 90;
function updateHeaderHeightVar(){
  const header = document.querySelector('header');
  if(!header) return;
  headerHeightPx = header.offsetHeight;
  document.documentElement.style.setProperty('--header-h', headerHeightPx + 'px');
}
window.addEventListener('resize', updateHeaderHeightVar);
window.addEventListener('orientationchange', updateHeaderHeightVar);

// Each day-card header is rounded like the rest of the card, but once one
// is actually pinned flush against the fixed title bar (position:sticky,
// top:var(--header-h)) the rounded corners would expose a sliver of
// whatever's scrolled behind it. A 1px sentinel at the top of each card
// lets an IntersectionObserver detect the exact moment a header becomes
// pinned, so corners can be squared off only for that moment -
// boundingClientRect.top < headerHeightPx distinguishes "scrolled past
// above" from "not reached yet", both of which report isIntersecting:
// false. The observer's rootMargin is shifted down by the title's height
// so the trigger line matches where the header actually sticks, not the
// true viewport top.
let stickyObserver;
function setupStickyHeaders(){
  const container = document.getElementById('content');
  if(!container) return;
  if(stickyObserver) stickyObserver.disconnect();
  stickyObserver = new IntersectionObserver(entries=>{
    entries.forEach(entry=>{
      const header = entry.target.parentElement.querySelector('.day-card-header');
      if(!header) return;
      header.classList.toggle('is-pinned', !entry.isIntersecting && entry.boundingClientRect.top < headerHeightPx);
    });
  }, {rootMargin: `-${headerHeightPx}px 0px 0px 0px`, threshold:0});
  container.querySelectorAll('.day-card').forEach(card=>{
    let sentinel = card.querySelector('.stick-sentinel');
    if(!sentinel){
      sentinel = document.createElement('div');
      sentinel.className = 'stick-sentinel';
      card.insertBefore(sentinel, card.firstChild);
    }
    stickyObserver.observe(sentinel);
  });
}

// Current location name is shown in two places (Home page + Search tab),
// both carrying the shared .loc-name class, so update them together.
function setLocationName(text){
  document.querySelectorAll('.loc-name').forEach(el => el.textContent = text);
}

async function renderAll(lat, lon, name){
  setLocationName(name);
  // #content may currently hold the day-cards from a previous city (or an
  // error message), not the original #statusMsg element, so replace it
  // outright rather than assuming a specific child still exists.
  document.getElementById('content').innerHTML = '<div class="status">Henter værvarsel…</div>';
  try{
    const data = await fetchWeather(lat, lon);
    const rows = buildHourly(data);
    const now = new Date();
    // Find the row for the start of the current hour (not just whichever
    // row is closest to the exact current time) - same fix as
    // buildDayGroups/findBestUpcoming: at e.g. 13:31, the 14:00 row is
    // "closer" by raw time difference than the still-current 13:00 row,
    // which made the home gauge show next hour's score instead of now's.
    const currentHourStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
    let curIdx = 0;
    let bestDiff = Infinity;
    rows.forEach((r,i)=>{
      const diff = Math.abs(new Date(r.time)-currentHourStart);
      if(diff<bestDiff){bestDiff=diff;curIdx=i;}
    });
    const cur = rows[curIdx];
    const curScore = beerIndex(cur.temp,cur.wind,cur.hum,cur.cloud,cur.precipProb,cur.rain,cur.hour);
    const curColor = scoreColor(curScore);

    renderHome(curScore, curColor, cur);

    const dayGroups = buildDayGroups(rows, now);

    const html = `
      ${renderBestTimeCard(rows, now)}
      <div class="day-list">${dayGroups.map(renderDayCard).join('')}</div>
    `;
    document.getElementById('content').innerHTML = html;
    setupStickyHeaders();
  }catch(e){
    document.getElementById('content').innerHTML = `<div class="status">Kunne ikke laste værdata. ${e.message||''}</div>`;
    const verdict = document.getElementById('homeVerdict');
    if(verdict) verdict.textContent = 'Kunne ikke laste værvarselet.';
  }
}

function saveLocation(lat, lon, name){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify({lat,lon,name})); }catch(e){}
}
function loadSavedLocation(){
  try{ return JSON.parse(localStorage.getItem(STORAGE_KEY)); }catch(e){ return null; }
}

// Shows a message in the Search tab and switches to it - used whenever
// location resolution needs the user to step in (denied, unavailable, or
// just never responded).
function showSearchStatus(text){
  const status = document.getElementById('searchStatus');
  status.textContent = text;
  status.hidden = false;
  showView('search');
}

function useGeolocation(){
  if(!navigator.geolocation){
    setLocationName('Lokasjon utilgjengelig');
    showSearchStatus('Denne nettleseren støtter ikke posisjon. Søk etter en by i stedet.');
    return;
  }
  // Some mobile browsers (particularly installed/standalone PWAs on iOS)
  // don't reliably honor the `timeout` option below and can just hang
  // forever instead of calling either callback. This watchdog guarantees
  // the app falls through to manual search no matter what the browser does.
  let settled = false;
  const watchdog = setTimeout(()=>{
    if(settled) return;
    settled = true;
    setLocationName('Fant ikke lokasjon');
    showSearchStatus('Kunne ikke hente posisjonen din. Søk etter en by i stedet.');
  }, 12000);

  navigator.geolocation.getCurrentPosition(async pos=>{
    if(settled) return;
    settled = true;
    clearTimeout(watchdog);
    const {latitude, longitude} = pos.coords;
    const name = await reverseGeocode(latitude, longitude);
    saveLocation(latitude, longitude, name);
    renderAll(latitude, longitude, name);
    showView('home');
  }, err=>{
    if(settled) return;
    settled = true;
    clearTimeout(watchdog);
    setLocationName('Lokasjon avslått');
    showSearchStatus('Tilgang til lokasjon ble avslått. Søk etter en by i stedet.');
  }, {timeout:10000});
}

// --- Home / Details / About / Search page toggle ---
const VIEWS = ['home', 'details', 'about', 'search'];
function showView(view){
  VIEWS.forEach(v=>{
    document.getElementById(v + 'View').hidden = view !== v;
    const btn = document.getElementById(v + 'TabBtn');
    btn.classList.toggle('active', view === v);
    btn.setAttribute('aria-selected', view === v);
  });
}

document.getElementById('homeTabBtn').addEventListener('click', ()=>showView('home'));
document.getElementById('detailsTabBtn').addEventListener('click', ()=>showView('details'));
document.getElementById('aboutTabBtn').addEventListener('click', ()=>showView('about'));
document.getElementById('searchTabBtn').addEventListener('click', ()=>{
  // Toggle: pressing it again while already on Search goes back to Home.
  const isSearchOpen = !document.getElementById('searchView').hidden;
  showView(isSearchOpen ? 'home' : 'search');
});

document.getElementById('useLocBtn').addEventListener('click', ()=>useGeolocation());

// Tomorrow's card can expand from 6-hour blocks to the full hour-by-hour
// view. Delegated on #content since its contents are re-rendered on refresh.
document.getElementById('content').addEventListener('click', e=>{
  const btn = e.target.closest('.day-toggle');
  if(!btn) return;
  const card = btn.closest('.day-card');
  const quarters = card.querySelector('.day-rows[data-mode="quarters"]');
  const hourly = card.querySelector('.day-rows[data-mode="hourly"]');
  const willExpand = btn.getAttribute('aria-expanded') !== 'true';
  quarters.hidden = willExpand;
  hourly.hidden = !willExpand;
  btn.setAttribute('aria-expanded', String(willExpand));
  btn.querySelector('.chev').textContent = willExpand ? '▴' : '▾';
});

let searchTimer;
document.getElementById('cityInput').addEventListener('input', e=>{
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  const dd = document.getElementById('dropdown');
  if(q.length<2){ dd.style.display='none'; return; }
  searchTimer = setTimeout(async ()=>{
    try{
      const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=5&language=no`);
      const j = await r.json();
      if(!j.results || j.results.length===0){ dd.style.display='none'; return; }
      dd.innerHTML = j.results.map(res=>{
        const label = [res.name, res.admin1, res.country].filter(Boolean).join(', ');
        return `<div data-lat="${res.latitude}" data-lon="${res.longitude}" data-name="${res.name}">${label}</div>`;
      }).join('');
      dd.style.display='block';
      dd.querySelectorAll('div').forEach(div=>{
        div.addEventListener('click', ()=>{
          const lat = parseFloat(div.dataset.lat), lon = parseFloat(div.dataset.lon), name = div.dataset.name;
          dd.style.display='none';
          document.getElementById('cityInput').value='';
          document.getElementById('searchStatus').hidden = true;
          saveLocation(lat, lon, name);
          renderAll(lat, lon, name);
          showView('home');
        });
      });
    }catch(err){ dd.style.display='none'; }
  }, 350);
});

// init view - always start on Home
showView('home');
updateHeaderHeightVar();

// init location + weather
const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const saved = loadSavedLocation();
if(saved && saved.lat && saved.lon){
  renderAll(saved.lat, saved.lon, saved.name);
}else if(isStandalone){
  // Installed home-screen web apps on iOS run in a separate context from
  // Safari and often silently ignore a geolocation request that isn't
  // triggered by a direct tap, so it just hangs. Wait for the user to tap
  // "Bruk min lokasjon" (or search) instead of auto-requesting on launch.
  showSearchStatus('Trykk «Bruk min lokasjon» eller søk etter en by for å komme i gang.');
}else{
  useGeolocation();
}

// register service worker for installability (no-ops on file:// during local testing)
if('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')){
  navigator.serviceWorker.register('./service-worker.js').catch(()=>{});
}
