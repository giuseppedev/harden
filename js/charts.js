// Trend charts: averages per day / week / month / quarter / year, with navigation back in time. Plus a tiny sparkline.
import { ui, esc, $, actions } from "./core.js";
import * as L from "./logic.js";

const chartData = {};

export function chartBlock(id, points, unit, defaultGran, { table = false } = {}) {
  chartData[id] = { points, unit, table };
  ui.charts[id] ??= { g: defaultGran, off: 0 };
  return `<div class="chart stack" data-chart="${id}">${chartInner(id)}</div>`;
}

function chartInner(id) {
  const { points, unit, table } = chartData[id];
  const st = ui.charts[id];
  const r = L.bucketSeries(points, st.g, st.off);
  const seg = `<div class="gran" role="group" aria-label="Raggruppa per">${L.GRANULARITIES.map((g) => `<button class="${g.k === st.g ? "sel" : ""}" data-act="chart-g" data-chart="${id}" data-g="${g.k}" aria-pressed="${g.k === st.g}">${g.name}</button>`).join("")}</div>`;
  if (!r.buckets.length) return seg + `<p class="hint">Nessun dato.</p>`;
  const nav = `<div class="nav-row"><button class="icon-btn" data-act="chart-pan" data-chart="${id}" data-dir="1" ${r.hasOlder ? "" : "disabled"} aria-label="Periodo precedente">‹</button>
    <div class="nav-date"><b>${esc(r.buckets[0].label)} – ${esc(r.buckets[r.buckets.length - 1].label)}</b><span class="hint">${st.off ? `${st.off} ${st.off === 1 ? "periodo" : "periodi"} fa` : "periodo più recente"}</span></div>
    <button class="icon-btn" data-act="chart-pan" data-chart="${id}" data-dir="-1" ${r.hasNewer ? "" : "disabled"} aria-label="Periodo successivo">›</button></div>`;
  const filled = r.buckets.map((b, i) => ({ ...b, i })).filter((b) => b.v != null);
  if (!filled.length) return seg + nav + `<p class="hint empty">Nessun valore in questo periodo.</p>`;
  const W = 320, H = 160, pl = 36, pr = 12, pt = 20, pb = 24;
  let lo = Math.min(...filled.map((b) => b.v)), hi = Math.max(...filled.map((b) => b.v));
  if (hi - lo < 1) { const m = (hi + lo) / 2; lo = m - 0.5; hi = m + 0.5; }
  const pad = (hi - lo) * 0.12; lo -= pad; hi += pad;
  const n = r.buckets.length;
  const x = (i) => pl + (n === 1 ? 0.5 : i / (n - 1)) * (W - pl - pr);
  const y = (v) => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const path = filled.map((b, j) => `${j ? "L" : "M"}${x(b.i).toFixed(1)} ${y(b.v).toFixed(1)}`).join(" ");
  const area = filled.length > 1 ? `${path} L${x(filled[filled.length - 1].i).toFixed(1)} ${H - pb} L${x(filled[0].i).toFixed(1)} ${H - pb} Z` : "";
  const lastB = filled[filled.length - 1];
  const labels = [0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i);
  // Value labels on the dots, at least 26px apart; the newest value always gets its label.
  const GAP = 26;
  let labelled = [];
  for (const b of filled) if (!labelled.length || x(b.i) - x(labelled[labelled.length - 1].i) >= GAP) labelled.push(b);
  labelled = labelled.filter((b) => b === lastB || x(lastB.i) - x(b.i) >= GAP);
  if (!labelled.includes(lastB)) labelled.push(lastB);
  const round = (v) => L.fmtNum(Math.round(v * 10) / 10);
  const vlabels = labelled.map((b) => {
    const cy = y(b.v), below = cy - 8 < pt + 4;
    const anchor = b.i === 0 ? "start" : b.i === n - 1 ? "end" : "middle";
    return `<text class="vlabel ${b.alt ? "alt" : ""}" x="${x(b.i).toFixed(1)}" y="${(below ? cy + 14 : cy - 7).toFixed(1)}" text-anchor="${anchor}">${round(b.v)}</text>`;
  }).join("");
  const svg = `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Andamento in ${unit}">
    ${ticks.map((t) => `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="axis" x="${pl - 4}" y="${(y(t) + 3).toFixed(1)}" text-anchor="end">${round(t)}</text>`).join("")}
    ${area ? `<path class="area" d="${area}"/>` : ""}<path class="line" d="${path}"/>
    <circle class="dot last ${lastB.alt ? "alt" : ""}" cx="${x(lastB.i).toFixed(1)}" cy="${y(lastB.v).toFixed(1)}" r="4"/>
    ${filled.map((b) => `<circle class="dot ${b.alt ? "alt" : ""}" cx="${x(b.i).toFixed(1)}" cy="${y(b.v).toFixed(1)}" r="${b.alt ? 3.4 : 2.4}"><title>${esc(b.label)}: ${round(b.v)} ${unit}${b.alt ? " (altra bilancia)" : ""}</title></circle>`).join("")}
    ${vlabels}
    ${labels.map((i) => `<text class="axis" x="${x(i).toFixed(1)}" y="${H - 7}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${esc(r.buckets[i].short)}</text>`).join("")}
  </svg>`;
  const vals = filled.map((b) => b.v), avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const summary = `<div class="chart-sum"><span>Media <b>${round(avg)}</b></span><span>Min <b>${round(Math.min(...vals))}</b></span><span>Max <b>${round(Math.max(...vals))}</b></span>${filled.length > 1 ? `<span>Variazione <b>${L.fmtDelta(Math.round(lastB.v * 10) / 10, Math.round(filled[0].v * 10) / 10)}</b></span>` : ""}</div>`;
  const altNote = filled.some((b) => b.alt) ? `<p class="hint"><span class="alt-dot"></span> Punti arancioni: ${st.g === "D" ? "pesata" : "periodo con almeno una pesata"} su un'altra bilancia, può esserci uno scarto.</p>` : "";
  const note = (st.g === "D" ? "" : `<p class="hint">Ogni punto è la media del periodo.</p>`) + altNote;
  const tbl = table ? `<div class="tbl-wrap"><table class="tbl"><tr><th>Periodo</th><th class="num">${unit}</th><th class="num">vs prec.</th><th class="num">valori</th></tr>
    ${filled.slice().reverse().map((b, j, a) => `<tr><td>${esc(b.label)}${b.alt ? ' <span class="scale-tag">altra bil.</span>' : ""}</td><td class="num">${round(b.v)}</td><td class="num delta">${a[j + 1] ? L.fmtDelta(Math.round(b.v * 10) / 10, Math.round(a[j + 1].v * 10) / 10) : ""}</td><td class="num">${b.n}</td></tr>`).join("")}</table></div>` : "";
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
