// Aggregate signal predictor.
// Combines SMA crossover, EMA crossover, RSI, MACD, Bollinger Bands.
// Each signal contributes a score in [-1, +1]; final = weighted mean.

import { sma, ema, rsi, macd, bollinger, slope } from './indicators.js';

const lastDef = (arr) => {
  for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null) return arr[i];
  return null;
};

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

// ---------------------------------------------------------------------------
// Long-term predictor (horizon: 1-3 months)
// Uses slower indicators: SMA 50/200, position vs SMA 100, 90-day slope/ROC,
// 52-week range position. Each signal returns score in [-1, +1] with a weight.

function smaCrossLongSignal(closes) {
  // Pick the longest SMA pair we have enough data for.
  // Ideal: 50/200 (Golden/Death). Fallback: 50/100. Final fallback: 20/50.
  const tryPair = (fastP, slowP, scale) => {
    const f = sma(closes, fastP);
    const s = sma(closes, slowP);
    if (last(f) == null || last(s) == null) return null;
    return { fast: f, slow: s, fastP, slowP, scale };
  };
  const pair = tryPair(50, 200, 1.0) || tryPair(50, 100, 0.9) || tryPair(20, 50, 0.8);
  if (!pair) {
    return { name: 'SMA Cross', score: 0, label: 'Cần ≥ 50 ngày dữ liệu', value: '—', neutral: true, partial: true };
  }
  const { fast, slow, fastP, slowP, scale } = pair;
  const f = last(fast), pF = prev(fast);
  const s = last(slow), pS = prev(slow);
  const diff = f - s;
  const pDiff = pF != null && pS != null ? pF - pS : diff;
  const strength = Math.min(1, Math.abs(diff) / (last(closes) * 0.01));
  let score = 0, label = 'Trung tính';
  const isGolden = fastP === 50 && slowP === 200;
  if (diff > 0 && pDiff <= 0) {
    score = scale;
    label = isGolden ? 'Golden Cross (rất tích cực)' : `SMA ${fastP} cắt lên SMA ${slowP}`;
  } else if (diff < 0 && pDiff >= 0) {
    score = -scale;
    label = isGolden ? 'Death Cross (rất tiêu cực)' : `SMA ${fastP} cắt xuống SMA ${slowP}`;
  } else if (diff > 0) {
    score = 0.6 * scale * strength;
    label = `SMA ${fastP} trên SMA ${slowP} (xu hướng tăng)`;
  } else if (diff < 0) {
    score = -0.6 * scale * strength;
    label = `SMA ${fastP} dưới SMA ${slowP} (xu hướng giảm)`;
  }
  return {
    name: `SMA ${fastP}/${slowP}`,
    score,
    label,
    value: `${f.toFixed(2)} / ${s.toFixed(2)}`,
    neutral: score === 0,
    partial: !isGolden,
  };
}

function pricePositionSignal(closes) {
  const s100 = sma(closes, 100);
  const ref = last(s100) ?? lastDef(sma(closes, 50));
  if (ref == null) {
    return { name: 'Giá vs SMA 100', score: 0, label: 'Chưa đủ dữ liệu', value: '—', neutral: true };
  }
  const price = last(closes);
  const pos = (price - ref) / ref;
  let score = 0, label = 'Trung tính';
  if (pos > 0.08) { score = 0.8; label = 'Giá cao hơn SMA 100 nhiều (đà tăng mạnh)'; }
  else if (pos > 0.03) { score = 0.4; label = 'Giá trên SMA 100'; }
  else if (pos < -0.08) { score = -0.8; label = 'Giá thấp hơn SMA 100 nhiều (đà giảm mạnh)'; }
  else if (pos < -0.03) { score = -0.4; label = 'Giá dưới SMA 100'; }
  return { name: 'Giá vs SMA 100', score, label, value: `${(pos * 100).toFixed(1)}%`, neutral: score === 0 };
}

function longSlopeSignal(closes) {
  const period = Math.min(90, closes.length);
  if (period < 30) {
    return { name: 'Xu hướng 90N', score: 0, label: 'Chưa đủ dữ liệu', value: '—', neutral: true };
  }
  const sl = slope(closes, period);
  const cur = last(closes);
  // Annualised slope as % of current price
  const annualPct = (sl / cur) * 252 * 100;
  let score = 0, label = 'Đi ngang';
  if (annualPct > 15) { score = 1; label = `Hồi quy tuyến tính: ${annualPct.toFixed(1)}%/năm`; }
  else if (annualPct > 5) { score = 0.5; label = `Tăng dần: ${annualPct.toFixed(1)}%/năm`; }
  else if (annualPct < -15) { score = -1; label = `Hồi quy tuyến tính: ${annualPct.toFixed(1)}%/năm`; }
  else if (annualPct < -5) { score = -0.5; label = `Giảm dần: ${annualPct.toFixed(1)}%/năm`; }
  return { name: 'Xu hướng 90N', score, label, value: `${annualPct >= 0 ? '+' : ''}${annualPct.toFixed(1)}%/năm`, neutral: score === 0 };
}

