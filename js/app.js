// Main controller — orchestrates API, prediction, rendering.

import { getHistory, getUsdToVnd, clearCache } from './api.js';
import { predict, predictLongTerm } from './predictor.js';
import { renderPriceChart, renderRsiChart, renderMacdChart, renderLongTermChart } from './charts.js';

// 1 troy ounce = 31.1034768 grams. 1 lượng VN = 37.5 grams.
const GRAMS_PER_OZ = 31.1034768;
const GRAMS_PER_TAEL = 37.5;

const state = {
  currency: 'USD', // USD | VND
  unit: 'oz',      // oz | g | tael
  rangeDays: 30,
  ltRangeDays: 180,
  history: [],     // full cache
  latest: null,
  fxRate: 25500,
};

const $ = (sel) => document.querySelector(sel);

function showLoader(text) {
  const l = $('#loader');
  l.querySelector('span').textContent = text || 'Đang tải dữ liệu…';
  l.classList.remove('hidden');
}
function hideLoader() { $('#loader').classList.add('hidden'); }

function toast(msg, isError = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.toggle('error', isError);
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 3500);
}

// Convert USD/oz to the user's chosen unit + currency.
function convertPrice(usdPerOz) {
  const inCur = state.currency === 'VND' ? usdPerOz * state.fxRate : usdPerOz;
  switch (state.unit) {
    case 'g':    return inCur / GRAMS_PER_OZ;
    case 'tael': return (inCur / GRAMS_PER_OZ) * GRAMS_PER_TAEL;
    default:     return inCur;
  }
}

function formatPrice(v) {
  if (v == null || isNaN(v)) return '—';
  const cur = state.currency;
  if (cur === 'VND') {
    return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(v) + ' ₫';
  }
  return '$' + new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, minimumFractionDigits: 2 }).format(v);
}

function unitLabel() {
  return state.unit === 'oz' ? '/oz' : state.unit === 'g' ? '/g' : '/lượng';
}

function setText(sel, val) { const el = $(sel); if (el) el.textContent = val; }

function updateHeaderStats() {
  const latest = state.latest;
  if (!latest) return;

  const p = convertPrice(latest.price);
  setText('#current-price', formatPrice(p) + ' ' + unitLabel());

  const ch = latest.live?.ch ?? (latest.prev ? latest.price - latest.prev : 0);
  const chp = latest.live?.chp ?? (latest.prev ? ((latest.price - latest.prev) / latest.prev) * 100 : 0);
  const chConverted = convertPrice(latest.price) - convertPrice(latest.price - ch);
  const changeEl = $('#price-change');
  changeEl.className = 'change ' + (ch > 0 ? 'up' : ch < 0 ? 'down' : 'flat');
  const sign = ch > 0 ? '+' : '';
  changeEl.textContent = `${sign}${formatPrice(chConverted)} (${sign}${chp.toFixed(2)}%)`;

  setText('#price-open', latest.open ? formatPrice(convertPrice(latest.open)) : '—');
  setText('#price-high', latest.high ? formatPrice(convertPrice(latest.high)) : '—');
  setText('#price-low',  latest.low  ? formatPrice(convertPrice(latest.low))  : '—');
  setText('#price-prev', latest.prev ? formatPrice(convertPrice(latest.prev)) : '—');

  const ts = latest.live?.ts ? new Date(latest.live.ts * 1000) : new Date(latest.date + 'T00:00:00Z');
  setText('#price-time', 'Cập nhật: ' + ts.toLocaleString('vi-VN'));
}

