// Satoshi’s Stocks — updates: header layout, date+time, receipt cell, trade estimate, robust top-position refresh

const SATOSHI_BTC = 1_100_000;
const BTC_CACHE_TTL = 10 * 60 * 1000;
const QUOTES_CACHE_TTL = 10 * 60 * 1000;
const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';

const TICKERS = [
  "AAPL","MSFT","GOOGL","AMZN","NVDA","META","BRK-B","LLY","AVGO","JPM",
  "V","XOM","WMT","JNJ","UNH","MA","PG","ORCL","COST","HD",
  "BAC","PEP","MRK","KO","CVX","ABBV","TSM","ASML","ACN","DIS",
  "NFLX","ADBE","TMO","CSCO","CRM","NEE","AMD","MCD","LIN","CAT",
  "TM","SAP","PFE","WFC","IBM","TXN","INTU","COP","DHR","AMAT"
];

const SNAPSHOT_USD = {
  "AAPL":225,"MSFT":417,"GOOGL":169,"AMZN":182,"NVDA":110,"META":510,"BRK-B":450,"LLY":900,"AVGO":1700,"JPM":210,
  "V":280,"XOM":110,"WMT":72,"JNJ":160,"UNH":480,"MA":420,"PG":165,"ORCL":145,"COST":920,"HD":345,
  "BAC":42,"PEP":170,"MRK":128,"KO":65,"CVX":155,"ABBV":170,"TSM":170,"ASML":1050,"ACN":340,"DIS":110,
  "NFLX":600,"ADBE":520,"TMO":570,"CSCO":55,"CRM":285,"NEE":75,"AMD":140,"MCD":290,"LIN":450,"CAT":330,
  "TM":210,"SAP":190,"PFE":32,"WFC":56,"IBM":175,"TXN":190,"INTU":620,"COP":115,"DHR":255,"AMAT":220
};

let btcPriceUSD = null;
let remainingUSD = 0;
let spentUSD = 0;
const portfolio = {};
const prices = {};

const $ = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const fmtUSD  = n => n==null||Number.isNaN(n) ? '—' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(n);
const fmtUSD2 = n => n==null||Number.isNaN(n) ? '—' : new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:2}).format(n);
const fmtBTC  = n => n==null||Number.isNaN(n) ? '—' : new Intl.NumberFormat('en-US',{maximumFractionDigits:6}).format(n);

function getCache(k){ try{const r=localStorage.getItem(k); if(!r) return null; const {timestamp,data}=JSON.parse(r); return {timestamp,data};}catch{return null;} }
function setCache(k,data){ localStorage.setItem(k, JSON.stringify({timestamp:Date.now(), data})); }

async function fetchBTCPrice(){
  const cache=getCache('btcPrice');
  if(cache && Date.now()-cache.timestamp < BTC_CACHE_TTL) return cache.data;
  const res=await fetch(COINGECKO_URL,{cache:'no-store'});
  if(!res.ok) throw new Error('BTC fetch failed');
  const j=await res.json(); const p=j?.bitcoin?.usd; if(!p) throw new Error('BTC price missing');
  setCache('btcPrice',p); return p;
}

async function fetchQuotes(symbols){
  const cache=getCache('quotes50');
  if(cache && Date.now()-cache.timestamp < QUOTES_CACHE_TTL) return cache.data;
  const url='https://query1.finance.yahoo.com/v7/finance/quote?symbols='+encodeURIComponent(symbols.join(','));
  const res=await fetch(url,{cache:'no-store'}).catch(()=>null);
  if(!res || !res.ok) throw new Error('Quotes fetch failed');
  const j=await res.json().catch(()=>null);
  const arr=j?.quoteResponse?.result || [];
  const out={};
  for(const r of arr){
    if(r.symbol && typeof r.regularMarketPrice==='number') out[r.symbol]=r.regularMarketPrice;
  }
  if(Object.keys(out).length===0) throw new Error('No quotes in response');
  setCache('quotes50',out); return out;
}

