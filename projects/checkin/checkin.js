// ============ Helpers ============
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const toArr = v => (v||"").split(",").map(s=>s.trim()).filter(Boolean).map(s=>s.toLowerCase());

function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = d => d * Math.PI / 180, R = 6371000;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
const pct = n => Math.round(n*100);

const STORAGE_KEY = 'checkin_profile_v2';
const MATCH_KEY   = 'checkin_prev_strong_matches';

function toast(msg){
  let el = $('.toast');
  if (!el){ el = document.createElement('div'); el.className='toast'; document.body.appendChild(el); }
  el.textContent = msg; el.hidden = false; setTimeout(()=> el.hidden = true, 1800);
}
function dl(filename, text){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text],{type:'application/json'}));
  a.download = filename; a.click(); setTimeout(()=> URL.revokeObjectURL(a.href), 1000);
}
function nowStamp(){
  const d = new Date();
  return d.toLocaleString([], {hour:'2-digit',minute:'2-digit'}) + ' · ' + d.toLocaleDateString();
}

// ============ State ============
let jobs = [];
let userLoc = null; // {lat, lon}
let selectedRole = null;
let hasAccount = false; // becomes true when Save Code created or file loaded

// ============ Init ============
(async function init(){
  try { jobs = await (await fetch('jobs.json')).json(); } catch(e){ jobs = []; }

  // Wire profile
  $('#saveProfile').addEventListener('click', saveProfile);
  $('#loadProfile').addEventListener('click', loadProfile);
  $('#clearProfile').addEventListener('click', clearProfile);

  // Experience
  $('#addExp').addEventListener('click', addExperienceCard);
  $('#exportProfile').addEventListener('click', createSaveCode);
  $('#importProfile').addEventListener('change', importProfileFile);

  // Location & matches
  $('#getLocation').addEventListener('click', getLocation);
  $('#findMatches').addEventListener('click', renderMatches);

  // Resume/CV
  $('#genOutline').addEventListener('click', generateOutline);
  $('#copyPrompt').addEventListener('click', copyPrompt);

  // Prefill from storage
  const stored = readStorage();
  if (stored) {
    writeProfileForm(stored);
    stored.experience?.forEach(addExperienceCardFromData);
    hasAccount = !!stored.saveCode;
    reflectLockState();
  }

  // Prefill digest email from profile
  const pf = readProfileForm();
  if (pf.email) $('#digestEmail').value = pf.email;
})();

