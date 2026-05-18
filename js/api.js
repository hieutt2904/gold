// API layer: GoldAPI for XAU/USD + open.er-api.com for USD/VND.
// Uses localStorage to minimize requests (GoldAPI free tier is small).

const GOLDAPI_TOKEN = 'goldapi-738920b0cefe91157349c0657045ee61-io';
const GOLDAPI_BASE = 'https://www.goldapi.io/api/XAU/USD';
const FX_URL = 'https://open.er-api.com/v6/latest/USD';

const CACHE_KEY = 'gold-history-v1';
const FX_CACHE_KEY = 'fx-usd-vnd-v1';
const FX_TTL_MS = 6 * 60 * 60 * 1000; // 6h

function todayUTC() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}
function ymd(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}
function isoDay(d) {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n) {
  const d = todayUTC();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}
function isWeekend(d) {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

async function fetchGold(dateParam = '') {
  const url = dateParam ? `${GOLDAPI_BASE}/${dateParam}` : GOLDAPI_BASE;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'x-access-token': GOLDAPI_TOKEN, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`GoldAPI ${res.status}`);
  return res.json();
}

function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { points: {}, lastFetchDay: null };
    const parsed = JSON.parse(raw);
    return { points: parsed.points || {}, lastFetchDay: parsed.lastFetchDay || null };
  } catch {
    return { points: {}, lastFetchDay: null };
  }
}
function saveCache(cache) {
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

// Returns a sorted array of { date: 'YYYY-MM-DD', price, open, high, low, prev }
// strategy:
//   - first ever load: backfill `initialDays` business days
//   - same day: read cache only
//   - next day: fetch only the new latest day
export async function getHistory({ days = 60, initialDays = 45, onProgress } = {}) {
  const cache = loadCache();
  const todayKey = isoDay(todayUTC());

  // Helper: ensure a single date is fetched and cached
  const ensure = async (d, label) => {
    const key = isoDay(d);
    if (cache.points[key]) return;
    if (isWeekend(d)) return; // markets closed
    try {
      if (onProgress) onProgress(label);
      const data = await fetchGold(ymd(d));
      cache.points[key] = {
        date: key,
        price: data.price,
        open: data.open_price,
        high: data.high_price,
        low: data.low_price,
        prev: data.prev_close_price,
      };
    } catch (e) {
      console.warn('Skip date', key, e.message);
    }
  };

  // Always ensure we have data going back `initialDays` calendar days
  // (skips weekends). Also fills any forward gap since lastFetchDay.
  for (let i = initialDays; i >= 1; i--) {
    await ensure(daysAgo(i), `Tải dữ liệu ${i} ngày trước…`);
  }

  // Always fetch current (today) price — fresh
  try {
    if (onProgress) onProgress('Lấy giá hiện tại…');
    const live = await fetchGold('');
    const liveKey = isoDay(new Date(live.timestamp * 1000));
    cache.points[liveKey] = {
      date: liveKey,
      price: live.price,
      open: live.open_price,
      high: live.high_price,
      low: live.low_price,
      prev: live.prev_close_price,
      live: {
        price: live.price,
        ts: live.timestamp,
        ch: live.ch,
        chp: live.chp,
        ask: live.ask,
        bid: live.bid,
      },
    };
    cache.lastFetchDay = todayKey;
  } catch (e) {
    console.warn('Live fetch failed', e.message);
  }

  saveCache(cache);

  const all = Object.values(cache.points).sort((a, b) => a.date.localeCompare(b.date));
  const cutoff = isoDay(daysAgo(days));
  const window = all.filter((p) => p.date >= cutoff);
  const latest = all[all.length - 1] || null;

  return { history: window, all, latest, cacheSize: all.length };
}

export async function getUsdToVnd() {
  try {
    const raw = localStorage.getItem(FX_CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.ts < FX_TTL_MS) return parsed.rate;
    }
  } catch {}

  try {
    const res = await fetch(FX_URL);
    if (!res.ok) throw new Error(`FX ${res.status}`);
    const data = await res.json();
    const rate = data.rates?.VND;
    if (!rate) throw new Error('Không có tỉ giá VND');
    localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ rate, ts: Date.now() }));
    return rate;
  } catch (e) {
    console.warn('FX fetch failed, dùng tỉ giá dự phòng', e.message);
    return 25500; // fallback
  }
}

export function clearCache() {
  localStorage.removeItem(CACHE_KEY);
  localStorage.removeItem(FX_CACHE_KEY);
}
