// Aggregate signal predictor.
// Combines SMA crossover, EMA crossover, RSI, MACD, Bollinger Bands.
// Each signal contributes a score in [-1, +1]; final = weighted mean.

import { sma, ema, rsi, macd, bollinger, slope } from './indicators.js';

const last = (arr) => arr[arr.length - 1];
const prev = (arr) => arr[arr.length - 2];

function smaCrossSignal(closes) {
  const fast = sma(closes, 7);
  const slowA = sma(closes, 21);
  const f = last(fast), pF = prev(fast);
  const s = last(slowA), pS = prev(slowA);
  if (f == null || s == null || pF == null || pS == null) {
    return { name: 'SMA 7/21', score: 0, label: 'Chưa đủ dữ liệu', value: '—', neutral: true };
  }
  const diff = f - s;
  const pDiff = pF - pS;
  let score = 0, label = 'Trung tính';
  // Magnitude as % of price gives strength
  const strength = Math.min(1, Math.abs(diff) / (last(closes) * 0.005));
  if (diff > 0 && pDiff <= 0) { score = 1; label = 'Cắt lên (mua)'; }
  else if (diff < 0 && pDiff >= 0) { score = -1; label = 'Cắt xuống (bán)'; }
  else if (diff > 0) { score = 0.5 * strength; label = 'SMA nhanh trên SMA chậm'; }
  else if (diff < 0) { score = -0.5 * strength; label = 'SMA nhanh dưới SMA chậm'; }
  return {
    name: 'SMA 7/21',
    score,
    label,
    value: `${f.toFixed(2)} / ${s.toFixed(2)}`,
    neutral: score === 0,
  };
}

function emaCrossSignal(closes) {
  const fast = ema(closes, 12);
  const slowA = ema(closes, 26);
  const f = last(fast), pF = prev(fast);
  const s = last(slowA), pS = prev(slowA);
  if (f == null || s == null || pF == null || pS == null) {
    return { name: 'EMA 12/26', score: 0, label: 'Chưa đủ dữ liệu', value: '—', neutral: true };
  }
  const diff = f - s;
  const pDiff = pF - pS;
  const strength = Math.min(1, Math.abs(diff) / (last(closes) * 0.005));
  let score = 0, label = 'Trung tính';
  if (diff > 0 && pDiff <= 0) { score = 1; label = 'Cắt lên (mua)'; }
  else if (diff < 0 && pDiff >= 0) { score = -1; label = 'Cắt xuống (bán)'; }
  else if (diff > 0) { score = 0.5 * strength; label = 'EMA nhanh trên EMA chậm'; }
  else if (diff < 0) { score = -0.5 * strength; label = 'EMA nhanh dưới EMA chậm'; }
  return { name: 'EMA 12/26', score, label, value: `${f.toFixed(2)} / ${s.toFixed(2)}`, neutral: score === 0 };
}

function rsiSignal(closes) {
  const r = rsi(closes, 14);
  const cur = last(r);
  if (cur == null) {
    return { name: 'RSI 14', score: 0, label: 'Chưa đủ dữ liệu', value: '—', neutral: true };
  }
  let score = 0, label = 'Trung tính';
  if (cur < 30) { score = 1; label = 'Quá bán → tiềm năng tăng'; }
  else if (cur > 70) { score = -1; label = 'Quá mua → tiềm năng giảm'; }
  else if (cur < 45) { score = 0.4; label = 'Hơi yếu'; }
  else if (cur > 55) { score = -0.4; label = 'Hơi mạnh'; }
  return { name: 'RSI 14', score, label, value: cur.toFixed(1), neutral: score === 0 };
}

