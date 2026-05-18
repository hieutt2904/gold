// Chart.js rendering. Exposes one function per chart that creates or updates.

import { sma, ema, rsi as rsiFn, macd as macdFn, bollinger } from './indicators.js';

const chartInstances = {};

const COLORS = {
  price: '#f6c453',
  sma7: '#4ea8de',
  sma21: '#a78bfa',
  bbUp: 'rgba(167,139,250,0.25)',
  bbLow: 'rgba(167,139,250,0.25)',
  bbFill: 'rgba(167,139,250,0.08)',
  rsi: '#4ea8de',
  rsiOverbought: 'rgba(255,90,95,0.5)',
  rsiOversold: 'rgba(46,204,113,0.5)',
  macdLine: '#4ea8de',
  macdSignal: '#f6c453',
  macdHist: '#a78bfa',
  green: '#2ecc71',
  red: '#ff5a5f',
  text: '#e8ecf3',
  muted: '#8a93a6',
  grid: 'rgba(255,255,255,0.05)',
};

const baseOptions = (formatter) => ({
  responsive: true,
  maintainAspectRatio: false,
  interaction: { mode: 'index', intersect: false },
  plugins: {
    legend: {
      labels: { color: COLORS.muted, font: { size: 11 }, boxWidth: 14, boxHeight: 8 },
    },
    tooltip: {
      backgroundColor: '#1c2030',
      titleColor: COLORS.text,
      bodyColor: COLORS.text,
      borderColor: '#2a3145',
      borderWidth: 1,
      padding: 10,
      callbacks: formatter ? { label: (ctx) => `${ctx.dataset.label}: ${formatter(ctx.parsed.y)}` } : {},
    },
  },
  scales: {
    x: {
      type: 'time',
      time: { unit: 'day', tooltipFormat: 'dd MMM yyyy', displayFormats: { day: 'dd/MM' } },
      ticks: { color: COLORS.muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
      grid: { color: COLORS.grid },
    },
    y: {
      ticks: {
        color: COLORS.muted,
        callback: function (v) { return formatter ? formatter(v) : v; },
      },
      grid: { color: COLORS.grid },
    },
  },
});

function destroy(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

export function renderPriceChart(history, currency, formatPrice, convert) {
  destroy('price');
  const ctx = document.getElementById('price-chart');
  const closes = history.map((p) => p.price);
  const sma7 = sma(closes, 7);
  const sma21 = sma(closes, 21);
  const bb = bollinger(closes, 20, 2);

  const xs = history.map((p) => p.date);
  const data = (arr) => arr.map((v, i) => ({ x: xs[i], y: v == null ? null : convert(v) }));

  chartInstances.price = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: `Giá (${currency})`,
          data: history.map((p) => ({ x: p.date, y: convert(p.price) })),
          borderColor: COLORS.price,
          backgroundColor: 'rgba(246,196,83,0.08)',
          borderWidth: 2,
          fill: true,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.2,
        },
        {
          label: 'SMA 7',
          data: data(sma7),
          borderColor: COLORS.sma7,
          borderWidth: 1.5,
          borderDash: [4, 4],
          fill: false,
          pointRadius: 0,
          tension: 0.2,
        },
        {
          label: 'SMA 21',
          data: data(sma21),
          borderColor: COLORS.sma21,
          borderWidth: 1.5,
          borderDash: [6, 4],
          fill: false,
          pointRadius: 0,
          tension: 0.2,
        },
        {
          label: 'BB trên',
          data: data(bb.upper),
          borderColor: COLORS.bbUp,
          backgroundColor: COLORS.bbFill,
          borderWidth: 1,
          fill: '+1',
          pointRadius: 0,
          tension: 0.2,
        },
        {
          label: 'BB dưới',
          data: data(bb.lower),
          borderColor: COLORS.bbLow,
          borderWidth: 1,
          fill: false,
          pointRadius: 0,
          tension: 0.2,
        },
      ],
    },
    options: baseOptions(formatPrice),
  });
}

export function renderRsiChart(history) {
  destroy('rsi');
  const ctx = document.getElementById('rsi-chart');
  const closes = history.map((p) => p.price);
  const r = rsiFn(closes, 14);
  const xs = history.map((p) => p.date);

  const opts = baseOptions(null);
  opts.scales.y.min = 0;
  opts.scales.y.max = 100;
  opts.scales.y.ticks.callback = (v) => v;
  opts.plugins.legend.display = false;

  chartInstances.rsi = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [
        {
          label: 'RSI 14',
          data: r.map((v, i) => ({ x: xs[i], y: v })),
          borderColor: COLORS.rsi,
          backgroundColor: 'rgba(78,168,222,0.08)',
          borderWidth: 2,
          fill: true,
          pointRadius: 0,
          tension: 0.2,
        },
        {
          label: 'Quá mua (70)',
          data: xs.map((d) => ({ x: d, y: 70 })),
          borderColor: COLORS.rsiOverbought,
          borderWidth: 1,
          borderDash: [4, 4],
          fill: false,
          pointRadius: 0,
        },
        {
          label: 'Quá bán (30)',
          data: xs.map((d) => ({ x: d, y: 30 })),
          borderColor: COLORS.rsiOversold,
          borderWidth: 1,
          borderDash: [4, 4],
          fill: false,
          pointRadius: 0,
        },
      ],
    },
    options: opts,
  });
}

export function renderMacdChart(history) {
  destroy('macd');
  const ctx = document.getElementById('macd-chart');
  const closes = history.map((p) => p.price);
  const m = macdFn(closes, 12, 26, 9);
  const xs = history.map((p) => p.date);

  const opts = baseOptions(null);
  opts.scales.y.ticks.callback = (v) => v.toFixed(1);

  chartInstances.macd = new Chart(ctx, {
    type: 'bar',
    data: {
      datasets: [
        {
          type: 'bar',
          label: 'Histogram',
          data: m.histogram.map((v, i) => ({ x: xs[i], y: v })),
          backgroundColor: m.histogram.map((v) => (v == null ? 'transparent' : v >= 0 ? 'rgba(46,204,113,0.5)' : 'rgba(255,90,95,0.5)')),
          borderWidth: 0,
        },
        {
          type: 'line',
          label: 'MACD',
          data: m.line.map((v, i) => ({ x: xs[i], y: v })),
          borderColor: COLORS.macdLine,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.2,
        },
        {
          type: 'line',
          label: 'Signal',
          data: m.signal.map((v, i) => ({ x: xs[i], y: v })),
          borderColor: COLORS.macdSignal,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.2,
        },
      ],
    },
    options: opts,
  });
}