// ============ Profile I/O ============
function readStorage(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || ''); } catch { return null; }
}
function writeStorage(data){
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
function readProfileForm(){
  const f = $('#profileForm');
  const experience = collectExperience();
  return {
    name: f.name.value.trim(),
    email: f.email.value.trim(),
    headline: f.headline.value.trim(),
    skills: toArr(f.skills.value),
    experience,
    saveCode: (readStorage()?.saveCode) || null
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
  writeStorage(p);
  toast('Profile saved ✓');
}
function loadProfile(){
  const s = readStorage();
  if (!s){ toast('No saved profile'); return; }
  // reset experience list then re-add
  $('#expList').innerHTML = '';
  writeProfileForm(s);
  (s.experience || []).forEach(addExperienceCardFromData);
  hasAccount = !!s.saveCode; reflectLockState();
  toast('Loaded saved profile');
}
function clearProfile(){
  localStorage.removeItem(STORAGE_KEY);
  writeProfileForm({}); $('#expList').innerHTML = ''; hasAccount = false; reflectLockState();
  toast('Cleared');
}

// ============ Experience cards ============
function addExperienceCard(){
  const tpl = $('#expTpl').content.cloneNode(true);
  const node = tpl.querySelector('.exp-card');
  wireExpCard(node);
  $('#expList').appendChild(node);
  node.open = true;
}
function addExperienceCardFromData(item){
  const tpl = $('#expTpl').content.cloneNode(true);
  const node = tpl.querySelector('.exp-card');
  wireExpCard(node);

  node.querySelector('.exp-employer').value = item.employer || '';
  node.querySelector('.exp-role').value = item.role || '';
  if (item.start) node.querySelector('.exp-start').value = item.start;
  if (item.end)   node.querySelector('.exp-end').value   = item.end;
  node.querySelector('.exp-city').value = item.city || '';
  node.querySelector('.exp-bullets').value = (item.bullets || []).join('\n');
  node.querySelector('.exp-skills').value  = (item.skills || []).join(', ');

  refreshExpHeader(node);
  $('#expList').appendChild(node);
}
function wireExpCard(node){
  node.addEventListener('toggle', ()=> refreshExpHeader(node));
  node.querySelectorAll('input,textarea').forEach(inp => {
    inp.addEventListener('input', ()=> refreshExpHeader(node));
  });
  node.querySelector('.exp-delete').addEventListener('click', ()=>{
    node.remove(); toast('Experience removed');
  });
}
function refreshExpHeader(node){
  const role = node.querySelector('.exp-role').value.trim() || '(new role)';
  const employer = node.querySelector('.exp-employer').value.trim() || '';
  const start = node.querySelector('.exp-start').value;
  const end = node.querySelector('.exp-end').value;
  const title = employer ? `${role} @ ${employer}` : role;
  const dates = (start || end) ? `${start || '------'} — ${end || 'Present'}` : '';
  node.querySelector('.exp-title').textContent = title;
  node.querySelector('.exp-dates').textContent = dates;
}
function collectExperience(){
  return $$('#expList .exp-card').map(node => ({
    employer: node.querySelector('.exp-employer').value.trim(),
    role: node.querySelector('.exp-role').value.trim(),
    start: node.querySelector('.exp-start').value || null,
    end: node.querySelector('.exp-end').value || null,
    city: node.querySelector('.exp-city').value.trim(),
    bullets: node.querySelector('.exp-bullets').value.split('\n').map(s=>s.trim()).filter(Boolean),
    skills: toArr(node.querySelector('.exp-skills').value)
  }));
}

// ============ Save Code (Option A) ============
function createSaveCode(){
  const p = readProfileForm();
  // Generate short code, attach to profile, download JSON
  const code = 'LL-' + Math.random().toString(36).slice(2,6).toUpperCase() + '-' + Math.random().toString(36).slice(2,4).toUpperCase();
  p.saveCode = code; hasAccount = true; reflectLockState();
  writeStorage(p);
  const filename = `lloki-profile-${code}.json`;
  dl(filename, JSON.stringify(p, null, 2));
  toast(`Save Code created: ${code}`);
}
function importProfileFile(ev){
  const file = ev.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      // rehydrate UI
      writeProfileForm(data);
      $('#expList').innerHTML = '';
      (data.experience || []).forEach(addExperienceCardFromData);
      hasAccount = !!data.saveCode; reflectLockState();
      toast('Save file loaded ✓');
      if (data.email) $('#digestEmail').value = data.email;
    } catch(e){ toast('Invalid save file'); }
  };
  reader.readAsText(file);
  ev.target.value = '';
}
function reflectLockState(){
  const locked = !hasAccount;
  $('#lockBadge').style.display = locked ? 'inline-block' : 'none';
  $('#genOutline').disabled = locked;
  $('#copyPrompt').disabled = locked;
}

// ============ Location ============
function getLocation(){
  const el = $('#locStatus');
  if (!('geolocation' in navigator)){ el.textContent = 'No geolocation support.'; return; }
  el.textContent = 'Locating…';
  navigator.geolocation.getCurrentPosition(
    pos => {
      userLoc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
      el.textContent = `OK · ${userLoc.lat.toFixed(5)}, ${userLoc.lon.toFixed(5)} · ${nowStamp()}`;
    },
    err => { el.textContent = 'Location denied or unavailable.'; console.warn(err); },
    { enableHighAccuracy:true, timeout:10000, maximumAge:0 }
  );
}

