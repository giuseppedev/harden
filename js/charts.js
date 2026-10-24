// Trend charts: averages per day / week / month / quarter / year, with navigation back in time. Plus a tiny sparkline.
import { ui, esc, $, actions } from "./core.js";
import * as L from "./logic.js";

const chartData = {};

/** `decimals` fixes the number of decimals shown (e.g. 1 for body weight: 78,0). */
export function chartBlock(id, points, unit, defaultGran, { table = false, decimals = null } = {}) {
  chartData[id] = { points, unit, table, decimals };
  ui.charts[id] ??= { g: defaultGran, off: 0 };
  return `<div class="chart stack" data-chart="${id}">${chartInner(id)}</div>`;
}

function chartInner(id) {
  const { points, unit, table, decimals } = chartData[id];
  const st = ui.charts[id];
  const r = L.bucketSeries(points, st.g, st.off);
  const seg = `<div class="gran" role="group" aria-label="Raggruppa per">${L.GRANULARITIES.map((g) => `<button class="${g.k === st.g ? "sel" : ""}" data-act="chart-g" data-chart="${id}" data-g="${g.k}" aria-pressed="${g.k === st.g}">${g.name}</button>`).join("")}</div>`;
  if (!r.buckets.length) return seg + `<p class="hint">Nessun dato.</p>`;
  const filled = r.buckets.filter((b) => b.v != null);
  const nav = `<div class="nav-row"><button class="icon-btn" data-act="chart-pan" data-chart="${id}" data-dir="1" ${r.hasOlder ? "" : "disabled"} aria-label="Periodo precedente">‹</button>
    <div class="nav-date"><b>${esc(r.title)}</b><span class="hint">${st.off ? `${st.off} ${st.off === 1 ? "periodo" : "periodi"} fa` : "periodo attuale"}</span></div>
    <button class="icon-btn" data-act="chart-pan" data-chart="${id}" data-dir="-1" ${r.hasNewer ? "" : "disabled"} aria-label="Periodo successivo">›</button></div>`;
  if (!filled.length) return seg + nav + `<p class="hint empty">Nessun valore in questo periodo.</p>`;
  // One column per recorded value, evenly spaced, each with its value and date: no side axis to match by eye.
  // A window holds at most 12 points (months of a year), so the whole period always fits the width.
  const W = 320, pl = 18, pr = 18, pt = 22, pb = 30, H = 150, n = filled.length;
  const tight = n > 1 && (W - pl - pr) / (n - 1) < 34; // labels alternate above and below the dots
  const round = (v) => Math.round(v * 10) / 10;
  const fmt = (v) => (decimals != null ? round(v).toFixed(decimals).replace(".", ",") : L.fmtNum(round(v)));
  let lo = Math.min(...filled.map((b) => b.v)), hi = Math.max(...filled.map((b) => b.v));
  if (hi - lo < 1) { const m = (hi + lo) / 2; lo = m - 0.5; hi = m + 0.5; }
  const x = (j) => (n === 1 ? W / 2 : pl + (j * (W - pl - pr)) / (n - 1));
  const y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb - (tight ? 14 : 0));
  const path = filled.map((b, j) => `${j ? "L" : "M"}${x(j).toFixed(1)} ${y(b.v).toFixed(1)}`).join(" ");
  const area = n > 1 ? `${path} L${x(n - 1).toFixed(1)} ${H - pb} L${x(0).toFixed(1)} ${H - pb} Z` : "";
  const cols = filled.map((b, j) => {
    const cx = x(j).toFixed(1), cy = y(b.v), last = j === n - 1;
    const ly = tight && (n - 1 - j) % 2 ? cy + 16 : cy - 9;
    return `<circle class="dot ${last ? "last" : ""} ${b.alt ? "alt" : ""}" cx="${cx}" cy="${cy.toFixed(1)}" r="${last ? 4 : 3}"><title>${esc(b.label)}: ${fmt(b.v)} ${unit}${b.alt ? " (altra bilancia)" : ""}</title></circle>
      <text class="vlabel ${b.alt ? "alt" : ""} ${last ? "last" : ""}" x="${cx}" y="${ly.toFixed(1)}" text-anchor="middle">${fmt(b.v)}</text>
      <text class="axis" x="${cx}" y="${H - 10}" text-anchor="middle">${esc(b.short)}</text>`;
  }).join("");
  const svg = `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Andamento in ${unit}">
    <line class="grid" x1="0" x2="${W}" y1="${H - pb + 6}" y2="${H - pb + 6}"/>
    ${area ? `<path class="area" d="${area}"/>` : ""}<path class="line" d="${path}"/>${cols}</svg>`;
  const lastB = filled[n - 1];
  const vals = filled.map((b) => b.v), avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const summary = `<div class="chart-sum"><span>Media <b>${fmt(avg)}</b></span><span>Min <b>${fmt(Math.min(...vals))}</b></span><span>Max <b>${fmt(Math.max(...vals))}</b></span>${filled.length > 1 ? `<span>Variazione <b>${L.fmtDelta(Math.round(lastB.v * 10) / 10, Math.round(filled[0].v * 10) / 10)}</b></span>` : ""}</div>`;
  const altNote = filled.some((b) => b.alt) ? `<p class="hint"><span class="alt-dot"></span> Punti arancioni: ${st.g === "D" ? "pesata" : "periodo con almeno una pesata"} su un'altra bilancia, può esserci uno scarto.</p>` : "";
  const note = (st.g === "D" ? "" : `<p class="hint">Ogni punto è la media del periodo.</p>`) + altNote;
  const tbl = table ? `<div class="tbl-wrap"><table class="tbl"><tr><th>Periodo</th><th class="num">${unit}</th><th class="num">vs prec.</th><th class="num">valori</th></tr>
    ${filled.slice().reverse().map((b, j, a) => `<tr><td>${esc(b.label)}${b.alt ? ' <span class="scale-tag">altra bil.</span>' : ""}</td><td class="num">${fmt(b.v)}</td><td class="num delta">${a[j + 1] ? L.fmtDelta(Math.round(b.v * 10) / 10, Math.round(a[j + 1].v * 10) / 10) : ""}</td><td class="num">${b.n}</td></tr>`).join("")}</table></div>` : "";
  return seg + nav + svg + summary + note + tbl;
}

function rerenderChart(id) {
  const el = $(`[data-chart="${id}"]`);
  if (el && chartData[id]) el.innerHTML = chartInner(id);
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
  "chart-pan": (el) => { const st = ui.charts[el.dataset.chart]; st.off = Math.max(0, st.off + +el.dataset.dir); rerenderChart(el.dataset.chart); },
});
