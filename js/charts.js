// Trend charts over a calendar week, month, quarter or year (or the whole history) on a real time axis. Plus a tiny sparkline.
import { ui, esc, $, actions } from "./core.js";
import * as L from "./logic.js";

const chartData = {};
const W = 340, H = 196, PL = 8, PR = 44, PT = 22, PB = 26, LABEL_ROOM = 16; // the value axis sits on the right

/**
 * `decimals` fixes the number of decimals shown (e.g. 2 for body weight: 77,85).
 * `sessions` is for exercise loads: each point is the best of its day, week or month instead of the average.
 */
export function chartBlock(id, points, unit, defaultRange, { decimals = null, sessions = false } = {}) {
  chartData[id] = { points, unit, decimals, sessions };
  if (!L.RANGES.some((r) => r.k === ui.charts[id]?.g)) ui.charts[id] = { g: defaultRange, off: 0 };
  queueMicrotask(() => showPoint(id)); // fills the header once the block is in the page
  return `<div class="chart stack" data-chart="${id}">${chartInner(id)}</div>`;
}

/** Three to five round values covering lo..hi, at least `minSpan` apart end to end. */
function niceScale(lo, hi, minSpan = 1) {
  if (hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
  const raw = (hi - lo) / 3, mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw * 0.999);
  const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step, ticks = [];
  for (let v = a; v <= b + step / 2; v += step) ticks.push(+v.toFixed(6));
  const dec = (String(+step.toFixed(6)).split(".")[1] || "").length;
  return { lo: a, hi: b, ticks, dec };
}

/** Smooth line through the points that never overshoots them (monotone cubic). */
function smoothPath(p) {
  const f = (n) => n.toFixed(1);
  if (p.length < 3) return p.map((q, i) => `${i ? "L" : "M"}${f(q.x)} ${f(q.y)}`).join(" ");
  const n = p.length, dx = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = p[i + 1].x - p[i].x; m[i] = (p[i + 1].y - p[i].y) / dx[i]; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  let d = `M${f(p[0].x)} ${f(p[0].y)}`;
  for (let i = 0; i < n - 1; i++) d += ` C${f(p[i].x + dx[i] / 3)} ${f(p[i].y + (t[i] * dx[i]) / 3)} ${f(p[i + 1].x - dx[i] / 3)} ${f(p[i + 1].y - (t[i + 1] * dx[i]) / 3)} ${f(p[i + 1].x)} ${f(p[i + 1].y)}`;
  return d;
}