// ============ Matching ============
function scoreMatch(profile, role, venueIndustry){
  // Base weights: title 0.45, skills 0.4, industry 0.05
  let score = 0;
  const title = (profile.headline || '').toLowerCase();
  const titleHit = title && role.title ? (title.includes(role.title.toLowerCase()) ? 1 : 0) : 0;
  score += 0.45 * titleHit;

  const skillOverlap = (() => {
    const p = new Set(profile.skills);
    const r = new Set((role.tags || []).map(x=>x.toLowerCase()));
    if (!p.size || !r.size) return 0;
    let inter = 0; r.forEach(t=>{ if (p.has(t)) inter++; });
    return inter / Math.max(p.size, r.size);
  })();
  score += 0.4 * skillOverlap;

  // Industry bonus
  const industriesFromExp = new Set((profile.experience||[]).flatMap(e=>e.skills||[])); // lightweight proxy
  const industryHit = !!venueIndustry && (profile.headline||'').toLowerCase().includes(venueIndustry);
  score += 0.05 * (industryHit ? 1 : 0);

  // Experience boosts:
  const lastTwo = (profile.experience || []).slice(-2);
  const roleNames = lastTwo.map(e => (e.role||'').toLowerCase());
  if (roleNames.some(n => n && role.title && n.includes(role.title.toLowerCase()))) score += 0.06;

  const prioritySkills = new Set((profile.skills || []).slice(0,3)); // top 3 as "priority"
  const roleSkills = new Set((role.tags || []).map(x=>x.toLowerCase()));
  let pHit = 0; prioritySkills.forEach(s => { if (roleSkills.has(s)) pHit++; });
  score += Math.min(0.04, pHit*0.02);

  return Math.min(1, score);
}

function renderMatches(){
  const container = $('#matches'); container.innerHTML = '';
  const p = readProfileForm(); const min = parseFloat($('#minScore').value || '0.7');

  const items = [];
  jobs.forEach(v => (v.roles||[]).forEach(r => {
    const s = scoreMatch(p, r, v.industry);
    if (s >= min) {
      items.push({
        venueId: v.id, venue: v.venue, roleId: r.id, role: r.title, tags: r.tags||[],
        score: s, lat: v.lat, lon: v.lon, radius_m: v.radius_m
      });
    }
  }));
  items.sort((a,b)=> b.score - a.score);

  if (!items.length){
    container.innerHTML = `<div class="muted">No matches. Try lowering the threshold or adding skills/experience.</div>`;
    notifyNewMatches([]); // clears baseline
    return;
  }

  for (const it of items){
    const distBadge = (() => {
      if (!userLoc || it.lat==null || it.lon==null) return `<span class="badge warn">distance unknown</span>`;
      const m = haversineMeters(userLoc.lat,userLoc.lon,it.lat,it.lon);
      const inRange = it.radius_m ? (m <= it.radius_m) : false;
      return inRange ? `<span class="badge ok">in range · ${Math.round(m)} m</span>`
                     : `<span class="badge warn">${Math.round(m)} m away</span>`;
    })();

    const el = document.createElement('div');
    el.className = 'venue';
    el.style.border = '1px solid #2a2346';
    el.style.borderRadius = '12px';
    el.style.padding = '12px';
    el.style.background = '#0b0a17';
    const roleTags = it.tags.map(t=> `<span class="badge">${t}</span>`).join(' ');
    const canCheckIn = (userLoc && it.lat!=null && it.lon!=null)
      ? (haversineMeters(userLoc.lat,userLoc.lon,it.lat,it.lon) <= (it.radius_m || 200))
      : false;

    el.innerHTML = `
      <h3 style="margin:0 0 6px 0">${it.venue} · <span class="muted">${it.role}</span></h3>
      <div class="row"><span class="badge">match ${pct(it.score)}%</span> ${distBadge} <span class="badge">based on your experience</span></div>
      <div class="row mt8" style="gap:6px">${roleTags}</div>
      <div class="row mt8">
        <button class="btn neon" data-act="select" data-key="${it.venueId}::${it.roleId}">Select role</button>
        <button class="btn ghost" data-act="checkin" data-key="${it.venueId}::${it.roleId}" ${canCheckIn?'':'disabled'}>Check in</button>
      </div>
    `;
    container.appendChild(el);
  }

  // notify on *new* strong matches
  notifyNewMatches(items.map(i => `${i.venueId}:${i.roleId}`));

  // wire actions (one listener for this render)
  container.addEventListener('click', onMatchAction, { once:true });
}

function notifyNewMatches(currentKeys){
  const prev = JSON.parse(localStorage.getItem(MATCH_KEY) || '[]');
  const added = currentKeys.filter(k => !prev.includes(k));
  if (added.length) toast(`New potential match: ${added[0].split(':')[1]} (see Matches)`);
  localStorage.setItem(MATCH_KEY, JSON.stringify(currentKeys));
}