function updatePrediction() {
  // Always run prediction on the full cached history so the result doesn't
  // depend on the chart's visible window (e.g. 14N would starve MACD).
  const slice = state.history;
  if (slice.length < 27) {
    $('#prediction-badge').className = 'prediction neutral';
    $('#prediction-badge .arrow').textContent = '…';
    $('#prediction-badge .label').textContent = 'Cần thêm dữ liệu';
    setText('#prediction-confidence', '');
    setText('#prediction-summary', `Hiện chỉ có ${slice.length} điểm dữ liệu — cần ≥ 27 để chạy EMA26.`);
    return;
  }
  const result = predict(slice);
  const badge = $('#prediction-badge');
  badge.className = 'prediction ' + result.direction;
  const arrow = result.direction === 'up' ? '↑' : result.direction === 'down' ? '↓' : '→';
  $('#prediction-badge .arrow').textContent = arrow;
  $('#prediction-badge .label').textContent = result.label;

  setText('#prediction-confidence', `Độ tin cậy: ${(result.confidence * 100).toFixed(0)}%`);

  const up = result.signals.filter((s) => s.score > 0).length;
  const down = result.signals.filter((s) => s.score < 0).length;
  const neutral = result.signals.filter((s) => s.score === 0).length;
  const slopeDir = result.slope > 0 ? 'đi lên' : result.slope < 0 ? 'đi xuống' : 'đi ngang';
  setText('#prediction-summary',
    `Tổng hợp ${result.signals.length} chỉ báo: ${up} tăng · ${down} giảm · ${neutral} trung tính. ` +
    `Xu hướng tuyến tính 7 ngày: ${slopeDir}.`,
  );

  // Signals table
  const tbl = $('#signals-table');
  tbl.innerHTML = '';
  for (const s of result.signals) {
    const dir = s.score > 0.1 ? 'up' : s.score < -0.1 ? 'down' : 'neutral';
    const valTxt = s.score > 0 ? 'Tăng' : s.score < 0 ? 'Giảm' : 'Trung tính';
    const card = document.createElement('div');
    card.className = 'signal ' + dir;
    card.innerHTML = `
      <div class="signal-name">${s.name}</div>
      <div class="signal-value">${valTxt} <span class="muted small">(${(s.score * 100).toFixed(0)}%)</span></div>
      <div class="signal-detail">${s.label} · ${s.value}</div>
    `;
    tbl.appendChild(card);
  }

  // Indicator badges
  const r = computeIndicators(slice);
  const rsiBadge = $('#rsi-value');
  if (r.rsi != null) {
    rsiBadge.textContent = r.rsi.toFixed(1);
    rsiBadge.className = 'badge ' + (r.rsi > 70 ? 'down' : r.rsi < 30 ? 'up' : '');
  }
  const macdBadge = $('#macd-value');
  if (r.macdHist != null) {
    macdBadge.textContent = (r.macdHist > 0 ? '+' : '') + r.macdHist.toFixed(2);
    macdBadge.className = 'badge ' + (r.macdHist > 0 ? 'up' : r.macdHist < 0 ? 'down' : '');
  }
}

function computeIndicators(slice) {
  // small helper so app doesn't reimport indicator math
  // but we already compute via predictor's signals; easier: derive directly here from raw arrays
  const closes = slice.map((p) => p.price);
  // Cheap inline: reuse functions from indicators via dynamic import would complicate; use local copies
  // Instead, take values from latest predict result indirectly via signals labels — but cleaner to recompute:
  // We'll just import on demand:
  return { rsi: lastRsi(closes), macdHist: lastMacdHist(closes) };
}