function chartInner(id) {
  const { points, unit, decimals, sessions } = chartData[id];
  const st = ui.charts[id];
  const r = L.chartSeries(points, st.g, st.off, { best: sessions });
  const seg = `<div class="gran" role="group" aria-label="Periodo">${L.RANGES.map((g) => `<button class="${g.k === st.g ? "sel" : ""}" data-act="chart-g" data-chart="${id}" data-g="${g.k}" aria-pressed="${g.k === st.g}" aria-label="${g.full}">${g.name}</button>`).join("")}</div>`;
  if (!r) return seg + `<p class="hint">Nessun dato.</p>`;
  const nav = st.g === "all" ? `<div class="nav-date"><b>${esc(r.title)}</b></div>`
    : `<div class="nav-row"><button class="icon-btn" data-act="chart-pan" data-chart="${id}" data-dir="1" ${r.hasOlder ? "" : "disabled"} aria-label="Periodo precedente">‹</button>
    <div class="nav-date"><b>${esc(r.title)}</b>${r.when ? `<span class="hint">${esc(r.when)}</span>` : ""}</div>
    <button class="icon-btn" data-act="chart-pan" data-chart="${id}" data-dir="-1" ${r.hasNewer ? "" : "disabled"} aria-label="Periodo successivo">›</button></div>`;
  const pts = r.buckets;
  if (!pts.length) return seg + nav + `<p class="hint empty">Nessun valore in questo periodo.</p>`;

  const f = 10 ** (decimals ?? 1), fmt = (v) => (decimals != null ? (Math.round(v * f) / f).toFixed(decimals).replace(".", ",") : L.fmtNum(Math.round(v * f) / f));
  const vals = pts.map((b) => b.v), sc = niceScale(Math.min(...vals), Math.max(...vals));
  const plotR = W - PR, base = H - PB;
  const x = (pos) => PL + (pos / r.days) * (plotR - PL);
  const y = (v) => PT + (1 - (v - sc.lo) / (sc.hi - sc.lo)) * (base - LABEL_ROOM - PT);
  const xy = pts.map((b) => ({ ...b, x: x(b.pos), y: y(b.v) }));
  chartData[id].xs = xy.map((p) => ({ start: p.start, x: p.x }));

  const yAxis = sc.ticks.map((v) => `<line class="hgrid" x1="${PL}" x2="${plotR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/>
    <text class="axis" x="${W - 2}" y="${(y(v) + 3.5).toFixed(1)}" text-anchor="end">${v.toFixed(sc.dec).replace(".", ",")}</text>`).join("");
  const xAxis = r.ticks.map((t) => { const tx = x(t.pos).toFixed(1);
    return `<line class="vgrid" x1="${tx}" x2="${tx}" y1="${PT - 8}" y2="${base}"/>
    <text class="axis" x="${t.mid != null ? x(t.mid).toFixed(1) : t.edge ? (+tx + 3).toFixed(1) : tx}" y="${H - 8}" text-anchor="${t.edge && t.mid == null ? "start" : "middle"}">${esc(t.label)}</text>`; }).join("");
  const line = smoothPath(xy);
  const area = xy.length > 1 ? `<path class="area" fill="url(#ga-${id})" d="${line} L${xy[xy.length - 1].x.toFixed(1)} ${base} L${xy[0].x.toFixed(1)} ${base} Z"/>` : "";

  // Labels on the lowest and the highest point only; tap anywhere to read the others.
  const iMax = vals.indexOf(Math.max(...vals)), iMin = vals.indexOf(Math.min(...vals));
  const tag = (p, below) => `<text class="vlabel ${p.alt ? "alt" : ""}" x="${Math.min(Math.max(p.x, PL + 18), plotR - 18).toFixed(1)}" y="${(below ? p.y + 17 : p.y - 9).toFixed(1)}" text-anchor="middle">${fmt(p.v)}</text>`;
  const tags = xy.length > 1 && iMax !== iMin ? tag(xy[iMax], false) + tag(xy[iMin], true) : tag(xy[xy.length - 1], false);
  const small = xy.length > 40 ? 2.2 : 3.2;
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  Object.assign(chartData[id], { xy, small, base, fmt, step: r.step, summary: { label: sessions ? "Carico migliore" : "Media", v: sessions ? Math.max(...vals) : avg },
    change: vals.length > 1 ? L.fmtDelta(vals[vals.length - 1], vals[0], decimals) : null });
  const dots = xy.map((p) => `<circle class="dot ${p.alt ? "alt" : ""}" data-k="${p.start}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${small}"/>`).join("");
  const svg = `<svg class="trend" viewBox="0 0 ${W} ${H}" data-chart-svg="${id}" role="img" aria-label="Andamento in ${unit}">
    <defs><linearGradient id="ga-${id}" x1="0" x2="0" y1="0" y2="1"><stop class="g0" offset="0"/><stop class="g1" offset="1"/></linearGradient></defs>
    ${yAxis}${xAxis}<line class="grid" x1="${PL}" x2="${plotR}" y1="${base}" y2="${base}"/>
    ${area}<line class="rule" x1="0" x2="0" y1="${PT - 8}" y2="${base}" visibility="hidden"/><path class="line" d="${line}"/>${dots}${tags}</svg>`;
  const altNote = xy.some((p) => p.alt) ? `<p class="hint"><span class="alt-dot"></span> ${r.step === "D" ? "Pesata" : "Periodo con almeno una pesata"} su un'altra bilancia</p>` : "";
  const help = `<p class="hint chart-help">Tocca o trascina il dito sul grafico per leggere ogni punto.</p>`;
  return seg + nav + `<div class="chart-read"></div>` + svg + help + altNote;
}

/**
 * Above the chart: the period at a glance (average, or best load for an exercise, and the change), or the point under
 * the finger. Min and max are already written on the chart, the latest value in the card above it.
 */