function rangePositionSignal(closes) {
  const window = closes.slice(Math.max(0, closes.length - 252));
  if (window.length < 30) {
    return { name: '52 tuần', score: 0, label: 'Chưa đủ dữ liệu', value: '—', neutral: true };
  }
  const hi = Math.max(...window);
  const lo = Math.min(...window);
  const cur = last(closes);
  const pos = (cur - lo) / (hi - lo); // 0 = đáy, 1 = đỉnh
  let score = 0, label = 'Vùng giữa biên độ';
  // Mean-reversion logic: gần đỉnh → giảm về sau; gần đáy → tăng về sau
  if (pos > 0.92) { score = -0.6; label = 'Sát đỉnh 52 tuần (rủi ro điều chỉnh)'; }
  else if (pos > 0.75) { score = -0.2; label = 'Gần đỉnh 52 tuần'; }
  else if (pos < 0.08) { score = 0.6; label = 'Sát đáy 52 tuần (cơ hội phục hồi)'; }
  else if (pos < 0.25) { score = 0.2; label = 'Gần đáy 52 tuần'; }
  return { name: '52 tuần', score, label, value: `${(pos * 100).toFixed(0)}% biên độ`, neutral: score === 0 };
}

function rocSignal(closes) {
  if (closes.length < 90) {
    return { name: 'ROC 90N', score: 0, label: 'Chưa đủ dữ liệu', value: '—', neutral: true };
  }
  const past = closes[closes.length - 90];
  const cur = last(closes);
  const roc = (cur - past) / past * 100;
  let score = 0, label = 'Đi ngang';
  if (roc > 12) { score = 0.8; label = 'Đà tăng mạnh quý vừa qua'; }
  else if (roc > 4) { score = 0.4; label = 'Đà tăng vừa phải'; }
  else if (roc < -12) { score = -0.8; label = 'Đà giảm mạnh quý vừa qua'; }
  else if (roc < -4) { score = -0.4; label = 'Đà giảm vừa phải'; }
  return { name: 'ROC 90N', score, label, value: `${roc >= 0 ? '+' : ''}${roc.toFixed(1)}%`, neutral: score === 0 };
}

export function predictLongTerm(history) {
  const closes = history.map((p) => p.price);
  if (closes.length < 30) {
    return {
      composite: 0,
      label: 'CHƯA ĐỦ DỮ LIỆU',
      direction: 'neutral',
      confidence: 0,
      signals: [],
      partial: true,
      message: `Cần ít nhất 30 ngày dữ liệu cho dự báo dài hạn (hiện có ${closes.length}). ` +
        `Nếu vừa load lần đầu, hãy chờ backfill xong; nếu API hết quota, mở DevTools (F12) → Console để xem lỗi.`,
    };
  }

  const signals = [
    { ...smaCrossLongSignal(closes), weight: 1.6 },
    { ...pricePositionSignal(closes), weight: 1.1 },
    { ...longSlopeSignal(closes),    weight: 1.3 },
    { ...rangePositionSignal(closes), weight: 0.8 },
    { ...rocSignal(closes),           weight: 1.0 },
  ];

  let weightedSum = 0, weightTotal = 0;
  for (const s of signals) {
    weightedSum += s.score * s.weight;
    weightTotal += s.weight;
  }
  const composite = weightedSum / weightTotal;
  const abs = Math.abs(composite);

  let label, dir;
  if (composite > 0.4) { label = 'TĂNG DÀI HẠN'; dir = 'up'; }
  else if (composite > 0.15) { label = 'NGHIÊNG TĂNG'; dir = 'up'; }
  else if (composite < -0.4) { label = 'GIẢM DÀI HẠN'; dir = 'down'; }
  else if (composite < -0.15) { label = 'NGHIÊNG GIẢM'; dir = 'down'; }
  else { label = 'TÍCH LŨY / ĐI NGANG'; dir = 'neutral'; }

  const nonNeutral = signals.filter((s) => !s.neutral);
  const agreement = nonNeutral.length
    ? nonNeutral.filter((s) => Math.sign(s.score) === Math.sign(composite)).length / nonNeutral.length
    : 0;
  const dataCoverage = Math.min(1, closes.length / 200); // 200 ngày = đủ cho SMA200
  let confidence = 0.45 * abs + 0.3 * agreement + 0.25 * dataCoverage;
  confidence = Math.max(0, Math.min(1, confidence));

  const isPartial = signals.some((s) => s.partial);

  return { composite, label, direction: dir, confidence, signals, partial: isPartial };
}
