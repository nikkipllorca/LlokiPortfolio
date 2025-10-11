// ---------- helpers ----------
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const toArr = v => (v || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371000;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function pct(n){ return Math.round(n*100); }

function scoreMatch(profile, role, venueIndustry) {
  // weights: title 0.5, skills 0.4, industry 0.1
  let score = 0;
  const title = (profile.headline || "").toLowerCase();
  const titleHit = title && role.title ? (title.includes(role.title.toLowerCase()) ? 1 : 0) : 0;
  score += 0.5 * titleHit;

  const skillOverlap = (() => {
    const p = new Set(profile.skills);
    const r = new Set((role.tags || []).map(x => x.toLowerCase()));
    if (!p.size || !r.size) return 0;
    let inter = 0; r.forEach(t => { if (p.has(t)) inter++; });
    return inter / Math.max(p.size, r.size);
  })();
  score += 0.4 * skillOverlap;

  const industryHit = (profile.industry && venueIndustry) ? (profile.industry === venueIndustry) : false;
  score += 0.1 * (industryHit ? 1 : 0);

  return Math.min(1, score);
}

function nowStamp(){
  const d = new Date();
  return d.toLocaleString([], {hour: '2-digit', minute:'2-digit'}) + " · " + d.toLocaleDateString();
}

// ---------- state ----------
let jobs = [];
let userLoc = null;   // {lat, lon}
let selectedRole = null; // {venueId, roleId, title, venue, radius_m, lat, lon}

// ---------- init ----------
(async function init(){
  try {
    const res = await fetch('jobs.json');
    jobs = await res.json();
  } catch(e){
    console.error('Failed to load jobs.json', e);
    jobs = [];
  }

  // wire profile actions
  $('#saveProfile').addEventListener('click', saveProfile);
  $('#loadProfile').addEventListener('click', loadProfile);
  $('#clearProfile').addEventListener('click', clearProfile);

  // location
  $('#getLocation').addEventListener('click', getLocation);

  // matches
  $('#findMatches').addEventListener('click', renderMatches);

  // templater + prompt
  $('#genOutline').addEventListener('click', generateOutline);
  $('#copyPrompt').addEventListener('click', copyPrompt);

  // prefill saved if available
  loadProfile();
})();

// ---------- profile ----------
function readProfileForm(){
  const f = $('#profileForm');
  return {
    name: f.name.value.trim(),
    email: f.email.value.trim(),
    headline: f.headline.value.trim(),
    skills: toArr(f.skills.value),
    industry: null // optional later
  };
}
function writeProfileForm(p){
  const f = $('#profileForm');
  f.name.value = p.name || '';
  f.email.value = p.email || '';
  f.headline.value = p.headline || '';
  f.skills.value = (p.skills || []).join(', ');
}

function saveProfile(){
  const p = readProfileForm();
  localStorage.setItem('checkin_profile', JSON.stringify(p));
  toast('Profile saved ✓');
}
function loadProfile(){
  const raw = localStorage.getItem('checkin_profile');
  if (!raw) { toast('No saved profile'); return; }
  writeProfileForm(JSON.parse(raw));
  toast('Loaded saved profile');
}
function clearProfile(){
  localStorage.removeItem('checkin_profile');
  writeProfileForm({}); toast('Cleared');
}

// ---------- location ----------
function getLocation(){
  const status = $('#locStatus');
  if (!('geolocation' in navigator)) {
    status.textContent = 'Location not supported on this device.';
    return;
  }
  status.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    pos => {
      userLoc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      status.textContent = `OK · ${userLoc.lat.toFixed(5)}, ${userLoc.lon.toFixed(5)} · ${nowStamp()}`;
    },
    err => {
      status.textContent = 'Location denied or unavailable.';
      console.warn(err);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

// ---------- matches ----------
function renderMatches(){
  const container = $('#matches');
  container.innerHTML = '';
  const p = readProfileForm();
  const min = parseFloat($('#minScore').value || '0.7');

  const items = [];
  jobs.forEach(v => {
    (v.roles || []).forEach(r => {
      const s = scoreMatch(p, r, v.industry);
      if (s >= min) {
        items.push({
          venueId: v.id, venue: v.venue, roleId: r.id, role: r.title, tags: r.tags || [],
          score: s, lat: v.lat, lon: v.lon, radius_m: v.radius_m
        });
      }
    });
  });

  if (!items.length) {
    container.innerHTML = `<div class="muted">No matches at this threshold. Try lowering the filter or adding skills.</div>`;
    return;
  }

  items.sort((a,b)=> b.score - a.score);

  for (const it of items){
    const distStr = (() => {
      if (!userLoc || it.lat == null || it.lon == null) return `<span class="badge warn">distance unknown</span>`;
      const m = haversineMeters(userLoc.lat,userLoc.lon,it.lat,it.lon);
      const inRange = it.radius_m ? (m <= it.radius_m) : false;
      return inRange
        ? `<span class="badge ok">in range · ${Math.round(m)} m</span>`
        : `<span class="badge warn">${Math.round(m)} m away</span>`;
    })();

    const roleTags = it.tags.map(t => `<span class="tag">${t}</span>`).join(' ');

    const canCheckIn = (userLoc && it.lat != null && it.lon != null)
      ? (haversineMeters(userLoc.lat,userLoc.lon,it.lat,it.lon) <= (it.radius_m || 200))
      : false;

    const el = document.createElement('div');
    el.className = 'venue';
    el.innerHTML = `
      <h3>${it.venue} · <span class="small">${it.role}</span></h3>
      <div class="row"><span class="badge">match ${pct(it.score)}%</span> ${distStr}</div>
      <div class="mt8">${roleTags}</div>
      <div class="row mt8">
        <button class="btn" data-act="select" data-key="${it.venueId}::${it.roleId}">Select role</button>
        <button class="btn-ghost" data-act="checkin" data-key="${it.venueId}::${it.roleId}" ${canCheckIn? '' : 'disabled'}>Check in</button>
      </div>
    `;
    container.appendChild(el);
  }

  // wire buttons
  container.addEventListener('click', onMatchAction, { once: true });
}

function onMatchAction(e){
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const [venueId, roleId] = (btn.dataset.key || '').split('::');
  const v = jobs.find(x => x.id === venueId);
  const r = v?.roles?.find(x => x.id === roleId);
  if (!v || !r) return;

  selectedRole = {
    venueId, roleId, title: r.title, venue: v.venue,
    lat: v.lat, lon: v.lon, radius_m: v.radius_m
  };

  if (btn.dataset.act === 'select') {
    $('#genOutline').disabled = false;
    $('#copyPrompt').disabled = false;
    toast(`Selected: ${r.title} @ ${v.venue}`);
  }

  if (btn.dataset.act === 'checkin') {
    handleCheckIn();
  }
}

// ---------- check-in (badge + optional Netlify form) ----------
function handleCheckIn(){
  const p = readProfileForm();
  if (!p.email) { toast('Add your email to your profile to create a badge'); return; }
  if (!userLoc) { toast('Use your location first'); return; }
  if (!selectedRole) { toast('Select a role first'); return; }

  // create a simple token (not secure – MVP only)
  const payload = {
    name: p.name || 'Candidate',
    email: p.email,
    venue: selectedRole.venue,
    role: selectedRole.title,
    ts: Date.now()
  };
  const token = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const url = new URL(window.location.origin + '/projects/checkin/badge.html');
  url.searchParams.set('token', token);

  // optional: submit to Netlify forms “checkin”
  const formData = new FormData();
  formData.append('form-name', 'checkin');
  formData.append('email', p.email);
  formData.append('name', p.name || '');
  formData.append('venue', selectedRole.venue);
  formData.append('role', selectedRole.title);
  formData.append('when', new Date(payload.ts).toISOString());
  try { navigator.sendBeacon('/', formData); } catch {}

  window.location.href = url.toString();
}

// ---------- templater ----------
function generateOutline(){
  if (!selectedRole){ toast('Select a role first'); return; }
  const p = readProfileForm();
  const bullets = [
    `Delivered consistent, guest-first service leveraging ${p.skills.slice(0,3).join(', ')}.`,
    `Handled high-volume shifts with accurate POS entries and cash handling.`,
    `Collaborated with team to maintain bar readiness (stocking, prep, closing).`,
    `Resolved issues quickly with clear, friendly communication.`
  ];
  const out = [
    `Target role: ${selectedRole.title} @ ${selectedRole.venue}`,
    ``,
    `Summary`,
    `• ${p.headline || 'Service-oriented FOH professional with strong bar experience.'}`,
    ``,
    `Core Skills`,
    `• ${p.skills.join(' · ') || 'customer service · POS · cash handling'}`,
    ``,
    `Experience Highlights`,
    ...bullets.map(b => `• ${b}`)
  ].join('\n');

  $('#outline').textContent = out;
}

function copyPrompt(){
  if (!selectedRole){ toast('Select a role first'); return; }
  const p = readProfileForm();
  const prompt = [
    `You are an expert resume/CV editor for hospitality roles.`,
    `Job: ${selectedRole.title} at ${selectedRole.venue}.`,
    `Candidate headline: ${p.headline || '(none provided)'}.`,
    `Candidate skills: ${p.skills.join(', ') || '(none)'}.`,
    `Task: produce 1) a concise 3-sentence resume summary tailored to this job;`,
    `2) 4 bullet points quantifying impact; 3) a short CV section layout.`,
    `Tone: professional, energetic, concise; ATS-friendly; no fluff.`,
  ].join(' ');
  navigator.clipboard.writeText(prompt).then(()=>{
    const t = $('#copyToast'); t.hidden = false; setTimeout(()=> t.hidden = true, 1800);
  });
}

// ---------- toast ----------
function toast(msg){
  let el = document.querySelector('.toast');
  if (!el){ el = document.createElement('div'); el.className='toast'; document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false; setTimeout(()=> el.hidden = true, 1800);
}
