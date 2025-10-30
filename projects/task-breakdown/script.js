// Utility
const uid = () => Math.random().toString(36).slice(2,9);
const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));

// Persistence
const STORAGE_KEY = 'taskGridV2';
const THEME_KEY = 'theme';
const loadState = () => { try{ const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; }catch(e){ return null; } };
const saveState = (s) => { try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }catch(e){ alert('Could not save (storage full or disabled).'); } };
const loadTheme = () => localStorage.getItem(THEME_KEY) || 'dark';
const saveTheme = (t) => { try{ localStorage.setItem(THEME_KEY, t); }catch(e){} };

// App State
const MAX_DEPTH = 5;
const MIN_FONT = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--min-font')) || 10;
const DEPTH_SCALE = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--depth-scale')) || 0.85;

let state = loadState() || {
  root: { id: uid(), title: 'Tap to name goal', desc:'', diff:3, pri:1, completed:false, depth:0, gridCols:1, children: [] },
  showCompleted: true
};

function countTasks(node){ return 1 + (node.children||[]).reduce((a,c)=> a+countTasks(c), 0); }

// Rendering
const app = document.getElementById('app');

function computeFontSize(depth){
  const base = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--base-font')) || 16;
  const size = base * Math.pow(DEPTH_SCALE, depth);
  return Math.round(size);
}
function canBreakDown(node){
  if(node.completed) return false;
  if(node.depth >= MAX_DEPTH) return false;
  const nextFont = computeFontSize(node.depth+1);
  return nextFont >= MIN_FONT;
}

function render(){
  document.body.classList.toggle('hide-completed', !state.showCompleted);
  app.innerHTML = '';
  const rootEl = renderTask(state.root);
  app.appendChild(rootEl);
  saveState(state);
}

function renderTask(node){
  const el = document.createElement('section');
  el.className = 'task'+(node.completed?' completed':'');
  el.dataset.id = node.id; el.dataset.depth = node.depth;
  el.style.setProperty('--title-size', computeFontSize(node.depth)+ 'px');

  // head
  const head = document.createElement('div'); head.className='task-head';
  const depthChip = document.createElement('span'); depthChip.className='depth'; depthChip.textContent = `Depth ${node.depth}`;

  const title = document.createElement('input'); title.className='title'; title.value = node.title; title.setAttribute('aria-label','Task title');
  title.addEventListener('change', ()=>{ node.title = title.value.trim()||'Untitled'; render(); });

  const actions = document.createElement('div'); actions.className='actions';

  const doneLbl = document.createElement('label'); doneLbl.className='button'; doneLbl.title='Mark complete';
  const cbox = document.createElement('input'); cbox.type='checkbox'; cbox.checked = !!node.completed; cbox.addEventListener('change', ()=>{ node.completed = cbox.checked; render(); });
  doneLbl.append('✅', cbox, document.createTextNode(' Done'));

  const editBtn = document.createElement('button'); editBtn.textContent = '✎ Edit'; editBtn.title='Edit details';
  editBtn.addEventListener('click', ()=> openForm(node));

  const splitBtn = document.createElement('button'); splitBtn.textContent='↔︎ Split';
  splitBtn.disabled = !canBreakDown(node); splitBtn.title = splitBtn.disabled? 'Too small to split':'Split into two';
  splitBtn.addEventListener('click', ()=> doBreakdown(node));

  actions.append(doneLbl, editBtn, splitBtn);

  // If node is split, add an inline "× Unsplit" action to revert
  if (node.children && node.children.length) {
    const unsplitBtn = document.createElement('button');
    unsplitBtn.className = 'unsplit';
    unsplitBtn.title = 'Cancel split and revert this card';
    unsplitBtn.textContent = '× Unsplit';
    unsplitBtn.addEventListener('click', (e)=>{ e.stopPropagation(); doUnsplit(node); });
    actions.append(unsplitBtn);
  }

  head.append(depthChip, title, actions);
  el.append(head);

  // body
  if(node.children && node.children.length){
    const grid = document.createElement('div'); grid.className='task-grid';
    const cols = node.gridCols; grid.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
    node.children.forEach(child=> grid.appendChild(renderTask(child)) );
    el.append(grid);
  }else{
    const body = document.createElement('div'); body.className='leaf-body';
    const text = document.createElement('div'); text.className = 'leaf-text';
    text.style.fontSize = `clamp(${MIN_FONT}px, ${computeFontSize(node.depth)}px, 5vw)`;
    text.textContent = node.title;
    body.append(text);
    el.append(body);
    // tap to split into TWO or open form
    body.addEventListener('click', ()=>{ if(canBreakDown(node)) doBreakdown(node); else openForm(node); });
    body.addEventListener('contextmenu', (e)=>{ e.preventDefault(); openForm(node); });
  }

  // Hover chain highlight
  el.addEventListener('mouseenter', ()=> highlightChain(node.id, true));
  el.addEventListener('mouseleave', ()=> highlightChain(node.id, false));

  return el;
}

