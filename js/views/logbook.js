// Logbook: the coach's sheet, one page per sheet letter, filled only in the weeks done. Exported as PDF.
import * as L from "../logic.js";
import { esc, D, ui, actions, render, cycle, exportCard, runExport } from "../core.js";

export function viewLogbook(d) {
  const c = cycle();
  if (!c) return `<p class="empty">Nessun ciclo.</p>`;
  const letters = L.sheetLetters(c);
  if (!letters.includes(ui.sheet)) ui.sheet = letters[0];
  const rows = L.logbookRows(d, c, ui.sheet);
  const weeks = Array.from({ length: c.weeks }, (_, i) => i + 1); // 4 to 8 weeks, as the coach's program says
  const head = `<tr><th class="name"></th>${weeks.map((w) => `<th colspan="4" class="sep">Settimana ${w}</th>`).join("")}</tr>`;
  const body = rows.map((r, idx) => {
    const maxSets = Math.max(8, ...Object.values(r.weeks).map((x) => x.length));
    const halves = Math.ceil(maxSets / 4);
    const lines = [];
    for (let h = 0; h < halves; h++) {
      lines.push(`<tr class="${r.isSub ? "subrow" : ""}">${weeks.map(() => [0, 1, 2, 3].map((k) => `<td class="num ${k ? "" : "sep"}">${h * 4 + k + 1}</td>`).join("")).join("")}</tr>`);
      ["reps", "load"].forEach((f) => lines.push(`<tr>${weeks.map((w) => [0, 1, 2, 3].map((k) => { const st = r.weeks[w]?.[h * 4 + k]; const v = st ? (f === "load" ? L.fmtNum(st.load) : st.reps ?? "") : ""; return `<td class="${k ? "" : "sep"} ${st ? "filled" : ""}">${esc(v)}</td>`; }).join("")).join("")}</tr>`));
    }
    lines[0] = lines[0].replace(/^<tr([^>]*)>/, `<tr$1><td class="name" rowspan="${halves * 3}">${idx + 1}. ${esc(L.exName(d, r.exerciseId))}${r.isSub ? `<small>(sost. di ${esc(L.exName(d, r.originalId))})</small>` : ""}${Object.keys(r.variants).length ? `<small class="var">${esc(L.variantSummary(r.variants))}</small>` : ""}</td>`);
    return lines.join("");
  }).join("");
  return `${exportCard(`Logbook ciclo ${c.number}`, `${L.fmtRange(c.startDate, L.cycleEnd(c))} · tutte le schede`, "export-logbook")}
  <div class="grid4">${letters.map((l) => `<button class="pick ${l === ui.sheet ? "sel" : ""}" data-act="log-sheet" data-sheet="${esc(l)}"><b>${esc(l)}</b></button>`).join("")}</div>
  <div class="sheet-wrap"><div class="sheet-head"><b>Scheda ${esc(ui.sheet)}</b><span>${esc(d.profile?.athlete || "")} · Ciclo ${c.number}</span></div>
  <table class="sheet">${head}${body}</table></div>`;
}

Object.assign(actions, {
  "log-sheet": (el) => { ui.sheet = el.dataset.sheet; render(); },
  "export-logbook": (el) => runExport(el, async (pdf) => {
    const c = cycle();
    return { bytes: await pdf.logbookPdf(D(), c), name: `Logbook ciclo ${c.number} - ${L.todayISO()}.pdf` };
  }),
});
