// Scheda tab: the coach's program of a cycle (Programma) and the sessions logged in it (Sessioni).
// Editing the program happens in a sheet opened from "✎ Modifica"; cycle actions sit at the bottom.
import * as store from "../data.js";
import * as L from "../logic.js";
import { $, esc, D, ui, actions, confirmed, changes, toast, openModal, closeModal, render, go, cycle, runSync } from "../core.js";
import { sessionRow, startSession, coachNotes } from "./session.js";

const currentWeek = (c) => Math.min(Math.max(1, L.weekForDate(c, L.todayISO())), c.weeks);
function pickSheet(c) {
  const letters = L.sheetLetters(c);
  if (!letters.includes(ui.sheet)) ui.sheet = letters[0];
  return letters;
}

const fileInput = `<input id="programFile" type="file" accept=".json,application/json" data-act="import-program-file" class="vh">`;

/** Cycle bar: the cycle shown (a picker when there are several) and a ⋯ menu for cycle-level actions. */
function cycleBar(d, c) {
  const cycles = L.cyclesSorted(d);
  const label = (x) => `Ciclo ${x.number} · ${esc(L.fmtRange(x.startDate, L.cycleEnd(x)))}${x.closed ? " · chiuso" : ""}`;
  const pick = cycles.length < 2 ? `<div class="hint">${label(c)}</div>`
    : `<select data-act="cycle" aria-label="Ciclo">${cycles.slice().reverse().map((x) => `<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>${label(x)}</option>`).join("")}</select>`;
  return `<div class="cycle-bar">${pick}<button class="icon-btn" data-act="cycle-menu" aria-label="Azioni sul ciclo">⋯</button></div>${fileInput}`;
}

export function viewProgram(d) {
  const c = cycle();
  if (!c) return `<section class="card stack"><h2>Nessuna scheda</h2><p class="hint" style="font-size:14px">Importa il file della scheda del coach per iniziare il primo ciclo.</p>
    <label class="btn" for="programFile">Importa la scheda del coach</label>${fileInput}</section>`;
  const tabs = `<div class="subtabs" role="tablist">
    <button role="tab" data-act="ptab" data-tab="program" aria-selected="${ui.progTab === "program"}">Programma</button>
    <button role="tab" data-act="ptab" data-tab="sessions" aria-selected="${ui.progTab === "sessions"}">Sessioni</button></div>`;
  return cycleBar(d, c) + tabs + (ui.progTab === "sessions" ? sessionsTab(d, c) : programTab(d, c));
}

function programTab(d, c) {
  const letters = pickSheet(c);
  ui.week = Math.min(ui.week || currentWeek(c), c.weeks);
  const w = ui.week, slots = c.sheets[ui.sheet] || [];
  const fake = { week: w };
  return `
  <div class="grid4">${letters.map((l) => `<button class="pick ${l === ui.sheet ? "sel" : ""}" data-act="p-sheet" data-sheet="${esc(l)}"><b>${esc(l)}</b><small>${esc(c.dayPlan?.[l] || `${c.sheets[l].length} esercizi`)}</small></button>`).join("")}</div>
  <div class="gran weeks-sel" role="group" aria-label="Settimana" style="grid-template-columns:repeat(${c.weeks},1fr)">${Array.from({ length: c.weeks }, (_, i) => `<button class="${i + 1 === w ? "sel" : ""}" data-act="p-week" data-week="${i + 1}" aria-pressed="${i + 1 === w}">S${i + 1}</button>`).join("")}</div>
  <section class="card stack"><div class="row"><div class="label">Scheda ${esc(ui.sheet)} · settimana ${w}</div><button class="mini" data-act="program-edit" data-id="${c.id}">✎ Modifica</button></div>
    <ul class="list">${slots.map((sl, i) => {
      const r = L.resolveSlot(c, sl, fake);
      return `<li class="tap" data-act="slot-detail" data-id="${sl.id}"><span class="pe-name"><b>${i + 1}. ${esc(L.exName(d, r.exerciseId))}${r.substitution ? ' <span class="swap-tag">⇄</span>' : ""}</b>
        <span class="hint">${esc(L.schemaLabel(r.blocks, w))} · ${esc(L.fmtRest(sl.rest))}${sl.superset ? " · superset" : ""}</span></span><span class="hint">›</span></li>`;
    }).join("")}</ul></section>`;
}

