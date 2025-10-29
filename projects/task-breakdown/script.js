// Utility
const uid = () => Math.random().toString(36).slice(2,9);
const clamp = (v,min,max)=> Math.max(min, Math.min(max, v));


// Persistence
const STORAGE_KEY = 'taskGridV2';
const loadState = () => { try{ const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : null; }catch(e){ return null; } };
const saveState = (s) => { try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }catch(e){ alert('Could not save (storage full or disabled).'); } };


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
render();