const NAME_MAP = {
  "AAPL":"Apple","MSFT":"Microsoft","GOOGL":"Alphabet","AMZN":"Amazon","NVDA":"NVIDIA","META":"Meta Platforms","BRK-B":"Berkshire Hathaway",
  "LLY":"Eli Lilly","AVGO":"Broadcom","JPM":"JPMorgan Chase","V":"Visa","XOM":"ExxonMobil","WMT":"Walmart","JNJ":"Johnson & Johnson","UNH":"UnitedHealth",
  "MA":"Mastercard","PG":"Procter & Gamble","ORCL":"Oracle","COST":"Costco","HD":"Home Depot","BAC":"Bank of America","PEP":"PepsiCo","MRK":"Merck",
  "KO":"Coca-Cola","CVX":"Chevron","ABBV":"AbbVie","TSM":"Taiwan Semi (ADR)","ASML":"ASML (ADR)","ACN":"Accenture","DIS":"Disney","NFLX":"Netflix",
  "ADBE":"Adobe","TMO":"Thermo Fisher","CSCO":"Cisco","CRM":"Salesforce","NEE":"NextEra Energy","AMD":"AMD","MCD":"McDonald’s","LIN":"Linde","CAT":"Caterpillar",
  "TM":"Toyota (ADR)","SAP":"SAP (ADR)","PFE":"Pfizer","WFC":"Wells Fargo","IBM":"IBM","TXN":"Texas Instruments","INTU":"Intuit","COP":"ConocoPhillips",
  "DHR":"Danaher","AMAT":"Applied Materials"
};

function computeBalances(){ remainingUSD = SATOSHI_BTC * btcPriceUSD - spentUSD; }

function computeTopPosition(){
  let top=null;
  for(const sym of Object.keys(portfolio)){
    const shares=portfolio[sym]||0;
    const price=prices[sym] ?? SNAPSHOT_USD[sym] ?? 0;
    const total=shares*price;
    if(!top || total>top.total) top={sym,total,shares};
  }
  if(!top) return '—';
  const name=NAME_MAP[top.sym]||top.sym;
  return `${name} (${top.sym}) — ${top.shares} ${top.shares===1?'share':'shares'}`;
}

function formatHoldingsLine(btc){ return `Satoshi’s BTC Holdings: ${new Intl.NumberFormat('en-US').format(btc)} BTC`; }
function setFading(el,text){ if(!el) return; el.classList.add('fading'); el.textContent=text; setTimeout(()=>el.classList.remove('fading'),200); }