function slotDetail(slotId) {
  const d = D(), c = cycle(), slot = c.sheets[ui.sheet].find((x) => x.id === slotId);
  const i = c.sheets[ui.sheet].indexOf(slot);
  const r = L.resolveSlot(c, slot, { week: ui.week });
  const ex = L.exerciseOf(d, r.exerciseId) || {};
  const ov = c.overrides?.[slot.id];
  const notes = coachNotes(slot);
  openModal(`<div><div class="label">Scheda ${esc(ui.sheet)} · esercizio ${i + 1}</div><h2>${esc(ex.name || "Esercizio")}</h2></div>
    <div class="meta"><span class="dist">${esc(ex.district || slot.district || "")}</span><span>Recupero ${esc(L.fmtRest(slot.rest))}</span>${slot.superset ? `<span class="ss">Superset ${slot.superset === "first" ? "1/2" : "2/2"}</span>` : ""}</div>
    ${ov ? `<div class="subtag">⇄ Sostituisce ${esc(L.exName(d, slot.exerciseId))} dalla settimana ${ov.fromWeek}</div>` : ""}
    <div class="tbl-wrap"><table class="tbl"><tr><th>Settimana</th><th class="num">Target</th></tr>
      ${Array.from({ length: c.weeks }, (_, w) => { const rw = L.resolveSlot(c, slot, { week: w + 1 }); return `<tr class="${w + 1 === ui.week ? "editing" : ""}"><td>Sett. ${w + 1}</td><td class="num">${esc(L.schemaLabel(rw.blocks, w + 1))}</td></tr>`; }).join("")}</table></div>
    <button class="setup-line ${ex.setup ? "" : "empty"}" data-act="setup-edit" data-ex="${r.exerciseId}">⚙︎ ${ex.setup ? `Regolazioni: ${esc(ex.setup)}` : "Aggiungi regolazioni"}</button>
    ${notes ? `<details open><summary>Note del coach</summary>${notes}</details>` : ""}
    <div class="row"><button class="btn ghost small" style="flex:1" data-act="history" data-ex="${r.exerciseId}">📈 Storico</button><button class="btn ghost small" style="flex:1" data-act="slot-edit" data-id="${slot.id}">✎ Modifica</button></div>
    <button class="btn" data-act="close">Chiudi</button>`);
}

function sessionsTab(d, c) {
  const sessions = L.sessionsOf(d, c.id);
  const letters = L.sheetLetters(c);
  const weeks = [...new Set(sessions.map((s) => s.week))].sort((a, b) => b - a);
  const groups = weeks.map((w) => {
    const list = sessions.filter((s) => s.week === w).reverse();
    const n = letters.filter((l) => L.doneInWeek(d, c, l, w)).length;
    return `<section class="card stack"><div class="row"><div class="label">Settimana ${w}</div><span class="hint">${n}/${letters.length}${n >= letters.length ? " · completata" : ""}</span></div>
      <ul class="list">${list.map((s) => sessionRow(s, { week: false })).join("")}</ul></section>`;
  }).join("");
  return `${groups || `<p class="empty">Ancora nessuna sessione in questo ciclo.</p>`}
    <button class="btn ghost small" data-act="past-session">+ Inserisci una sessione passata</button>
    <p class="hint" style="text-align:center">Tocca una sessione per rivederla o correggerla. Per eliminarla usa ⋯ in alto nella sessione.</p>`;
}

