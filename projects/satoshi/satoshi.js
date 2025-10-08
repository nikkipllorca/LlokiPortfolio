// Satoshi’s Stocks — client-side simulator (no backend, cached fetches)

/** -----------------------
 *  Config & constants
 *  ----------------------- */
const SATOSHI_BTC = 1_100_000; // 1.1M BTC
const BTC_CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const QUOTES_CACHE_TTL = 10 * 60 * 1000;

const COINGECKO_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';

// 50 large-cap US tickers (mix of S&P/NASDAQ + top ADRs commonly in top mkt cap)
const TICKERS = [
  // 50 symbols
  "AAPL","MSFT","GOOGL","AMZN","NVDA","META","BRK-B","LLY","AVGO","JPM",
  "V","XOM","WMT","JNJ","UNH","MA","PG","ORCL","COST","HD",
  "BAC","PEP","MRK","KO","CVX","ABBV","TSM","ASML","ACN","DIS",
  "NFLX","ADBE","TMO","CSCO","CRM","NEE","AMD","MCD","LIN","CAT",
  "TM","SAP","PFE","WFC","IBM","TXN","INTU","COP","DHR","AMAT"
];

// Optional embedded snapshot (used only if live quotes fail AND no cache)
// Prices are approximate placeholders; update later if you want.
const SNAPSHOT_USD = {
  "AAPL":225,"MSFT":417,"GOOGL":169,"AMZN":182,"NVDA":110,"META":510,"BRK-B":450,"LLY":900,"AVGO":1700,"JPM":210,
  "V":280,"XOM":110,"WMT":72,"JNJ":160,"UNH":480,"MA":420,"PG":165,"ORCL":145,"COST":920,"HD":345,
  "BAC":42,"PEP":170,"MRK":128,"KO":65,"CVX":155,"ABBV":170,"TSM":170,"ASML":1050,"ACN":340,"DIS":110,
  "NFLX":600,"ADBE":520,"TMO":570,"CSCO":55,"CRM":285,"NEE":75,"AMD":140,"MCD":290,"LIN":450,"CAT":330,
  "TM":210,"SAP":190,"PFE":32,"WFC":56,"IBM":175,"TXN":190,"INTU":620,"COP":115,"DHR":255,"AMAT":220
};

/** -----------------------
 *  State
 *  ----------------------- */
let btcPriceUSD = null;      // number (per BTC)
let remainingUSD = 0;        // number
let spentUSD = 0;            // number
const portfolio = {};        // symbol -> shares owned
const prices = {};           // symbol -> priceUSD

/** -----------------------
 *  DOM helpers
 *  ----------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const fmtUSD = (n) =>
  n === null || Number.isNaN(n) ? '—' :
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const fmtUSD2 = (n) =>
  n === null || Number.isNaN(n) ? '—' :
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(n);

const fmtBTC = (n) =>
  n === null || Number.isNaN(n) ? '—' :
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 6 }).format(n);

/** -----------------------
 *  Caching
 *  ----------------------- */
function getCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { timestamp, data } = JSON.parse(raw);
    return { timestamp, data };
  } catch { return null; }
}
function setCache(key, data) {
  localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), data }));
}

/** -----------------------
 *  Fetch BTC price (CoinGecko)
 *  ----------------------- */