function renderHeader(){
  const totalUSD = SATOSHI_BTC * btcPriceUSD;
  setFading($('#line-total'), `${formatHoldingsLine(SATOSHI_BTC)} ≈ ${fmtUSD(totalUSD)}`);
  setFading($('#line-btc'), `1 BTC = ${fmtUSD2(btcPriceUSD)}`);
  setFading($('#line-usable'), fmtUSD(totalUSD));

  $('#top-position').textContent = computeTopPosition();
  $('#btc-left').textContent = `${fmtBTC(remainingUSD / btcPriceUSD)} BTC`;
  $('#usd-left').textContent = fmtUSD(remainingUSD);

  const now = new Date();
  const ts = now.toLocaleString(undefined, { month:'short', day:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  $('#last-updated').textContent = ts;
}

function cardTemplate(symbol,name,price){
  const owned = portfolio[symbol] || 0;
  return `
    <article class="card" data-symbol="${symbol}">
      <div class="row">
        <h3>${name}</h3>
        <span class="ticker">${symbol}</span>
      </div>
      <div class="row">
        <span class="price">${fmtUSD2(price)}</span>
        <span class="owned">Shares owned: <strong>${owned}</strong></span>
      </div>
      <div class="controls">
        <button class="step" data-step="-1" aria-label="Decrease quantity">−</button>
        <input class="qty" type="number" min="0" step="1" value="0" inputmode="numeric" aria-label="Quantity">
        <button class="step" data-step="1" aria-label="Increase quantity">+</button>
      </div>
      <div class="estimate" aria-live="polite">This trade: $0.00 (0 BTC)</div>
      <div class="actions">
        <button class="buy">Buy</button>
        <button class="sell" ${owned===0?'disabled':''}>Sell</button>
      </div>
    </article>
  `;
}

function renderGrid(){
  const grid=$('#grid'); grid.innerHTML='';
  const items=TICKERS.map(sym=>({symbol:sym,name:NAME_MAP[sym]||sym,price:prices[sym] ?? SNAPSHOT_USD[sym] ?? null}));
  items.forEach(({symbol,name,price})=>{ grid.insertAdjacentHTML('beforeend', cardTemplate(symbol,name,price)); });
  grid.setAttribute('aria-busy','false');

  $$('.card').forEach(card=>{
    const symbol=card.dataset.symbol;
    const price=prices[symbol] ?? SNAPSHOT_USD[symbol] ?? null;
    const qtyEl=$('.qty',card);
    const buyBtn=$('.buy',card);
    const sellBtn=$('.sell',card);

    const onQtyChange=()=>updateTradeEstimate(card,price);
    qtyEl.addEventListener('input',onQtyChange);

    $$('.step',card).forEach(btn=>{
      btn.addEventListener('click',()=>{
        const step=Number(btn.dataset.step);
        const val=Math.max(0,Math.floor(Number(qtyEl.value||0)+step));
        qtyEl.value=val; onQtyChange();
      });
    });

    buyBtn.addEventListener('click',()=>{
      const qty=Math.max(0,Math.floor(Number(qtyEl.value||0)));
      if(!price || qty<=0) return;
      const cost=price*qty;
      if(remainingUSD < cost) return;
      spentUSD += cost;
      portfolio[symbol]=(portfolio[symbol]||0)+qty;
      computeBalances();
      renderHeader(); updateCard(card,symbol);
      qtyEl.value=0; updateTradeEstimate(card,price);
    });

    sellBtn.addEventListener('click',()=>{
      const qty=Math.max(0,Math.floor(Number(qtyEl.value||0)));
      const owned=portfolio[symbol]||0;
      if(!price || qty<=0 || owned<=0) return;
      const sellQty=Math.min(qty,owned);
      const refund=price*sellQty;
      spentUSD -= refund;
      portfolio[symbol]=owned - sellQty;
      if(portfolio[symbol]<=0) delete portfolio[symbol];
      computeBalances();
      renderHeader(); updateCard(card,symbol);
      qtyEl.value=0; updateTradeEstimate(card,price);
    });

    updateTradeEstimate(card,price);
  });

  // Extra safety: recompute top position after grid render
  $('#top-position').textContent = computeTopPosition();
}

function updateCard(card,symbol){
  const price=prices[symbol] ?? SNAPSHOT_USD[symbol] ?? null;
  const owned=portfolio[symbol]||0;
  $('.owned',card).innerHTML=`Shares owned: <strong>${owned}</strong>`;
  $('.sell',card).disabled = owned===0;
  const buyBtn=$('.buy',card);
  buyBtn.disabled = (!price || remainingUSD < price);
}

function updateTradeEstimate(card,price){
  const qtyEl=$('.qty',card);
  const estEl=$('.estimate',card);
  const buyBtn=$('.buy',card);
  const qty=Math.max(0,Math.floor(Number(qtyEl.value||0)));
  const costUSD=(price||0)*qty;
  const costBTC=btcPriceUSD? costUSD/btcPriceUSD : 0;

  estEl.textContent = `This trade: ${fmtUSD2(costUSD)} (${fmtBTC(costBTC)} BTC)`;
  if(costUSD>remainingUSD && qty>0){ estEl.classList.add('warn'); buyBtn.disabled=true; }
  else { estEl.classList.remove('warn'); buyBtn.disabled=(qty<=0 || (price && remainingUSD < price)); }
}

/* Receipt modal */
function openReceipt(){ renderReceipt(); $('#receipt-modal').showModal(); }
function closeReceipt(){ $('#receipt-modal').close(); }
function renderReceipt(){
  $('#r-date').textContent = new Date().toLocaleString();
  $('#r-btc-price').textContent = fmtUSD2(btcPriceUSD);
  const tbody=$('#r-rows'); tbody.innerHTML='';
  const owned=Object.keys(portfolio).filter(s=>(portfolio[s]||0)>0);
  let subtotal=0;
  if(owned.length===0){
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--muted)">No holdings this session.</td></tr>`;
  } else {
    for(const sym of owned){
      const sh=portfolio[sym]; const pr=prices[sym] ?? SNAPSHOT_USD[sym] ?? 0; const tot=sh*pr; subtotal+=tot;
      const tr=document.createElement('tr');
      tr.innerHTML = `
        <td>${sym}</td>
        <td>${NAME_MAP[sym]||sym}</td>
        <td align="right">${sh}</td>
        <td align="right">${fmtUSD2(pr)}</td>
        <td align="right">${fmtUSD2(tot)}</td>
      `;
      tbody.appendChild(tr);
    }
  }
  $('#r-usd-spent').textContent = fmtUSD2(spentUSD);
  $('#r-btc-spent').textContent = fmtBTC(spentUSD / btcPriceUSD);
  $('#r-btc-left').textContent  = fmtBTC(remainingUSD / btcPriceUSD);
  $('#r-usd-left').textContent  = fmtUSD2(remainingUSD);
}

/* Theme + refresh + receipt triggers */
function initTheme(){
  const saved=localStorage.getItem('theme');
  if(saved==='dark'){
    document.documentElement.setAttribute('data-theme','dark');
    const t=$('#theme-toggle'); t.textContent='🌗 Dark'; t.setAttribute('aria-pressed','true');
  }
  $('#theme-toggle').addEventListener('click',()=>{
    const cur=document.documentElement.getAttribute('data-theme')||'light';
    const next=cur==='light'?'dark':'light';
    document.documentElement.setAttribute('data-theme',next);
    localStorage.setItem('theme',next);
    const t=$('#theme-toggle'); t.textContent=(next==='dark'?'🌗 Dark':'🌗 Light'); t.setAttribute('aria-pressed', next==='dark'?'true':'false');
  });
}

function initRefresh(){
  $('#refresh').addEventListener('click', async ()=>{
    $('#grid').setAttribute('aria-busy','true');
    try{
      localStorage.removeItem('btcPrice');
      localStorage.removeItem('quotes50');
      await boot();
    } finally {
      $('#grid').setAttribute('aria-busy','false');
    }
  });
}

function initReceipt(){
  const cell = $('#receipt-cell');
  cell.addEventListener('click', openReceipt);
  cell.addEventListener('keydown', (e)=>{ if(e.key==='Enter' || e.key===' ') { e.preventDefault(); openReceipt(); }});
  $('#close-receipt').addEventListener('click', closeReceipt);
  $('#print-receipt').addEventListener('click', ()=>window.print());
}

/* Boot */
async function boot(){
  try{ btcPriceUSD = await fetchBTCPrice(); }
  catch(e){ const c=getCache('btcPrice'); btcPriceUSD = c?.data || 60000; }

  spentUSD = spentUSD || 0;           // keep current session total
  computeBalances();
  renderHeader();

  let usedFallback=false;
  try{
    const q = await fetchQuotes(TICKERS);
    Object.assign(prices,q);
  } catch(e){
    const c=getCache('quotes50');
    if(c?.data) Object.assign(prices,c.data);
    else { Object.assign(prices,SNAPSHOT_USD); usedFallback=true; }
  }
  $('#fallback-note').hidden = !usedFallback;

  renderGrid();
}

/* Init */
initTheme(); initRefresh(); initReceipt(); boot();

/* Soft auto-refresh BTC every 10 min */
setInterval(()=>{
  fetchBTCPrice().then(p=>{
    btcPriceUSD=p; computeBalances(); renderHeader();
    $$('.card').forEach(card=>{
      const sym=card.dataset.symbol;
      const price=prices[sym] ?? SNAPSHOT_USD[sym] ?? null;
      updateCard(card,sym);
      updateTradeEstimate(card,price);
    });
  }).catch(()=>{});
}, 10*60*1000);