/* ================= Program editor: targets, rest, order and exercises of a cycle ================= */
const pe = { cycleId: null, sheet: null, draft: null, slotId: null };
const peCycle = () => D().cycles.find((c) => c.id === pe.cycleId);
const slotHasData = (c, slotId) => store.live(D().sessions).some((x) => x.cycleId === c.id && x.entries?.[slotId] && L.doneSets(x.entries[slotId]).length);

function openProgramEditor(cycleId, sheet) {
  pe.cycleId = cycleId;
  const c = peCycle(), letters = L.sheetLetters(c);
  pe.sheet = letters.includes(sheet) ? sheet : letters[0];
  const d = D(), slots = c.sheets[pe.sheet];
  const cw = currentWeek(c);
  openModal(`<div data-rerender><div class="label">Ciclo ${c.number} · modifica scheda</div><h2>Scheda ${esc(pe.sheet)}</h2></div>
    <div class="grid4">${letters.map((l) => `<button class="pick ${l === pe.sheet ? "sel" : ""}" data-act="pe-sheet" data-sheet="${esc(l)}"><b>${esc(l)}</b></button>`).join("")}</div>
    <ul class="list">${slots.map((sl, i) => `<li><span class="pe-name"><b>${i + 1}. ${esc(L.exName(d, sl.exerciseId))}</b><span class="hint">${esc(L.schemaLabel(sl.blocks, cw))} · ${esc(L.fmtRest(sl.rest))}${sl.superset ? ` · superset ${sl.superset === "first" ? "1/2" : "2/2"}` : ""}</span></span>
      <span class="acts"><button class="mini" data-act="pe-move" data-i="${i}" data-dir="-1" ${i === 0 ? "disabled" : ""} aria-label="Sposta su">↑</button><button class="mini" data-act="pe-move" data-i="${i}" data-dir="1" ${i === slots.length - 1 ? "disabled" : ""} aria-label="Sposta giù">↓</button><button class="mini" data-act="pe-slot" data-id="${sl.id}">✎</button></span></li>`).join("")}</ul>
    <div class="card stack"><div class="label">Aggiungi un esercizio</div>
      <select id="peAddEx" aria-label="Esercizio da aggiungere">${store.live(d.exercises).sort((a, b) => a.name.localeCompare(b.name, "it")).map((e) => `<option value="${e.id}">${esc(e.district)} · ${esc(e.name)}</option>`).join("")}</select>
      <button class="btn ghost small" data-act="pe-add">+ Aggiungi in fondo (3×10, recupero 90 s)</button></div>
    <p class="hint">Le modifiche valgono per tutto il ciclo. Le serie già registrate restano come sono: cambia i target solo delle settimane che devi ancora fare.</p>
    <button class="btn" data-act="close">Fatto</button>`);
}