function highlightChain(id, on){
  let el = app.querySelector(`[data-id="${id}"]`);
  while(el){
    el.classList.toggle('highlight', on);
    const d = parseInt(el.dataset.depth||'0');
    if(d===0) break;
    el = el.parentElement?.closest(`.task[data-depth="${d-1}"]`) || null;
  }
}

// TWO-way breakdown (two columns)
function doBreakdown(node){
  if(!canBreakDown(node)) return;
  node.gridCols = 2; // two cards side by side
  node.children = Array.from({length: 2}, (_,i)=> ({
    id: uid(), title: `${node.title} – ${i+1}`, desc:'', diff:3, pri:1, completed:false, depth: node.depth+1, gridCols:1, children: []
  }));
  render();
}

// Unsplit: remove children and revert to leaf
function doUnsplit(node){
  node.children = [];
  node.gridCols = 1;
  render();
}

// Form modal (create/edit)
const dlg = document.getElementById('taskForm');
const form = document.getElementById('taskFormEl');
const tf_title = document.getElementById('tf_title');
const tf_desc  = document.getElementById('tf_desc');
const tf_diff  = document.getElementById('tf_diff');
const tf_pri   = document.getElementById('tf_pri');
const tf_diff_val = document.getElementById('tf_diff_val');
const tf_pri_val  = document.getElementById('tf_pri_val');
let editingNode = null;

function openForm(node){
  editingNode = node;
  tf_title.value = node.title || '';
  tf_desc.value  = node.desc || '';
  tf_diff.value  = node.diff || 3; tf_diff_val.textContent = tf_diff.value;
  const maxPri = Math.max(1, countTasks(state.root));
  tf_pri.max = String(maxPri);
  tf_pri.value = clamp(node.pri||1, 1, maxPri); tf_pri_val.textContent = tf_pri.value;
  dlg.showModal();
}

tf_diff.addEventListener('input', ()=> tf_diff_val.textContent = tf_diff.value);
tf_pri.addEventListener('input', ()=> tf_pri_val.textContent = tf_pri.value);

dlg.addEventListener('close', ()=>{
  if(dlg.returnValue === 'ok' && editingNode){
    editingNode.title = tf_title.value.trim() || 'Untitled';
    editingNode.desc  = tf_desc.value.trim();
    editingNode.diff  = parseInt(tf_diff.value,10);
    editingNode.pri   = parseInt(tf_pri.value,10);
    editingNode = null; render();
  } else { editingNode = null; }
});

// Toolbar buttons
document.getElementById('newRoot').addEventListener('click', ()=>{
  state.root = { id: uid(), title: 'New Goal', desc:'', diff:3, pri:1, completed:false, depth:0, gridCols:1, children: [] };
  render();
});
document.getElementById('toggleCompleted').addEventListener('change', (e)=>{ state.showCompleted = e.target.checked; render(); });

// Theme
const themeToggle = document.getElementById('toggleTheme');
const applyTheme = (t)=>{ document.documentElement.setAttribute('data-theme', t); saveTheme(t); themeToggle.checked = (t==='light'); };
applyTheme(loadTheme());
themeToggle.addEventListener('change', ()=> applyTheme(themeToggle.checked ? 'light' : 'dark'));

// Screenshot Preview (no download)
const shotDlg = document.getElementById('shotPreview');
const shotBody = document.getElementById('previewBody');
document.getElementById('closePreview').addEventListener('click', ()=> shotDlg.close());

document.getElementById('screenshot').addEventListener('click', async ()=>{
  // lazy-load html2canvas for crisp preview
  if(!window.html2canvas){
    try{
      await loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js');
    }catch(e){
      alert('Preview needs network access to load html2canvas.');
      return;
    }
  }
  const target = document.getElementById('app');
  const canvas = await window.html2canvas(target, { backgroundColor: getComputedStyle(document.body).backgroundColor, scale: 2 });
  shotBody.innerHTML = '';
  const img = document.createElement('img');
  img.alt = 'Task preview';
  img.src = canvas.toDataURL('image/png');
  shotBody.appendChild(img);
  shotDlg.showModal();
});

// Clear all
const confirmDlg = document.getElementById('confirmClear');
document.getElementById('clearAll').addEventListener('click', ()=>{ confirmDlg.showModal(); });
document.getElementById('cancelClear').addEventListener('click', ()=> confirmDlg.close('cancel'));
document.getElementById('okClear').addEventListener('click', ()=>{
  localStorage.removeItem(STORAGE_KEY);
  state = { root: { id: uid(), title:'Start here', desc:'', diff:3, pri:1, completed:false, depth:0, gridCols:1, children:[] }, showCompleted:true };
  confirmDlg.close('ok'); render();
});

function loadScript(src){ return new Promise((res,rej)=>{ const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=rej; document.head.appendChild(s); }); }

// Initialize
render();