// Tiny inline versions to avoid extra plumbing
function lastRsi(values, period = 14) {
  if (values.length <= period) return null;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gain += d; else loss -= d;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const g = d > 0 ? d : 0, l = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

function lastEma(values, period) {
  if (values.length < period) return null;
  const k = 2 / (period + 1);
  let e = 0;
  for (let i = 0; i < period; i++) e += values[i];
  e /= period;
  for (let i = period; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}

function lastMacdHist(values) {
  if (values.length < 35) return null;
  const fast = lastEma(values, 12);
  const slow = lastEma(values, 26);
  if (fast == null || slow == null) return null;
  // approximate signal as EMA9 of MACD line over a recomputed series (cheap version: just last line - simple avg of last 9 macd values)
  const macdSeries = [];
  for (let i = 25; i < values.length; i++) {
    const sub = values.slice(0, i + 1);
    const f = lastEma(sub, 12);
    const s = lastEma(sub, 26);
    macdSeries.push(f - s);
  }
  const sig = lastEma(macdSeries, 9) ?? macdSeries[macdSeries.length - 1];
  return (fast - slow) - sig;
}

function filterWindow() {
  if (!state.history.length) return [];
  const cutoffIdx = Math.max(0, state.history.length - state.rangeDays);
  return state.history.slice(cutoffIdx);
}

function filterLongTermWindow() {
  if (!state.history.length) return [];
  const cutoffIdx = Math.max(0, state.history.length - state.ltRangeDays);
  return state.history.slice(cutoffIdx);
}

function updateCharts() {
  const slice = filterWindow();
  if (slice.length < 2) return;
  renderPriceChart(slice, state.currency + ' ' + unitLabel(), formatPrice, convertPrice);
  renderRsiChart(slice);
  renderMacdChart(slice);

  // Long-term chart receives full history + visible window size so that
  // SMA 200 can be rendered even when zoomed in.
  if (state.history.length >= 2) {
    renderLongTermChart(state.history, state.ltRangeDays, formatPrice, convertPrice);
  }
}

function updateLongTermPrediction() {
  // Use ALL available history for the prediction itself (not just the chart window),
  // so SMA 200 can be computed if we have enough data.
  const result = predictLongTerm(state.history);
  const badge = $('#longterm-badge');
  badge.className = 'prediction ' + result.direction;
  const arrow = result.direction === 'up' ? '↑' : result.direction === 'down' ? '↓' : '→';
  $('#longterm-badge .arrow').textContent = arrow;
  $('#longterm-badge .label').textContent = result.label;

  if (result.message) {
    setText('#lt-confidence', '—');
    setText('#lt-signals-count', '—');
    setText('#lt-composite', '—');
    $('#lt-signals-table').innerHTML = `<div class="muted small" style="grid-column:1/-1">${result.message}</div>`;
    return;
  }

  setText('#lt-confidence', (result.confidence * 100).toFixed(0) + '%');
  const up = result.signals.filter((s) => s.score > 0).length;
  const down = result.signals.filter((s) => s.score < 0).length;
  setText('#lt-signals-count', `${up} ↑ / ${down} ↓ / ${result.signals.length - up - down} →`);
  setText('#lt-composite', (result.composite > 0 ? '+' : '') + (result.composite * 100).toFixed(0) + '%');

  const tbl = $('#lt-signals-table');
  tbl.innerHTML = '';
  for (const s of result.signals) {
    const dir = s.score > 0.1 ? 'up' : s.score < -0.1 ? 'down' : 'neutral';
    const valTxt = s.score > 0 ? 'Tăng' : s.score < 0 ? 'Giảm' : 'Trung tính';
    const card = document.createElement('div');
    card.className = 'signal ' + dir;
    card.innerHTML = `
      <div class="signal-name">${s.name}</div>
      <div class="signal-value">${valTxt} <span class="muted small">(${(s.score * 100).toFixed(0)}%)</span></div>
      <div class="signal-detail">${s.label} · ${s.value}</div>
    `;
    tbl.appendChild(card);
  }

  if (result.partial) {
    setText('#longterm-note', `Đang dùng dữ liệu rút gọn (${state.history.length} ngày). Tải đủ ≥ 200 ngày để có Golden/Death Cross chuẩn.`);
  } else {
    setText('#longterm-note', `Dựa trên ${state.history.length} ngày dữ liệu · SMA 50/100/200, vị thế 52 tuần, độ dốc 90N.`);
  }
}

function updateHistoryTable() {
  const slice = filterWindow().slice().reverse();
  const tbody = $('#history-table tbody');
  tbody.innerHTML = '';
  for (let i = 0; i < slice.length; i++) {
    const p = slice[i];
    const next = slice[i + 1];
    const change = next ? p.price - next.price : 0;
    const pct = next ? (change / next.price) * 100 : 0;
    const dir = change > 0 ? 'up' : change < 0 ? 'down' : '';
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${new Date(p.date).toLocaleDateString('vi-VN')}</td>
      <td>${formatPrice(convertPrice(p.price))} ${unitLabel()}</td>
      <td class="${dir}">${change >= 0 ? '+' : ''}${formatPrice(convertPrice(change))}</td>
      <td class="${dir}">${change > 0 ? '+' : ''}${pct.toFixed(2)}%</td>
    `;
    tbody.appendChild(tr);
  }
}

function rerender() {
  updateHeaderStats();
  updateCharts();
  updatePrediction();
  updateLongTermPrediction();
  updateHistoryTable();
}

async function loadData(force = false) {
  showLoader('Đang tải dữ liệu…');
  try {
    if (force) clearCache();
    const [hist, fx] = await Promise.all([
      getHistory({ days: 365, initialDays: 180, onProgress: (m) => showLoader(m) }),
      getUsdToVnd(),
    ]);
    state.history = hist.all;
    state.latest = hist.latest;
    state.fxRate = fx;
    setText('#cache-info', `Đang lưu ${hist.cacheSize} ngày · Tỉ giá USD→VND: ${Math.round(fx).toLocaleString('vi-VN')}`);
    rerender();
  } catch (e) {
    console.error(e);
    toast('Lỗi tải dữ liệu: ' + e.message, true);
  } finally {
    hideLoader();
  }
}

function attachUI() {
  document.querySelectorAll('.cur-btn').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.cur-btn').forEach((x) => {
        x.classList.remove('active');
        x.setAttribute('aria-selected', 'false');
      });
      b.classList.add('active');
      b.setAttribute('aria-selected', 'true');
      state.currency = b.dataset.cur;
      rerender();
    });
  });
  document.querySelectorAll('.unit-btn').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.unit-btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state.unit = b.dataset.unit;
      rerender();
    });
  });
  // Short-term range (price chart) — buttons that are NOT inside #lt-range
  document.querySelectorAll('.range-toggle:not(#lt-range) .range-btn').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('.range-toggle:not(#lt-range) .range-btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state.rangeDays = Number(b.dataset.days);
      rerender();
    });
  });
  // Long-term range
  document.querySelectorAll('#lt-range .range-btn').forEach((b) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#lt-range .range-btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      state.ltRangeDays = Number(b.dataset.days);
      rerender();
    });
  });
  $('#refresh-btn').addEventListener('click', () => {
    if (confirm('Làm mới và bỏ qua cache? (Tốn nhiều request GoldAPI)')) {
      loadData(true);
    } else {
      loadData(false);
    }
  });
}

attachUI();
loadData(false);