function openSlotEditor(slotId) {
  const c = peCycle(), slot = c.sheets[pe.sheet].find((x) => x.id === slotId);
  pe.slotId = slotId;
  pe.draft ??= JSON.parse(JSON.stringify(slot));
  const dr = pe.draft, weeks = c.weeks, locked = slotHasData(c, slotId);
  openModal(`<div data-rerender><div class="label">Scheda ${esc(pe.sheet)}</div><h2>${esc(L.exName(D(), dr.exerciseId))}</h2></div>
    <div class="extras" style="margin-top:0">
      <label class="label" for="peRest">Recupero (secondi)<input id="peRest" type="number" inputmode="numeric" value="${dr.rest ?? ""}"></label>
      <label class="label" for="peSs">Superset<select id="peSs"><option value="" ${!dr.superset ? "selected" : ""}>No</option><option value="first" ${dr.superset === "first" ? "selected" : ""}>1° della coppia</option><option value="second" ${dr.superset === "second" ? "selected" : ""}>2° della coppia</option></select></label>
    </div>
    ${dr.blocks.map((b, bi) => `<div class="card stack"><div class="row"><div class="label">Blocco ${bi + 1}${b.mav ? " · MAV" : ""}</div>${dr.blocks.length > 1 ? `<button class="mini danger" data-act="pe-del-block" data-b="${bi}">Rimuovi</button>` : ""}</div>
      <div class="wkrow"><span></span><span class="label">Serie</span><span class="label">Ripetizioni</span></div>
      ${Array.from({ length: weeks }, (_, w) => `<div class="wkrow"><span class="label">Sett. ${w + 1}</span><input id="pb-${bi}-${w}-s" type="number" inputmode="numeric" value="${L.atWeek(b.sets, w + 1)}" aria-label="Serie settimana ${w + 1}"><input id="pb-${bi}-${w}-r" type="text" value="${esc(L.atWeek(b.reps, w + 1))}" aria-label="Ripetizioni settimana ${w + 1}"></div>`).join("")}
      <label class="chip" style="align-self:flex-start"><input type="checkbox" id="pb-${bi}-mav" ${b.mav ? "checked" : ""}> MAV (conta solo l'ultima serie)</label></div>`).join("")}
    <button class="btn ghost small" data-act="pe-add-block">+ Aggiungi blocco (es. 1×max)</button>
    <p class="hint">Per ogni settimana: serie e ripetizioni (anche 10-12, max).</p>
    <button class="btn" data-act="pe-save-slot">Salva</button>
    <div class="row"><button class="btn ghost" style="flex:1" data-act="pe-back">Annulla</button>${locked ? "" : `<button class="btn ghost" style="flex:1;color:var(--danger)" data-act="pe-remove-slot">Rimuovi esercizio</button>`}</div>
    ${locked ? `<p class="hint">Questo esercizio ha già serie registrate in questo ciclo, quindi non si può rimuovere. Puoi sostituirlo dalla sessione.</p>` : ""}`);
}

/** Read the slot editor inputs back into the draft. */
function collectSlotDraft() {
  const c = peCycle(), dr = pe.draft;
  dr.rest = Math.max(0, parseInt($("#peRest").value, 10) || 0);
  dr.superset = $("#peSs").value || null;
  dr.blocks = dr.blocks.map((b, bi) => ({
    ...b,
    mav: !!$(`#pb-${bi}-mav`)?.checked,
    sets: Array.from({ length: c.weeks }, (_, w) => Math.max(0, parseInt($(`#pb-${bi}-${w}-s`)?.value, 10) || 0)),
    reps: Array.from({ length: c.weeks }, (_, w) => ($(`#pb-${bi}-${w}-r`)?.value || "").trim() || "10"),
  }));
}

function saveCycleSheet(fn) {
  store.mutate((d) => {
    const c = d.cycles.find((x) => x.id === pe.cycleId);
    c.sheets = { ...c.sheets, [pe.sheet]: fn(c.sheets[pe.sheet].slice()) };
    c.updatedAt = store.now();
  });
}

/* ================= Import ================= */
export function readJsonFile(input) {
  return new Promise((resolve, reject) => {
    const f = input.files?.[0];
    if (!f) return reject(new Error("Nessun file scelto"));
    const r = new FileReader();
    r.onload = () => { try { resolve(JSON.parse(r.result)); } catch { reject(new Error("Il file non è un JSON valido.")); } };
    r.onerror = () => reject(new Error("Non riesco a leggere il file."));
    r.readAsText(f);
  });
}

