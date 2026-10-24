// Logbook: the coach's sheet, one page per sheet letter, filled only in the weeks done. Exported as PDF.
import * as L from "../logic.js";
import { esc, D, ui, actions, toast, render, cycle } from "../core.js";

export function viewLogbook(d) {
  const c = cycle();
  if (!c) return `<p class="empty">Nessun ciclo.</p>`;
  const letters = L.sheetLetters(c);
  if (!letters.includes(ui.sheet)) ui.sheet = letters[0];
  const rows = L.logbookRows(d, c, ui.sheet);
  const head = `<tr><th class="name"></th>${Array.from({ length: 4 }, (_, w) => `<th colspan="4" class="sep">Settimana ${w + 1}</th>`).join("")}</tr>`;
  const body = rows.map((r, idx) => {
    const maxSets = Math.max(8, ...Object.values(r.weeks).map((x) => x.length));
    const halves = Math.ceil(maxSets / 4);
    const lines = [];
    for (let h = 0; h < halves; h++) {
      lines.push(`<tr class="${r.isSub ? "subrow" : ""}">${[1, 2, 3, 4].map(() => [0, 1, 2, 3].map((k) => `<td class="num ${k ? "" : "sep"}">${h * 4 + k + 1}</td>`).join("")).join("")}</tr>`);
      ["reps", "load"].forEach((f) => lines.push(`<tr>${[1, 2, 3, 4].map((w) => [0, 1, 2, 3].map((k) => { const st = r.weeks[w]?.[h * 4 + k]; const v = st ? (f === "load" ? L.fmtNum(st.load) : st.reps ?? "") : ""; return `<td class="${k ? "" : "sep"} ${st ? "filled" : ""}">${esc(v)}</td>`; }).join("")).join("")}</tr>`));
    }
    lines[0] = lines[0].replace(/^<tr([^>]*)>/, `<tr$1><td class="name" rowspan="${halves * 3}">${idx + 1}. ${esc(L.exName(d, r.exerciseId))}${r.isSub ? `<small>(sost. di ${esc(L.exName(d, r.originalId))})</small>` : ""}</td>`);
    return lines.join("");
  }).join("");
  return `<section class="card stack"><div class="row"><div><div class="label">Ciclo ${c.number}${c.closed ? " · chiuso" : ""}</div><span class="hint">${esc(L.fmtRange(c.startDate, L.cycleEnd(c)))}</span></div><button class="btn small" data-act="export-logbook">Esporta PDF</button></div>
    <p class="hint">Per un altro ciclo sceglilo nel tab Scheda. Le serie MAV non vengono riportate; i sostituti hanno una riga loro.</p></section>
  <div class="grid4">${letters.map((l) => `<button class="pick ${l === ui.sheet ? "sel" : ""}" data-act="log-sheet" data-sheet="${esc(l)}"><b>${esc(l)}</b></button>`).join("")}</div>
  <div class="sheet-wrap"><div class="sheet-head"><b>Scheda ${esc(ui.sheet)}</b><span>${esc(d.profile?.athlete || "")} · Ciclo ${c.number}</span></div>
  <table class="sheet">${head}${body}</table></div>`;
}

Object.assign(actions, {
  "log-sheet": (el) => { ui.sheet = el.dataset.sheet; render(); },
  "export-logbook": async (el) => {
    el.disabled = true; el.textContent = "Preparo…";
    try {
      const pdf = await import("../pdf.js");
      const c = cycle();
      const bytes = await pdf.logbookPdf(D(), c);
      await pdf.deliverFile(bytes, `Logbook ciclo ${c.number} - ${L.todayISO()}.pdf`, "application/pdf");
    } catch (e) { toast(e.message, { error: true }); }
    el.disabled = false; el.textContent = "Esporta PDF";
  },
});