function onMatchAction(e){
  const btn = e.target.closest('button[data-act]'); if (!btn) return;
  const [venueId, roleId] = (btn.dataset.key || '').split('::');
  const v = jobs.find(x => x.id === venueId);
  const r = v?.roles?.find(x => x.id === roleId);
  if (!v || !r) return;

  selectedRole = { venueId, roleId, title: r.title, venue: v.venue, lat: v.lat, lon: v.lon, radius_m: v.radius_m };

  if (btn.dataset.act === 'select'){
    $('#genOutline').disabled = !hasAccount;
    $('#copyPrompt').disabled = !hasAccount;
    toast(`Selected: ${r.title} @ ${v.venue}`);
  }
  if (btn.dataset.act === 'checkin'){
    handleCheckIn();
  }
}

// ============ Check-in / Badge ============
function handleCheckIn(){
  const p = readProfileForm();
  if (!p.email){ toast('Add your email to Profile first'); return; }
  if (!userLoc){ toast('Use your location first'); return; }
  if (!selectedRole){ toast('Select a role first'); return; }

  const payload = { name: p.name||'Candidate', email:p.email, venue:selectedRole.venue, role:selectedRole.title, ts:Date.now() };
  const token = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  const url = new URL(window.location.origin + '/projects/checkin/badge.html');
  url.searchParams.set('token', token);

  // Netlify forms: send lightweight beacon
  const fd = new FormData();
  fd.append('form-name','checkin');
  fd.append('email', p.email); fd.append('name', p.name || '');
  fd.append('venue', selectedRole.venue); fd.append('role', selectedRole.title);
  fd.append('when', new Date(payload.ts).toISOString());
  try { navigator.sendBeacon('/', fd); } catch {}

  location.href = url.toString();
}

// ============ Résumé / CV ============
function generateOutline(){
  if (!hasAccount){ toast('Create Save Code to unlock'); return; }
  if (!selectedRole){ toast('Select a role from Matches'); return; }
  const p = readProfileForm();

  // Pull most relevant experience (simple heuristic)
  const exp = (p.experience||[]).slice().reverse();
  const rel = exp.find(e => (e.role||'').toLowerCase().includes(selectedRole.title.toLowerCase())) || exp[0];

  const bulletsBase = (rel?.bullets || []).slice(0,4);
  const skillsLine = (rel?.skills || p.skills || []).slice(0,6).join(' · ') || 'customer service · POS · cash handling';

  const out = [
    `Target role: ${selectedRole.title} @ ${selectedRole.venue}`,
    ``,
    `Summary`,
    `• ${p.headline || 'Service-forward FOH professional with high-volume experience and strong guest focus.'}`,
    ``,
    `Core Skills`,
    `• ${skillsLine}`,
    ``,
    `Experience Highlights`,
    ...bulletsBase.map(b => `• ${b}`)
  ].join('\n');

  $('#outline').textContent = out;
}
function copyPrompt(){
  if (!hasAccount || !selectedRole){ toast('Select role & unlock first'); return; }
  const p = readProfileForm();
  const lastTwo = (p.experience||[]).slice(-2);
  const prompt = [
    `You are an expert resume & CV editor for hospitality and tech-adjacent roles.`,
    `Job: ${selectedRole.title} at ${selectedRole.venue}.`,
    `Candidate headline: ${p.headline || '(none)'}.`,
    `Top skills: ${(p.skills||[]).slice(0,6).join(', ') || '(none)'}.`,
    `Recent roles: ${lastTwo.map(e => `${e.role} @ ${e.employer}`).join('; ') || '(none)'} .`,
    `Task: produce (1) a concise 3-sentence resume summary tailored to this job;`,
    `(2) 4 impact bullets with metrics; (3) a short CV layout with sections and headings.`,
    `Style: ATS-friendly, energetic, concrete, no fluff.`
  ].join(' ');
  navigator.clipboard.writeText(prompt).then(()=>{
    const t = $('#copyToast'); t.hidden = false; setTimeout(()=> t.hidden = true, 1600);
  });
}