/** Program file from the coach PDF: creates a new cycle and closes the running one. */
function importProgram(p, startDate) {
  if (p.type !== "gymlog-program" || !p.sheets) throw new Error("Questo file non è una scheda di Harden.");
  const start = startDate || p.startDate;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || "")) throw new Error("Scegli la data di inizio del ciclo.");
  const weeks = p.weeks || 4;
  for (const [letter, list] of Object.entries(p.sheets)) {
    if (!/^[A-Z0-9]{1,3}$/.test(letter) || !Array.isArray(list) || !list.length) throw new Error(`Scheda "${letter}" non valida nel file.`);
    for (const x of list) if (!x.name || !Array.isArray(x.blocks) || !x.blocks.length) throw new Error(`Esercizio senza nome o senza serie nella scheda ${letter}.`);
  }
  store.mutate((d) => {
    const byName = new Map(store.live(d.exercises).map((e) => [L.norm(e.name), e]));
    const number = Math.max(0, ...store.live(d.cycles).map((c) => c.number)) + 1;
    const sheets = {};
    for (const [letter, list] of Object.entries(p.sheets)) {
      sheets[letter] = list.map((x, i) => {
        let ex = byName.get(L.norm(x.name));
        if (!ex) { ex = store.upsert(d, "exercises", { id: store.uid(), name: x.name, district: x.district, usesBar: !!x.usesBar }); byName.set(L.norm(x.name), ex); }
        return { id: `${letter}${i + 1}`, exerciseId: ex.id, district: x.district, rest: x.rest, superset: x.superset || null, tut: x.tut || "", video: x.video || "", description: x.description || "", exerciseNote: x.exerciseNote || "", progressionNote: x.progressionNote || "", week4Plus: !!x.week4Plus, blocks: x.blocks };
      });
    }
    store.upsert(d, "cycles", { id: store.uid(), number, startDate: start, weeks, dayPlan: p.dayPlan || {}, closed: false, overrides: {}, sheets });
    // The running cycle closes when the new one starts: today if it starts today, otherwise on that day.
    L.closeSupersededCycles(d, store.now());
  });
}

/* ================= Handlers ================= */
Object.assign(actions, {
  ptab: (el) => { ui.progTab = el.dataset.tab; render(); },
  "p-sheet": (el) => { ui.sheet = el.dataset.sheet; render(); },
  "p-week": (el) => { ui.week = +el.dataset.week; render(); },
  "slot-detail": (el) => slotDetail(el.dataset.id),
  "slot-edit": (el) => { pe.cycleId = cycle().id; pe.sheet = ui.sheet; pe.draft = null; openSlotEditor(el.dataset.id); },
  "program-edit": (el) => { pe.draft = null; openProgramEditor(el.dataset.id, ui.sheet); },
  "pe-sheet": (el) => openProgramEditor(pe.cycleId, el.dataset.sheet),
  "pe-move": (el) => {
    const i = +el.dataset.i, j = i + +el.dataset.dir;
    saveCycleSheet((list) => { [list[i], list[j]] = [list[j], list[i]]; return list; });
    openProgramEditor(pe.cycleId, pe.sheet);
  },
  "pe-add": () => {
    const exId = $("#peAddEx").value, ex = L.exerciseOf(D(), exId), weeks = peCycle().weeks;
    saveCycleSheet((list) => [...list, { id: `${pe.sheet}x${Date.now().toString(36)}`, exerciseId: exId, district: ex.district, rest: 90, superset: null, tut: "", video: "", description: "", exerciseNote: "", progressionNote: "", week4Plus: false, blocks: [{ sets: Array(weeks).fill(3), reps: Array(weeks).fill("10") }] }]);
    openProgramEditor(pe.cycleId, pe.sheet); toast(`${ex.name} aggiunto alla scheda ${pe.sheet}`);
  },
  "pe-slot": (el) => { pe.draft = null; openSlotEditor(el.dataset.id); },
  "pe-add-block": () => { collectSlotDraft(); const w = peCycle().weeks; pe.draft.blocks.push({ sets: Array(w).fill(1), reps: Array(w).fill("max") }); openSlotEditor(pe.slotId); },
  "pe-del-block": (el) => { collectSlotDraft(); pe.draft.blocks.splice(+el.dataset.b, 1); openSlotEditor(pe.slotId); },
  "pe-save-slot": () => {
    collectSlotDraft();
    const dr = pe.draft;
    saveCycleSheet((list) => list.map((x) => (x.id === dr.id ? dr : x)));
    pe.draft = null; openProgramEditor(pe.cycleId, pe.sheet); toast("Esercizio aggiornato");
    runSync(`feat: update sheet ${pe.sheet} of cycle ${peCycle().number}`, { quiet: true });
  },
  "pe-back": () => { pe.draft = null; openProgramEditor(pe.cycleId, pe.sheet); },
  "pe-remove-slot": () => {
    const id = pe.slotId;
    saveCycleSheet((list) => list.filter((x) => x.id !== id));
    pe.draft = null; openProgramEditor(pe.cycleId, pe.sheet); toast("Esercizio rimosso dalla scheda");
  },
  "past-session": () => {
    const c = cycle();
    openModal(`<h2>Sessione passata</h2>
      <label class="label" for="pastSheet">Scheda<select id="pastSheet">${L.sheetLetters(c).map((l) => `<option>${esc(l)}</option>`).join("")}</select></label>
      <label class="label" for="pastWeek">Settimana<select id="pastWeek">${Array.from({ length: c.weeks }, (_, i) => `<option>${i + 1}</option>`).join("")}</select></label>
      <label class="label" for="pastDate">Data<input id="pastDate" type="date" value="${L.todayISO()}"></label>
      <div class="row"><button class="btn ghost" data-act="close">Annulla</button><button class="btn" data-act="past-ok">Compila</button></div>`);
  },
  "past-ok": () => { const sh = $("#pastSheet").value, w = +$("#pastWeek").value, dt = $("#pastDate").value; closeModal(); startSession(sh, w, dt, cycle().id); },
  "cycle-menu": () => {
    const c = cycle();
    openModal(`<div><div class="label">${esc(L.fmtRange(c.startDate, L.cycleEnd(c)))}</div><h2>Ciclo ${c.number}</h2></div>
      <div class="menu">
        <label class="menu-item" for="programFile">＋ Nuovo ciclo dalla scheda del coach</label>
        ${c.closed ? `<button class="menu-item" data-act="reopen-cycle" data-id="${c.id}">↺ Riapri ciclo ${c.number}</button>` : `<button class="menu-item" data-confirm="close-cycle" data-id="${c.id}">Chiudi ciclo ${c.number}</button>`}
      </div>
      <p class="hint">Il ciclo in corso si chiude da solo il giorno in cui inizia quello nuovo. I cicli chiusi restano consultabili e modificabili.</p>
      <button class="btn ghost" data-act="close">Chiudi</button>`);
  },
  "reopen-cycle": (el) => { store.mutate((d) => { const c = d.cycles.find((x) => x.id === el.dataset.id); c.closed = false; c.keepOpen = true; c.updatedAt = store.now(); }); closeModal(); render(); toast("Ciclo riaperto"); },
});