function macdSignal(closes) {
  const m = macd(closes, 12, 26, 9);
  const l = last(m.line), s = last(m.signal);
  const pL = prev(m.line), pS = prev(m.signal);
  if (l == null || s == null || pL == null || pS == null) {
    return { name: 'MACD', score: 0, label: 'Chưa đủ dữ liệu', value: '—', neutral: true };
  }
  const hist = l - s;
  const pHist = pL - pS;
  let score = 0, label = 'Trung tính';
  if (hist > 0 && pHist <= 0) { score = 1; label = 'Cắt lên đường tín hiệu'; }
  else if (hist < 0 && pHist >= 0) { score = -1; label = 'Cắt xuống đường tín hiệu'; }
  else if (hist > 0 && hist > pHist) { score = 0.6; label = 'Đà tăng mở rộng'; }
  else if (hist > 0) { score = 0.3; label = 'Trên đường tín hiệu'; }
  else if (hist < 0 && hist < pHist) { score = -0.6; label = 'Đà giảm mở rộng'; }
  else if (hist < 0) { score = -0.3; label = 'Dưới đường tín hiệu'; }
  return { name: 'MACD', score, label, value: `${l.toFixed(2)} / ${s.toFixed(2)}`, neutral: score === 0 };
}

function bollingerSignal(closes) {
  const b = bollinger(closes, 20, 2);
  const price = last(closes);
  const up = last(b.upper), mid = last(b.mid), low = last(b.lower);
  if (up == null || low == null) {
    return { name: 'Bollinger', score: 0, label: 'Chưa đủ dữ liệu', value: '—', neutral: true };
  }
  let score = 0, label = 'Trong dải';
  const width = up - low;
  const pos = (price - low) / width; // 0 = chạm low, 1 = chạm up
  if (pos <= 0.05) { score = 1; label = 'Chạm/vượt dải dưới (quá bán)'; }
  else if (pos >= 0.95) { score = -1; label = 'Chạm/vượt dải trên (quá mua)'; }
  else if (pos < 0.3) { score = 0.4; label = 'Gần dải dưới'; }
  else if (pos > 0.7) { score = -0.4; label = 'Gần dải trên'; }
  return {
    name: 'Bollinger 20',
    score,
    label,
    value: `${low.toFixed(0)}—${up.toFixed(0)}`,
    neutral: score === 0,
  };
}

export function predict(history) {
  const closes = history.map((p) => p.price);
  const signals = [
    { ...smaCrossSignal(closes), weight: 1.0 },
    { ...emaCrossSignal(closes), weight: 1.2 },
    { ...rsiSignal(closes), weight: 1.0 },
    { ...macdSignal(closes), weight: 1.3 },
    { ...bollingerSignal(closes), weight: 0.9 },
  ];

  let weightedSum = 0;
  let weightTotal = 0;
  for (const s of signals) {
    weightedSum += s.score * s.weight;
    weightTotal += s.weight;
  }
  const composite = weightedSum / weightTotal; // [-1, 1]

  // Trend confirmation via linear regression slope of last 7 closes
  const sl = slope(closes, 7);
  const slopePct = closes.length ? sl / last(closes) : 0;

  let label, dir;
  const abs = Math.abs(composite);
  if (composite > 0.35) { label = 'TĂNG'; dir = 'up'; }
  else if (composite > 0.12) { label = 'TĂNG NHẸ'; dir = 'up'; }
  else if (composite < -0.35) { label = 'GIẢM'; dir = 'down'; }
  else if (composite < -0.12) { label = 'GIẢM NHẸ'; dir = 'down'; }
  else { label = 'ĐI NGANG'; dir = 'neutral'; }

  // Confidence: 50% from composite magnitude, 30% from signal agreement, 20% from trend confirmation
  const nonNeutral = signals.filter((s) => !s.neutral);
  const agreement = nonNeutral.length
    ? nonNeutral.filter((s) => Math.sign(s.score) === Math.sign(composite)).length / nonNeutral.length
    : 0;
  const trendConfirm = Math.sign(slopePct) === Math.sign(composite) ? 1 : 0;
  let confidence = 0.5 * abs + 0.3 * agreement + 0.2 * trendConfirm;
  confidence = Math.max(0, Math.min(1, confidence));

  return {
    composite,
    label,
    direction: dir,
    confidence,
    slope: slopePct,
    signals,
  };
}
