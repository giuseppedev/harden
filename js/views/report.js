// Report: comparison across the selected cycles, with collapsible sections.
import * as store from "../data.js";
import * as L from "../logic.js";
import { esc, ui, changes, toast, render, byDate } from "../core.js";

const section = (title, body, open = true) => `<details class="card rep-sec" ${open ? "open" : ""}><summary><h2>${title}</h2></summary><div class="stack">${body}</div></details>`;

export function viewReport(d) {
  const all = L.cyclesSorted(d);
  ui.rep.cycles ??= new Set(all.map((c) => c.id));
  const ids = all.filter((c) => ui.rep.cycles.has(c.id)).map((c) => c.id);
  const rep = L.reportData(d, ids), cyc = rep.cycles;
  const filters = `<section class="card stack"><div class="label">Cicli</div>
    <div class="chips">${all.map((c) => `<label class="chip"><input type="checkbox" data-act="rep-cycle" value="${c.id}" ${ui.rep.cycles.has(c.id) ? "checked" : ""}>Ciclo ${c.number}</label>`).join("")}</div>
    <div class="tiles">
    <div class="tile"><b>${cyc.length}</b><span>${cyc.length === 1 ? "ciclo" : "cicli"}</span></div><div class="tile"><b>${rep.sessionsDone}</b><span>sessioni fatte</span></div>
    <div class="tile"><b>${rep.planned ? `${Math.round((Math.min(rep.sessionsDone, rep.planned) / rep.planned) * 100)}%` : "–"}</b><span>aderenza</span></div></div></section>`;
  const head = cyc.map((c) => `<th class="num">C${c.number}</th>`).join("");
  const parts = [filters];
  parts.push(section("Progressione carichi", `<p class="hint">Carico migliore a inizio → fine ciclo, solo dischi. Tocca un esercizio per lo storico completo.</p>
    <div class="tbl-wrap"><table class="tbl"><tr><th>Esercizio</th>${head}</tr>
    ${rep.compare.map((r) => `<tr class="tap" data-act="history" data-ex="${r.exerciseId}"><td>${esc(r.name)}</td>${r.perCycle.map((p) => `<td class="num">${p ? `${L.fmtNum(p.first) || "–"} → <span class="${p.last > p.first ? "up" : ""}">${L.fmtNum(p.last) || "–"}</span>` : "–"}</td>`).join("")}</tr>`).join("")}</table></div>`));
  parts.push(section("Volume per distretto", `<p class="hint">Serie fatte per ciclo. Del MAV conta solo l'ultima serie.</p>
    <div class="tbl-wrap"><table class="tbl"><tr><th>Distretto</th>${head}</tr>
    ${Object.keys(rep.volume).sort().map((k) => `<tr><td><span class="dist">${esc(k)}</span> ${esc(L.DISTRICT_NAMES[k] || "")}</td>${cyc.map((c) => `<td class="num">${rep.volume[k][c.id] || 0}</td>`).join("")}</tr>`).join("")}</table></div>`, false));
  parts.push(section("Corpo nei cicli scelti", bodyRange(d, cyc), false));
  return parts.join("");
}

/** First and last weight and circumferences inside the span of the selected cycles. */
function bodyRange(d, cyc) {
  if (!cyc.length) return `<p class="hint">Nessun ciclo selezionato.</p>`;
  const from = cyc[0].startDate, to = L.cycleEnd(cyc[cyc.length - 1]);
  const inRange = (x) => x.date >= from && x.date <= to;
  const ms = store.live(d.measurements).filter(inRange).sort(byDate);
  const ws = store.live(d.weights).filter(inRange).sort(byDate);
  if (!ms.length && !ws.length) return `<p class="hint">Nessuna misura in questo periodo.</p>`;
  const rows = [];
  if (ws.length) { const f = ws[0], l = ws[ws.length - 1]; rows.push(`<tr><td>Peso (kg)${f.scale === "other" || l.scale === "other" ? "*" : ""}</td><td class="num">${L.fmtKg(f.kg)}</td><td class="num">${L.fmtKg(l.kg)}</td><td class="num">${L.fmtDelta(l.kg, f.kg, 2)}</td></tr>`); }
  if (ms.length) {
    const f = ms[0], l = ms[ms.length - 1];
    L.MEASURES.forEach((m) => rows.push(`<tr><td>${m.name}</td><td class="num">${L.fmtNum(f.values[m.k]) || "–"}</td><td class="num">${L.fmtNum(l.values[m.k]) || "–"}</td><td class="num">${L.fmtDelta(l.values[m.k], f.values[m.k])}</td></tr>`));
  }
  return `<p class="hint">Prima e ultima rilevazione tra ${esc(L.fmtRange(from, to))}.</p>
    <div class="tbl-wrap"><table class="tbl"><tr><th></th><th class="num">Inizio</th><th class="num">Fine</th><th class="num">Δ</th></tr>${rows.join("")}</table></div>
    ${ws.some((w) => w.scale === "other") ? `<p class="hint">* almeno una pesata su un'altra bilancia.</p>` : ""}`;
}

Object.assign(changes, {
  "rep-cycle": (t) => { t.checked ? ui.rep.cycles.add(t.value) : ui.rep.cycles.delete(t.value); if (!ui.rep.cycles.size) { ui.rep.cycles.add(t.value); toast("Serve almeno un ciclo"); } render(); },
});