Object.assign(confirmed, {
  "close-cycle": (id) => { store.mutate((d) => { const c = d.cycles.find((x) => x.id === id); c.closed = true; delete c.keepOpen; c.closedAt = store.now(); c.updatedAt = store.now(); }); closeModal(); render(); toast("Ciclo chiuso"); },
});

Object.assign(changes, {
  cycle: (t) => { ui.cycleId = t.value; ui.week = null; render(); },
  "import-program-file": async (t) => {
    try {
      const p = await readJsonFile(t);
      openModal(`<h2>Nuova scheda</h2><p class="hint" style="font-size:14px">Il ciclo in corso continua fino alla data di inizio della scheda nuova, poi si chiude da solo.</p>
        <label class="label" for="progStart">Data di inizio<input id="progStart" type="date" value="${esc(p.startDate || L.todayISO())}"></label>
        <div class="row"><button class="btn ghost" data-act="close">Annulla</button><button class="btn" id="progOk">Importa</button></div>`);
      $("#progOk").onclick = () => {
        try { importProgram(p, $("#progStart").value); closeModal(); ui.cycleId = null; ui.week = null; go("program"); toast("Nuova scheda importata"); runSync("feat: import new cycle program", { quiet: true }); }
        catch (err) { toast(err.message, { error: true }); }
      };
    } catch (err) { toast(err.message, { error: true }); }
    t.value = "";
  },
});