function showPoint(id) {
  const c = chartData[id], st = ui.charts[id], box = $(`[data-chart="${id}"]`);
  if (!c?.xy || !box) return;
  const sel = c.xy.find((p) => p.start === st.sel), last = c.xy[c.xy.length - 1], many = (n) => (c.sessions ? `migliore di ${n} sessioni` : `media di ${n} valori`);
  const head = sel ? { label: `${sel.label}${sel.n > 1 && c.step !== "D" ? ` · ${many(sel.n)}` : ""}`, v: sel.v, alt: sel.alt } : { ...c.summary, alt: 0 };
  const change = c.change ? `<div class="chg"><span class="hint">Variazione</span><b>${c.change}</b></div>` : "";
  const read = box.querySelector(".chart-read");
  if (read) read.innerHTML = `<div><span class="hint">${esc(head.label)}</span><b class="${head.alt ? "alt" : ""}">${c.fmt(head.v)} ${c.unit}</b></div>${change}`;
  const on = sel || last; // the latest point stays marked when nothing is picked
  box.querySelectorAll(".trend .dot").forEach((d) => { const is = d.getAttribute("data-k") === on.start; d.classList.toggle("sel", is); d.setAttribute("r", String(is ? 5 : c.small)); });
  const rule = box.querySelector(".trend .rule");
  if (rule) { rule.setAttribute("x1", on.x.toFixed(1)); rule.setAttribute("x2", on.x.toFixed(1)); rule.setAttribute("visibility", sel ? "visible" : "hidden"); }
}

function rerenderChart(id) {
  const el = $(`[data-chart="${id}"]`);
  if (el && chartData[id]) { el.innerHTML = chartInner(id); showPoint(id); }
}

/** Small line without axes for dashboard tiles. */
export function sparkline(values) {
  if (values.length < 2) return "";
  const lo = Math.min(...values), hi = Math.max(...values), span = hi - lo || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * 100, 4 + (1 - (v - lo) / span) * 26]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return `<svg class="spark" viewBox="0 0 100 34" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="${d} L100 34 L0 34Z"/><path d="${d}"/></svg>`;
}

export const MONTH_NAMES = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
/** Group dated records (already sorted) under a key, for collapsible lists. */
export function groupBy(items, keyFn) {
  const groups = [];
  for (const it of items) {
    const k = keyFn(it);
    let g = groups[groups.length - 1];
    if (!g || g.key !== k) { g = { key: k, items: [] }; groups.push(g); }
    g.items.push(it);
  }
  return groups;
}

Object.assign(actions, {
  "chart-g": (el) => { ui.charts[el.dataset.chart] = { g: el.dataset.g, off: 0 }; rerenderChart(el.dataset.chart); },
  "chart-pan": (el) => { const st = ui.charts[el.dataset.chart]; st.off = Math.max(0, st.off + +el.dataset.dir); st.sel = null; rerenderChart(el.dataset.chart); },
});

/*
 * Reading the points: tap one, or keep the finger on the chart and slide sideways; the header follows the finger.
 * A vertical swipe still scrolls the page (touch-action: pan-y), and it leaves the chart as it was.
 * Tapping the point already picked goes back to the summary of the period.
 */
let drag = null;
const nearestAt = (svg, clientX) => {
  const xy = chartData[svg.dataset.chartSvg]?.xy;
  if (!xy?.length) return null;
  const box = svg.getBoundingClientRect(), vx = ((clientX - box.left) / box.width) * W;
  return xy.reduce((a, p) => (Math.abs(p.x - vx) < Math.abs(a.x - vx) ? p : a)).start;
};
document.addEventListener("pointerdown", (e) => {
  const svg = /** @type {Element} */ (e.target).closest?.("svg.trend[data-chart-svg]");
  if (!(svg instanceof SVGSVGElement)) return;
  const id = svg.dataset.chartSvg;
  drag = { id, svg, x0: e.clientX, moved: false, before: ui.charts[id].sel, hit: nearestAt(svg, e.clientX) };
  try { svg.setPointerCapture(e.pointerId); } catch { /* not supported: moves still arrive while over the chart */ }
});
document.addEventListener("pointermove", (e) => {
  if (!drag) return;
  if (!drag.moved && Math.abs(e.clientX - drag.x0) < 6) return;
  drag.moved = true;
  const k = nearestAt(drag.svg, e.clientX);
  if (k && k !== ui.charts[drag.id].sel) { ui.charts[drag.id].sel = k; showPoint(drag.id); }
});
document.addEventListener("pointerup", () => {
  if (!drag) return;
  if (!drag.moved) { ui.charts[drag.id].sel = drag.before === drag.hit ? null : drag.hit; showPoint(drag.id); }
  drag = null;
});
document.addEventListener("pointercancel", () => {
  if (!drag) return;
  ui.charts[drag.id].sel = drag.before; showPoint(drag.id); // the page scrolled: nothing was picked
  drag = null;
});