async function fetchBTCPrice() {
  const cache = getCache('btcPrice');
  if (cache && Date.now() - cache.timestamp < BTC_CACHE_TTL) {
    return cache.data;
  }
  const res = await fetch(COINGECKO_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error('BTC fetch failed');
  const json = await res.json();
  const price = json?.bitcoin?.usd;
  if (!price) throw new Error('BTC price missing');
  setCache('btcPrice', price);
  return price;
}

/** -----------------------
 *  Fetch quotes (Yahoo Finance)
 *  ----------------------- */
async function fetchQuotes(symbols) {
  const cache = getCache('quotes50');
  if (cache && Date.now() - cache.timestamp < QUOTES_CACHE_TTL) {
    return cache.data; // {symbol: price}
  }
  const url = 'https://query1.finance.yahoo.com/v7/finance/quote?symbols=' + encodeURIComponent(symbols.join(','));
  const res = await fetch(url, { cache: 'no-store' }).catch(() => null);
  if (!res || !res.ok) throw new Error('Quotes fetch failed');
  const json = await res.json().catch(() => null);
  const arr = json?.quoteResponse?.result || [];
  const out = {};
  for (const r of arr) {
    if (r.symbol && typeof r.regularMarketPrice === 'number') {
      out[r.symbol] = r.regularMarketPrice;
    }
  }
  if (Object.keys(out).length === 0) throw new Error('No quotes in response');
  setCache('quotes50', out);
  return out;
}

/** -----------------------
 *  UI Rendering
 *  ----------------------- */
function computeBalances() {
  remainingUSD = SATOSHI_BTC * btcPriceUSD - spentUSD;
}

function renderHeader() {
  $('#btc-usd').textContent = fmtUSD2(btcPriceUSD);
  $('#remaining-usd').textContent = fmtUSD(remainingUSD);
  $('#spent-usd').textContent = fmtUSD(spentUSD);

  const remainingBTC = remainingUSD / btcPriceUSD;
  const spentBTC = spentUSD / btcPriceUSD;

  $('#remaining-btc').textContent = fmtBTC(remainingBTC);
  $('#spent-btc').textContent = fmtBTC(spentBTC);

  $('#last-updated').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function cardTemplate(symbol, name, price) {
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
      <div class="actions">
        <button class="buy">Buy</button>
        <button class="sell" ${owned === 0 ? 'disabled' : ''}>Sell</button>
      </div>
    </article>
  `;
}

function renderGrid() {
  const grid = $('#grid');
  grid.innerHTML = '';
  // Sort by name for stable UI
  const items = TICKERS.map(sym => ({
    symbol: sym,
    name: NAME_MAP[sym] || sym,
    price: prices[sym] ?? SNAPSHOT_USD[sym] ?? null
  }));
  items.forEach(({symbol, name, price}) => {
    grid.insertAdjacentHTML('beforeend', cardTemplate(symbol, name, price));
  });
  grid.setAttribute('aria-busy', 'false');

  // Wire up events
  $$('.card').forEach(card => {
    const symbol = card.dataset.symbol;
    const price = prices[symbol] ?? SNAPSHOT_USD[symbol] ?? null;
    const qtyEl = $('.qty', card);
    const buyBtn = $('.buy', card);
    const sellBtn = $('.sell', card);

    $$('.step', card).forEach(btn => {
      btn.addEventListener('click', () => {
        const step = Number(btn.dataset.step);
        const val = Math.max(0, Math.floor(Number(qtyEl.value || 0) + step));
        qtyEl.value = val;
      });
    });

    buyBtn.addEventListener('click', () => {
      const qty = Math.max(0, Math.floor(Number(qtyEl.value || 0)));
      if (!price || qty <= 0) return;
      const cost = price * qty;
      if (remainingUSD < cost) return;
      spentUSD += cost;
      portfolio[symbol] = (portfolio[symbol] || 0) + qty;
      computeBalances(); renderHeader(); updateCard(card, symbol);
      qtyEl.value = 0;
    });

    sellBtn.addEventListener('click', () => {
      const qty = Math.max(0, Math.floor(Number(qtyEl.value || 0)));
      const owned = portfolio[symbol] || 0;
      if (!price || qty <= 0 || owned <= 0) return;
      const sellQty = Math.min(qty, owned);
      const refund = price * sellQty;
      spentUSD -= refund;
      portfolio[symbol] = owned - sellQty;
      if (portfolio[symbol] <= 0) delete portfolio[symbol];
      computeBalances(); renderHeader(); updateCard(card, symbol);
      qtyEl.value = 0;
    });
  });
}

function updateCard(card, symbol) {
  const price = prices[symbol] ?? SNAPSHOT_USD[symbol] ?? null;
  const owned = portfolio[symbol] || 0;
  $('.owned', card).innerHTML = `Shares owned: <strong>${owned}</strong>`;
  $('.sell', card).disabled = owned === 0;

  // Disable buy if you can't afford at least 1 share
  const buyBtn = $('.buy', card);
  if (!price || remainingUSD < price) { buyBtn.disabled = true; }
  else { buyBtn.disabled = false; }
}

/** -----------------------
 *  Names map (short and clean)
 *  ----------------------- */
const NAME_MAP = {
  "AAPL":"Apple","MSFT":"Microsoft","GOOGL":"Alphabet","AMZN":"Amazon","NVDA":"NVIDIA","META":"Meta Platforms","BRK-B":"Berkshire Hathaway",
  "LLY":"Eli Lilly","AVGO":"Broadcom","JPM":"JPMorgan Chase","V":"Visa","XOM":"ExxonMobil","WMT":"Walmart","JNJ":"Johnson & Johnson","UNH":"UnitedHealth",
  "MA":"Mastercard","PG":"Procter & Gamble","ORCL":"Oracle","COST":"Costco","HD":"Home Depot","BAC":"Bank of America","PEP":"PepsiCo","MRK":"Merck",
  "KO":"Coca-Cola","CVX":"Chevron","ABBV":"AbbVie","TSM":"Taiwan Semi (ADR)","ASML":"ASML (ADR)","ACN":"Accenture","DIS":"Disney","NFLX":"Netflix",
  "ADBE":"Adobe","TMO":"Thermo Fisher","CSCO":"Cisco","CRM":"Salesforce","NEE":"NextEra Energy","AMD":"AMD","MCD":"McDonald’s","LIN":"Linde","CAT":"Caterpillar",
  "TM":"Toyota (ADR)","SAP":"SAP (ADR)","PFE":"Pfizer","WFC":"Wells Fargo","IBM":"IBM","TXN":"Texas Instruments","INTU":"Intuit","COP":"ConocoPhillips",
  "DHR":"Danaher","AMAT":"Applied Materials"
};

/** -----------------------
 *  Theme toggle
 *  ----------------------- */
function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    const t = $('#theme-toggle'); t.textContent = '🌗 Dark'; t.setAttribute('aria-pressed', 'true');
  }
  $('#theme-toggle').addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    const t = $('#theme-toggle');
    t.textContent = next === 'dark' ? '🌗 Dark' : '🌗 Light';
    t.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
  });
}

/** -----------------------
 *  Refresh button
 *  ----------------------- */
function initRefresh() {
  $('#refresh').addEventListener('click', async () => {
    $('#grid').setAttribute('aria-busy', 'true');
    try {
      // Force fresh fetches by clearing caches first
      localStorage.removeItem('btcPrice');
      localStorage.removeItem('quotes50');
      await boot();
    } finally {
      $('#grid').setAttribute('aria-busy', 'false');
    }
  });
}

/** -----------------------
 *  Boot sequence
 *  ----------------------- */
async function boot() {
  // 1) BTC price
  try {
    btcPriceUSD = await fetchBTCPrice();
  } catch (e) {
    // Fallback to last good cached or a hardcoded guard
    const cache = getCache('btcPrice');
    btcPriceUSD = cache?.data || 60000;
  }

  // Set initial balances
  spentUSD = 0;
  computeBalances();
  renderHeader();

  // 2) Quotes
  let usedFallback = false;
  try {
    const q = await fetchQuotes(TICKERS);
    Object.assign(prices, q);
  } catch (e) {
    // Fallback logic
    const cache = getCache('quotes50');
    if (cache?.data) {
      Object.assign(prices, cache.data);
    } else {
      Object.assign(prices, SNAPSHOT_USD);
      usedFallback = true;
    }
  }

  // UI
  $('#fallback-note').hidden = !usedFallback;
  renderGrid();
}

/** -----------------------
 *  Init
 *  ----------------------- */
initTheme();
initRefresh();
boot();

// Auto-refresh prices every ~10 minutes (soft)
setInterval(() => {
  // Do a gentle refresh (BTC only to reduce calls)
  fetchBTCPrice().then((p) => {
    btcPriceUSD = p;
    computeBalances();
    renderHeader();
    // Re-evaluate buy button affordability for each card
    $$('.card').forEach(card => updateCard(card, card.dataset.symbol));
  }).catch(() => {});
}, 10 * 60 * 1000);
