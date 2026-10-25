// Measures: weight and circumferences in two sub-tabs; entry and editing happen in bottom sheets.
import * as store from "../data.js";
import * as L from "../logic.js";
import { $, $$, esc, D, ui, actions, confirmed, toast, openModal, closeModal, render, runSync, deleteWithUndo, byDate, exportCard, runExport } from "../core.js";
import { chartBlock, groupBy, MONTH_NAMES } from "../charts.js";
import { remindersFor, dueTag } from "../reminders.js";

function bodySvg() {
  return `<svg viewBox="0 0 200 350" role="img" aria-label="Punti di misurazione">
    <circle class="sil" cx="100" cy="26" r="17"/><rect class="sil" x="91" y="40" width="18" height="16" rx="4"/>
    <path class="sil" d="M60 62 Q100 52 140 62 L144 118 Q138 145 134 160 L136 198 L64 198 L66 160 Q62 145 56 118 Z"/>
    <path class="sil" d="M60 63 C44 68 42 90 42 110 L38 178 L51 179 L57 118 L63 90 Z"/>
    <path class="sil" d="M140 63 C156 68 158 90 158 110 L162 178 L149 179 L143 118 L137 90 Z"/>
    <path class="sil" d="M64 196 L63 300 L61 340 L84 340 L96 208 L104 208 L116 340 L139 340 L137 300 L136 196 Z"/>
    ${L.MEASURES.map((m, i) => { const [x1, y1, x2, y2] = m.line, on = m.k === ui.measureActive ? "on" : ""; return `<line class="${on}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/><text class="${on}" x="${m.k === "arm" ? x1 - 12 : x2 + 5}" y="${y1 + 3}">${i + 1}</text>`; }).join("")}
  </svg>`;
}

export function viewMeasures(d) {
  ui.mTab ??= "weight";
  const ws = store.live(d.weights).sort(byDate);
  const ms = store.live(d.measurements).sort(byDate);
  const tabs = `<div class="subtabs" role="tablist">
    <button role="tab" data-act="mtab" data-tab="weight" aria-selected="${ui.mTab === "weight"}">Peso</button>
    <button role="tab" data-act="mtab" data-tab="circ" aria-selected="${ui.mTab === "circ"}">Circonferenze</button></div>`;
  const rem = remindersFor(d, "measures").find((r) => r.key === ui.mTab);
  return exportCard("Misure e peso", "Ultime circonferenze e peso a 7 giorni", "export-measures") + tabs + (ui.mTab === "weight" ? weightTab(ws, rem) : circTab(ms, rem));
}

function weightTab(ws, rem) {
  const last = ws[ws.length - 1];
  if (!last) return `<section class="card stack"><h2>Peso</h2><p class="hint" style="font-size:14px">Registra il peso quando vuoi, anche ogni giorno.</p><button class="btn" data-act="weight-new">+ Registra peso</button></section>`;
  const week = ws.find((w) => w.date >= L.addDays(last.date, -7));
  const first = ws[0];
  const flag = (a, b) => (a?.scale === "other" || b?.scale === "other" ? "*" : "");
  return `
  <section class="card stack">
    <div class="row"><div class="label">Ultimo peso · ${esc(L.fmtDate(last.date))}${dueTag(rem)}</div>${last.scale === "other" ? '<span class="scale-tag">altra bilancia</span>' : ""}</div>
    <div class="big-value ${last.scale === "other" ? "alt" : ""}">${L.fmtKg(last.kg)}<small> kg</small></div>
    <div class="deltas">${week && week !== last ? `<span>7 giorni <b>${L.fmtDelta(last.kg, week.kg, 2)}${flag(last, week)}</b></span>` : ""}${ws.length > 1 ? `<span>Dal primo <b>${L.fmtDelta(last.kg, first.kg, 2)}${flag(last, first)}</b></span>` : ""}<span>${ws.length} ${ws.length === 1 ? "pesata" : "pesate"}</span></div>
    <button class="btn" data-act="weight-new">+ Registra peso</button>
  </section>
  <section class="card stack"><h2>Andamento</h2>${chartBlock("weight", ws.map((w) => ({ date: w.date, v: w.kg, alt: w.scale === "other" })), "kg", "D", { decimals: 2 })}</section>
  <section class="card stack"><h2>Storico</h2>
    <div class="groups">${groupBy(ws.slice().reverse(), (w) => w.date.slice(0, 7)).map((g, gi) => {
      const [yy, mm] = g.key.split("-"), avg = g.items.reduce((a, w) => a + w.kg, 0) / g.items.length, alts = g.items.filter((w) => w.scale === "other").length;
      return `<details ${gi === 0 ? "open" : ""}><summary><span>${MONTH_NAMES[+mm - 1]} ${yy}</span><span class="hint">media ${L.fmtKg(avg)} kg · ${g.items.length}${alts ? ` · <span class="scale-tag">${alts} altra bil.</span>` : ""}</span></summary>
        <ul class="list">${g.items.map((w) => { const pv = ws[ws.findIndex((x) => x.id === w.id) - 1]; return `<li class="tap" data-act="weight-edit" data-id="${w.id}"><span>${esc(L.fmtDate(w.date))}${w.scale === "other" ? ' <span class="scale-tag">altra</span>' : ""}</span><span class="val"><b class="${w.scale === "other" ? "alt" : ""}">${L.fmtKg(w.kg)} kg</b><span class="delta">${pv ? L.fmtDelta(w.kg, pv.kg, 2) + flag(w, pv) : ""}</span></span></li>`; }).join("")}</ul></details>`;
    }).join("")}</div>
    <p class="hint">Tocca una pesata per modificarla o eliminarla. * differenza con una pesata su un'altra bilancia: può esserci uno scarto.</p>
  </section>`;
}

function circTab(ms, rem) {
  const last = ms[ms.length - 1], prev = ms[ms.length - 2];
  if (!last) return `<section class="card stack"><h2>Circonferenze</h2><p class="hint" style="font-size:14px">Prendi le misure una volta a settimana, sempre nelle stesse condizioni.</p><button class="btn" data-act="measure-new">+ Nuova misurazione</button></section>`;
  ui.circMeasure ??= "waist";
  const k = ui.circMeasure, m = L.MEASURES.find((x) => x.k === k);
  const pts = ms.filter((e) => e.values[k] != null).map((e) => ({ date: e.date, v: e.values[k] }));
  return `
  <section class="card stack">
    <div class="row"><div class="label">Ultima misurazione · ${esc(L.fmtDate(last.date))}${dueTag(rem)}</div><span class="hint">${prev ? `vs ${esc(L.fmtDate(prev.date, { weekday: false }))}` : ""}</span></div>
    <div class="mtiles">${L.MEASURES.map((x) => {
      // Latest known value for each measure, even if the last session skipped it.
      const withVal = ms.filter((e) => e.values[x.k] != null), lv = withVal[withVal.length - 1], pv = withVal[withVal.length - 2];
      const older = lv && lv.date !== last.date;
      return `<button class="mtile ${x.k === k ? "sel" : ""}" data-act="circ-pick" data-mk="${x.k}"><span>${x.name}</span><b>${lv ? L.fmtNum(lv.values[x.k]) : "–"}</b><small class="delta">${older ? esc(L.fmtDate(lv.date, { weekday: false })) : lv && pv ? L.fmtDelta(lv.values[x.k], pv.values[x.k]) : "&nbsp;"}</small></button>`;
    }).join("")}</div>
    <button class="btn" data-act="measure-new">+ Nuova misurazione</button>
  </section>
  <section class="card stack"><div class="row"><h2>${esc(m.name)}</h2><span class="hint">tocca un riquadro per cambiare</span></div>
    ${pts.length ? chartBlock(`m-${k}`, pts, "cm", "W") : `<p class="hint">Nessun valore registrato per questa misura.</p>`}</section>
  <section class="card stack"><h2>Storico</h2>
    <div class="groups">${groupBy(ms.slice().reverse(), (e) => e.date.slice(0, 4)).map((g, gi) => `<details ${gi === 0 ? "open" : ""}><summary><span>${g.key}</span><span class="hint">${g.items.length} ${g.items.length === 1 ? "misurazione" : "misurazioni"}</span></summary>
      <ul class="list">${g.items.map((e) => `<li class="tap" data-act="measure-open" data-id="${e.id}"><span>${esc(L.fmtDate(e.date))}</span><span class="val"><span class="hint">${e.values[k] != null ? `${esc(m.name.toLowerCase())} ${L.fmtNum(e.values[k])}` : `${Object.keys(e.values).length} misure`}</span> ›</span></li>`).join("")}</ul></details>`).join("")}</div>
    <p class="hint">Tocca una data per vedere tutte le misure di quel giorno, modificarle o eliminarle.</p>
  </section>`;
}

export function openWeightForm(id) {
  const w = id ? D().weights.find((x) => x.id === id) : null;
  ui.weightEdit = id || null;
  ui.weightScale = w?.scale || "home";
  const last = store.live(D().weights).sort(byDate).pop();
  openModal(`<h2>${w ? `Peso del ${esc(L.fmtDate(w.date, { weekday: false }))}` : "Registra peso"}</h2>
    <div class="seg scale-seg" role="group" aria-label="Bilancia"><button data-act="scale" data-v="home" class="${ui.weightScale === "home" ? "sel" : ""}">Bilancia personale<small>quella di casa</small></button><button data-act="scale" data-v="other" class="${ui.weightScale === "other" ? "sel alt" : ""}">Altra bilancia<small>fuori casa, palestra…</small></button></div>
    <label class="label" for="wDate">Data<input id="wDate" type="date" value="${w ? w.date : L.todayISO()}"></label>
    <label class="field big"><input id="wVal" inputmode="decimal" value="${w ? esc(L.fmtNum(w.kg)) : ""}" placeholder="${last ? esc(L.fmtNum(last.kg)) : "kg"}" aria-label="Peso in kg"><em>kg</em></label>
    <button class="btn" data-act="save-weight">${w ? "Salva modifica" : "Salva"}</button>
    <div class="row">${w ? `<button class="btn ghost" style="flex:1;color:var(--danger)" data-confirm="delete-weight" data-id="${w.id}">Elimina</button>` : ""}<button class="btn ghost" style="flex:1" data-act="close">Annulla</button></div>`);
  if (!w) $("#wVal")?.focus();
}

export function openMeasureForm(id) {
  const ms = store.live(D().measurements).sort(byDate);
  const e = id ? ms.find((x) => x.id === id) : null;
  const last = ms[ms.length - 1];
  ui.measureEdit = id || null;
  openModal(`<h2>${e ? `Misure del ${esc(L.fmtDate(e.date, { weekday: false }))}` : "Nuova misurazione"}</h2>
    <label class="label" for="mDate">Data<input id="mDate" type="date" value="${e ? e.date : L.todayISO()}"></label>
    <div class="body-fig">${bodySvg()}<div>${L.MEASURES.map((m, i) => `<div class="mrow ${m.k === ui.measureActive ? "on" : ""}" data-mk="${m.k}"><span class="n">${i + 1}</span>
      <div><b>${m.name}</b><small>${m.hint}</small>${last?.values[m.k] != null ? `<span class="prev">Ultima: ${L.fmtNum(last.values[m.k])} cm</span>` : ""}</div>
      <label class="field"><input id="m-${m.k}" data-mk="${m.k}" inputmode="decimal" value="${e?.values[m.k] != null ? esc(L.fmtNum(e.values[m.k])) : ""}" placeholder="${last?.values[m.k] != null ? esc(L.fmtNum(last.values[m.k])) : ""}" aria-label="${m.name} in cm"><em>cm</em></label></div>`).join("")}</div></div>
    <button class="btn" data-act="save-measures">${e ? "Salva modifiche" : "Salva misure"}</button>
    <button class="btn ghost" data-act="close">Annulla</button>`);
}

function openMeasureDetail(id) {
  const ms = store.live(D().measurements).sort(byDate);
  const i = ms.findIndex((x) => x.id === id), e = ms[i], prev = ms[i - 1], first = ms[0];
  openModal(`<div><div class="label">Misurazione</div><h2>${esc(L.fmtDate(e.date, { year: true }))}</h2></div>
    <div class="nav-row"><button class="icon-btn" data-act="measure-open" data-id="${ms[i - 1]?.id || ""}" ${i <= 0 ? "disabled" : ""} aria-label="Precedente">‹</button>
      <div class="nav-date"><span class="hint">${i + 1} di ${ms.length}${prev ? ` · confronto con ${esc(L.fmtDate(prev.date, { weekday: false }))}` : " · prima misurazione"}</span></div>
      <button class="icon-btn" data-act="measure-open" data-id="${ms[i + 1]?.id || ""}" ${i >= ms.length - 1 ? "disabled" : ""} aria-label="Successiva">›</button></div>
    <div class="tbl-wrap"><table class="tbl"><tr><th>Misura</th><th class="num">cm</th><th class="num">vs prec.</th><th class="num">vs prima</th></tr>
    ${L.MEASURES.map((m) => `<tr><td>${m.name}</td><td class="num">${e.values[m.k] != null ? L.fmtNum(e.values[m.k]) : "–"}</td><td class="num delta">${prev ? L.fmtDelta(e.values[m.k], prev.values[m.k]) : "–"}</td><td class="num delta">${i ? L.fmtDelta(e.values[m.k], first.values[m.k]) : "–"}</td></tr>`).join("")}</table></div>
    <button class="btn" data-act="measure-edit" data-id="${e.id}">Modifica</button>
    <div class="row"><button class="btn ghost" style="flex:1;color:var(--danger)" data-confirm="delete-measure" data-id="${e.id}">Elimina</button><button class="btn ghost" style="flex:1" data-act="close">Chiudi</button></div>`);
}

export function setMeasure(k) {
  ui.measureActive = k;
  $$(".mrow").forEach((r) => r.classList.toggle("on", r.dataset.mk === k));
  const svg = $(".body-fig svg");
  if (svg) svg.outerHTML = bodySvg();
}

Object.assign(actions, {
  mtab: (el) => { ui.mTab = el.dataset.tab; render(); },
  "circ-pick": (el) => { ui.circMeasure = el.dataset.mk; render(); },
  "weight-new": () => openWeightForm(null),
  "weight-edit": (el) => openWeightForm(el.dataset.id),
  "measure-new": () => openMeasureForm(null),
  "measure-edit": (el) => openMeasureForm(el.dataset.id),
  "measure-open": (el) => { if (el.dataset.id) openMeasureDetail(el.dataset.id); },
  scale: (el) => { ui.weightScale = el.dataset.v; $$(".scale-seg button").forEach((b) => { const on = b === el; b.classList.toggle("sel", on); b.classList.toggle("alt", on && b.dataset.v === "other"); }); },
  "save-weight": () => {
    const kg = L.parseNum($("#wVal").value), date = $("#wDate").value;
    if (kg == null || !date) { toast("Inserisci data e peso in kg"); return; }
    const editId = ui.weightEdit, scale = ui.weightScale || "home";
    store.mutate((d) => {
      const sameDay = store.live(d.weights).find((w) => w.date === date && w.id !== editId);
      if (editId && sameDay) store.softDelete(d, "weights", sameDay.id);
      store.upsert(d, "weights", { id: editId || sameDay?.id || store.uid(), date, kg, scale });
    });
    ui.weightEdit = null; ui.weightScale = null;
    closeModal(); render(); toast(editId ? "Peso aggiornato" : "Peso salvato"); runSync(`feat: log weight (${date})`, { quiet: true });
  },
  "save-measures": () => {
    const values = {};
    let any = false;
    L.MEASURES.forEach((m) => { const x = L.parseNum($(`#m-${m.k}`).value); if (x != null) { values[m.k] = x; any = true; } });
    const date = $("#mDate").value;
    if (!any || !date) { toast("Inserisci la data e almeno una misura"); return; }
    const editId = ui.measureEdit;
    store.mutate((d) => {
      const sameDay = store.live(d.measurements).find((m) => m.date === date && m.id !== editId);
      if (editId) {
        // Editing replaces the values of that measurement; another one on the same date is folded in.
        if (sameDay) store.softDelete(d, "measurements", sameDay.id);
        store.upsert(d, "measurements", { id: editId, date, values });
      } else {
        store.upsert(d, "measurements", { id: sameDay?.id || store.uid(), date, values: { ...(sameDay?.values || {}), ...values } });
      }
    });
    ui.measureEdit = null;
    closeModal(); render(); toast(editId ? "Misurazione aggiornata" : "Misure salvate");
    runSync(`feat: log measurements (${date})`, { quiet: true });
  },
  "export-measures": (el) => runExport(el, async (pdf) => ({ bytes: await pdf.measuresPdf(D()), name: `Misure e peso - ${L.todayISO()}.pdf` })),
});

Object.assign(confirmed, {
  "delete-weight": (id) => { ui.weightEdit = null; deleteWithUndo("weights", id, "Peso eliminato", "fix: remove weight entry"); },
  "delete-measure": (id) => { ui.measureEdit = null; deleteWithUndo("measurements", id, "Misurazione eliminata", "fix: remove measurement"); },
});
