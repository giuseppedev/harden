// Harden — UI layer. Views are rendered as HTML strings; events are delegated on the document.
import * as store from "./data.js";
import * as gh from "./github.js";
import * as L from "./logic.js";

const APP_VERSION = "1.5.0";
const TAGLINE = "every set, on record.";
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const D = () => store.get();

const ui = {
  view: "home",
  cycleId: null,
  sessionId: null,
  logSheet: null,
  rep: { cycles: null, sections: new Set(["sum", "cmp", "vol", "meas", "ex"]), ex: null },
  measureActive: "neck",
  measureEdit: null,
  measureIdx: null,
  weightEdit: null,
  charts: {},
  weightShowAll: false,
  catalogQuery: "",
  syncState: "idle", // idle | running | error
  syncError: "",
  pendingRender: false,
};

/* ================= Utilities ================= */
function toast(msg, { error = false, ms = 2800 } = {}) {
  const t = document.createElement("div");
  t.className = "toast" + (error ? " err" : "");
  t.setAttribute("role", "status");
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

function openModal(html) {
  const host = $("#modalHost");
  host.innerHTML = `<div class="overlay" data-overlay><div class="modal" role="dialog" aria-modal="true"><div class="modal-inner stack">${html}</div></div></div>`;
  return host.firstElementChild;
}
const closeModal = () => { $("#modalHost").innerHTML = ""; };

const cycle = () => D()?.cycles.find((c) => c.id === ui.cycleId && !c.deleted) || L.currentCycle(D());
const sessionById = (id) => D()?.sessions.find((s) => s.id === id && !s.deleted);
const cycleOfSession = (s) => D().cycles.find((c) => c.id === s.cycleId);

/* ================= Rest timer (survives closing the app: it stores the end time) ================= */
const TIMER_KEY = "gymlog.timer";
let timerTick = null, audioCtx = null, beeped = false;

function timerState() { try { return JSON.parse(localStorage.getItem(TIMER_KEY) || "null"); } catch { return null; } }
function saveTimer(t) { t ? localStorage.setItem(TIMER_KEY, JSON.stringify(t)) : localStorage.removeItem(TIMER_KEY); }

function unlockAudio() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch { /* no audio */ }
}
function beep() {
  try {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    [0, 0.25, 0.5].forEach((dt) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.4, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
      o.start(t0 + dt); o.stop(t0 + dt + 0.2);
    });
  } catch { /* ignore */ }
  navigator.vibrate?.([200, 100, 200]);
}

function startTimer(seconds, label) {
  if (!seconds) return;
  unlockAudio();
  beeped = false;
  saveTimer({ endAt: Date.now() + seconds * 1000, total: seconds, label });
  drawTimer();
}
function drawTimer() {
  const t = timerState(), el = $("#timer");
  clearInterval(timerTick);
  if (!t) { el.hidden = true; return; }
  el.hidden = false;
  const paint = () => {
    const left = Math.max(0, Math.round((t.endAt - Date.now()) / 1000));
    $("#tVal").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    $("#tBar").style.width = `${Math.min(100, 100 - (left / t.total) * 100)}%`;
    const over = left === 0;
    el.classList.toggle("over", over);
    $("#tInfo").textContent = over ? "Recupero finito · vai con la prossima serie" : `Recupero · ${t.label}`;
    if (over) {
      clearInterval(timerTick);
      if (!beeped && Date.now() - t.endAt < 5000) beep();
      beeped = true;
    }
  };
  paint();
  timerTick = setInterval(paint, 250);
}

/* ================= Sync ================= */
async function runSync(message, { quiet = false } = {}) {
  if (!gh.isConfigured()) { renderHeader(); return; }
  if (!navigator.onLine) { renderHeader(); if (!quiet) toast("Sei offline: i dati sono salvati sul telefono, sincronizzo appena torna la rete."); return; }
  ui.syncState = "running"; renderHeader();
  try {
    await gh.sync(message);
    ui.syncState = "idle"; ui.syncError = "";
    if (!quiet) toast("Sincronizzato su GitHub");
  } catch (e) {
    ui.syncState = "error"; ui.syncError = e.message;
    if (!quiet) toast(e.message, { error: true, ms: 5000 });
  }
  renderHeader();
}

function syncBadge() {
  if (!gh.isConfigured()) return `<button class="sync" data-act="go" data-view="settings">GitHub non collegato</button>`;
  if (ui.syncState === "running") return `<button class="sync">Sincronizzo…</button>`;
  if (ui.syncState === "error") return `<button class="sync err" data-act="sync" title="${esc(ui.syncError)}">Errore sync</button>`;
  if (store.isDirty()) return `<button class="sync pending" data-act="sync">${navigator.onLine ? "Da sincronizzare" : "Offline · in coda"}</button>`;
  return `<button class="sync ok" data-act="sync">Sincronizzato</button>`;
}

/* ================= Rendering ================= */
const TITLES = { home: "Harden", workout: "Sessione", logbook: "Logbook", measures: "Misure", report: "Report", settings: "Impostazioni" };

function renderHeader() {
  const d = D(), c = d && cycle();
  const showCycle = d && store.hasData() && ["home", "logbook"].includes(ui.view);
  const cycles = d ? L.cyclesSorted(d) : [];
  $("#appHeader").innerHTML = `<div class="wrap">
    <div class="row"><div><h1>${esc(TITLES[ui.view])}</h1>${ui.view === "home" ? `<div class="tagline">${TAGLINE}</div>` : ""}</div>
      <div class="row" style="gap:6px">${d ? syncBadge() : ""}<button class="icon-btn" data-act="go" data-view="settings" aria-label="Impostazioni">⚙︎</button></div></div>
    ${showCycle && cycles.length ? `<label class="label" for="cycleSel">Ciclo
      <select id="cycleSel" data-act="cycle">${cycles.slice().reverse().map((x) => `<option value="${x.id}" ${x.id === c.id ? "selected" : ""}>Ciclo ${x.number} · ${esc(L.fmtRange(x.startDate, L.cycleEnd(x)))} · ${x.closed ? "chiuso" : "in corso"}</option>`).join("")}</select></label>` : ""}
  </div>`;
  $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.view === ui.view)));
  $(".tabs [data-view=measures]")?.classList.toggle("dot", !!(d && store.hasData() && measureDue(d)));
}

function render() {
  const focused = document.activeElement;
  if (focused && focused.closest?.("#view") && /INPUT|TEXTAREA|SELECT/.test(focused.tagName) && ui.view === "workout") {
    // Do not wipe what the user is typing; render once the field loses focus.
    ui.pendingRender = true;
    renderHeader();
    return;
  }
  ui.pendingRender = false;
  renderHeader();
  const d = D();
  const v = $("#view");
  if (!store.hasData() && ui.view !== "settings") { v.innerHTML = viewWelcome(); return; }
  const views = { home: viewHome, workout: viewWorkout, logbook: viewLogbook, measures: viewMeasures, report: viewReport, settings: viewSettings };
  v.innerHTML = (views[ui.view] || viewHome)(d);
  if (ui.view === "workout") refreshBarTotals();
  if (ui.view === "workout") wakeLock(true); else wakeLock(false);
}

function go(view, opts = {}) {
  Object.assign(ui, opts, { view });
  render();
  window.scrollTo(0, 0);
}

/* ---------- Welcome ---------- */
function viewWelcome() {
  return `<section class="card stack">
    <h2>Benvenuto in Harden</h2><p class="tagline" style="margin:0">${TAGLINE}</p>
    <p class="hint" style="font-size:14px">Per iniziare carica i tuoi dati. Se il file <b>harden-data.json</b> è già nel tuo repository privato, collega GitHub e scaricalo. Altrimenti importa il file direttamente dal telefono.</p>
    <button class="btn" data-act="go" data-view="settings">Collega GitHub</button>
    <label class="btn ghost" for="welcomeFile">Importa file dati (.json)</label>
    <input id="welcomeFile" type="file" accept=".json,application/json" data-act="import-data-file" class="vh">
  </section>`;
}

/* ---------- Home ---------- */
function viewHome(d) {
  const c = cycle();
  if (!c) return `<p class="empty">Nessun ciclo. Importa una scheda dalle impostazioni.</p>`;
  const letters = L.sheetLetters(c);
  const open = L.openSession(d);
  const sug = L.nextSuggestion(d, c);
  const sessions = L.sessionsOf(d, c.id).filter((s) => s.finishedAt || L.sessionHasWork(s)).reverse();
  const dayPlan = c.dayPlan || {};
  const weekBars = Array.from({ length: c.weeks }, (_, i) => {
    const n = letters.filter((l) => L.doneInWeek(d, c, l, i + 1)).length;
    return `<div class="wk"><i><b style="width:${(n / letters.length) * 100}%"></b></i>S${i + 1} · ${n}/${letters.length}</div>`;
  }).join("");
  return `
  ${reminders(d).map((r) => `<div class="banner ${r.cls || ""} row"><span>${esc(r.text)}</span>${r.act ? `<button class="btn small" data-act="${r.act}" ${r.view ? `data-view="${r.view}"` : ""}>${esc(r.btn)}</button>` : ""}</div>`).join("")}
  ${open ? `<div class="banner info row"><span>Sessione in corso: scheda ${esc(open.sheet)} · sett. ${open.week}</span><button class="btn small" data-act="open-session" data-id="${open.id}">Riprendi</button></div>` : ""}
  ${c.closed ? `<div class="banner">Ciclo ${c.number} chiuso. Puoi ancora correggere, aggiungere o eliminare le sue sessioni.</div>` : ""}
  ${!c.closed ? `<section class="card next stack"><div class="label">Prossima scheda</div>
    <div class="row"><div><div class="big">${esc(sug.sheet)}</div><div class="hint" style="font-size:13px">Settimana ${sug.week} · dopo l'ultima fatta</div></div>
    <button class="btn" data-act="start" data-sheet="${esc(sug.sheet)}" data-week="${sug.week}">Inizia ${esc(sug.sheet)}</button></div></section>` : ""}
  <section class="card stack"><div class="label">${c.closed ? "Apri una scheda" : "Oppure scegli"} · settimana ${sug.week}</div>
    <div class="grid4">${letters.map((l) => {
      const done = L.doneInWeek(d, c, l, sug.week);
      return `<button class="pick ${l === sug.sheet && !c.closed ? "sel" : ""} ${done ? "done" : ""}" data-act="start" data-sheet="${esc(l)}" data-week="${sug.week}"><b>${esc(l)}</b><small>${done ? "✓ fatta" : l === sug.sheet && !c.closed ? "suggerita" : esc(dayPlan[l] || "da fare")}</small></button>`;
    }).join("")}</div></section>
  <section class="card stack"><div class="row"><div class="label">Avanzamento</div><span class="hint">${esc(L.fmtRange(c.startDate, L.cycleEnd(c)))}</span></div>
    <div class="weeks">${weekBars}</div></section>
  <section class="card stack"><div class="label">Sessioni fatte</div>
    ${sessions.length ? `<ul class="list">${sessions.map((s) => `<li><span>${esc(s.sheet)} · sett. ${s.week} · ${esc(L.fmtDate(s.date))}</span>
      <span class="acts"><button class="mini" data-act="open-session" data-id="${s.id}">Modifica</button><button class="mini danger" data-confirm="delete-session" data-id="${s.id}">Elimina</button></span></li>`).join("")}</ul>` : `<p class="hint">Ancora nessuna sessione in questo ciclo.</p>`}
  </section>
  <button class="btn ghost" data-act="past-session">+ Inserisci sessione passata</button>`;
}

/* ---------- Reminders: weight after 3 days, circumferences every week, token expiry ---------- */
function reminders(d) {
  const out = [];
  const lastW = store.live(d.weights).reduce((a, w) => (w.date > a ? w.date : a), "");
  const lastM = store.live(d.measurements).reduce((a, m) => (m.date > a ? m.date : a), "");
  const dw = L.daysSince(lastW), dm = L.daysSince(lastM);
  if (dw >= 3) out.push({ text: lastW ? `Non registri il peso da ${dw} giorni.` : "Non hai ancora registrato il peso.", act: "go", view: "measures", btn: "Registra" });
  if (dm >= 7) out.push({ text: lastM ? `Ultime circonferenze ${dm} giorni fa: è ora di misurarle.` : "Non hai ancora preso le circonferenze.", act: "go", view: "measures", btn: "Misura" });
  const exp = gh.getConfig().expiry;
  if (exp && gh.isConfigured()) {
    const left = -L.daysSince(exp);
    if (left < 0) out.push({ cls: "danger", text: "Il token GitHub è scaduto: la sincronizzazione è ferma. Rigeneralo e incollalo nelle impostazioni.", act: "go", view: "settings", btn: "Apri" });
    else if (left <= 14) out.push({ text: `Il token GitHub scade tra ${left} giorni (${L.fmtDate(exp, { weekday: false })}). Rigeneralo per tempo.`, act: "go", view: "settings", btn: "Apri" });
  }
  return out;
}
const measureDue = (d) => L.daysSince(store.live(d.weights).reduce((a, w) => (w.date > a ? w.date : a), "")) >= 3 || L.daysSince(store.live(d.measurements).reduce((a, m) => (m.date > a ? m.date : a), "")) >= 7;

/* ---------- Session ---------- */
function prevEntryFor(d, session, exerciseId) {
  return L.historyFor(d, exerciseId, { before: session })[0] || null;
}
function lastBarFor(d, exerciseId) {
  for (const h of L.historyFor(d, exerciseId)) if (h.entry.barId) return h.entry.barId;
  return L.exerciseOf(d, exerciseId)?.defaultBarId || "";
}
function supersetLabel(slot) {
  if (slot.superset === "first") return `<span class="ss">Superset 1/2 · ${L.fmtRest(slot.rest)} poi il secondo</span>`;
  if (slot.superset === "second") return `<span class="ss">Superset 2/2 · poi ${L.fmtRest(slot.rest)}</span>`;
  return "";
}

function viewWorkout(d) {
  const s = sessionById(ui.sessionId);
  if (!s) {
    const open = L.openSession(d);
    if (open) { ui.sessionId = open.id; return viewWorkout(d); }
    const c = cycle(), sug = L.nextSuggestion(d, c);
    return `<section class="card stack"><h2>Nessuna sessione aperta</h2><p class="hint" style="font-size:14px">Inizia la prossima scheda o scegline un'altra dalla Home.</p>
      <button class="btn" data-act="start" data-sheet="${esc(sug.sheet)}" data-week="${sug.week}">Inizia scheda ${esc(sug.sheet)} · settimana ${sug.week}</button>
      <button class="btn ghost" data-act="go" data-view="home">Vai alla Home</button></section>`;
  }
  const c = cycleOfSession(s);
  const slots = c.sheets[s.sheet] || [];
  return `
  <section class="card"><div class="sess-head"><div><h2>Scheda ${esc(s.sheet)} · Settimana ${s.week}</h2>
    <div class="hint">${esc(L.fmtDate(s.date, { year: true }))} · Ciclo ${c.number}${c.closed ? " (chiuso)" : ""}</div></div>
    <button class="mini" data-act="edit-session-meta">Modifica</button></div></section>
  ${slots.map((slot) => exerciseCard(d, c, s, slot)).join("")}
  <button class="btn" data-act="finish">Termina sessione</button>`;
}

function exerciseCard(d, c, s, slot) {
  const r = L.resolveSlot(c, slot, s);
  const ex = L.exerciseOf(d, r.exerciseId) || { name: "Esercizio", district: slot.district };
  const entry = s.entries?.[slot.id];
  const targets = L.targetsFor(r.blocks, s.week);
  const prev = prevEntryFor(d, s, r.exerciseId);
  const prevRaw = prev?.entry.sets || [];
  const prevLast = prevRaw.filter(Boolean).pop();
  const hist = L.historyFor(d, r.exerciseId, { before: s }).slice(0, 4);
  const chips = hist.length
    ? hist.map((h) => `<span><b>C${h.cycle.number} S${h.session.week}:</b> ${L.countedSets(h).map(L.fmtSet).join(", ")}</span>`).join("")
    : `<span>Mai fatto prima</span>`;
  const best = L.bestLoadBefore(d, r.exerciseId, s);
  const isPR = (st, role) => !!st?.done && role !== "warm" && best != null && st.load != null && st.load > best;
  let k = 0;
  const blocks = r.blocks.map((b, bi) => {
    const items = targets.filter((t) => t.block === bi);
    if (!items.length) return "";
    const head = b.mav ? `MAV ${esc(L.atWeek(b.reps, s.week))} · conta solo l'ultima serie` : `${items.length}×${esc(items[0].reps)}${r.blocks[bi - 1]?.mav ? " · con il carico MAV" : ""}`;
    return `<div class="block" data-block="${bi}"><span class="label">${head}</span>${items.map((t) => {
      const i = k++;
      const saved = entry?.sets?.[i];
      const pv = prevRaw[i] || (t.role === "warm" ? null : prevLast);
      const reps = saved?.reps ?? (L.isNumericReps(t.reps) ? t.reps : pv?.reps ?? "");
      const load = saved?.load ?? pv?.load ?? "";
      const role = t.role === "warm" ? "avv " : t.role === "mav" ? "MAV " : "";
      return setRow(slot.id, i, `${role}${t.reps}`, t.role, saved, reps, load, isPR(saved, t.role));
    }).join("")}</div>`;
  }).join("");
  const extra = entry?.extra || 0;
  const extraRows = Array.from({ length: extra }, (_, j) => {
    const i = targets.length + j, saved = entry?.sets?.[i];
    const pv = entry?.sets?.[i - 1] || prevLast;
    return setRow(slot.id, i, "extra", "extra", saved, saved?.reps ?? pv?.reps ?? "", saved?.load ?? pv?.load ?? "", isPR(saved, "extra"));
  }).join("");
  const extraHtml = `<div class="block">${extra ? `<span class="label">Serie extra</span>${extraRows}` : ""}
    <div class="extra-btns"><button class="mini" data-act="add-set" data-slot="${slot.id}">+ serie</button>${extra ? `<button class="mini danger" data-act="remove-set" data-slot="${slot.id}">− serie</button>` : ""}</div></div>`;
  const barId = entry?.barId ?? lastBarFor(d, r.exerciseId);
  const bars = store.live(d.bars);
  const bar = L.barOf(d, barId);
  const barHtml = ex.usesBar ? `<select data-act="bar" data-slot="${slot.id}" aria-label="Bilanciere"><option value="">Nessun bilanciere</option>${bars.map((b) => `<option value="${b.id}" ${b.id === barId ? "selected" : ""}>${esc(b.name)}${b.kg != null ? ` · ${L.fmtNum(b.kg)} kg` : ""}</option>`).join("")}</select>
    <div class="total" data-total="${slot.id}"></div>` : "";
  const prevNote = !entry?.note && prev?.entry.note ? `Ultima nota: ${prev.entry.note}` : "Le tue note";
  const sub = r.substitution ? `<div class="subtag">⇄ Sostituisce: ${esc(L.exName(d, slot.exerciseId))} · ${r.substitution === "permanent" ? "definitiva" : "solo oggi"}<button data-act="restore" data-slot="${slot.id}">Ripristina originale</button></div>` : "";
  const coach = !r.substitution ? [
    slot.description && `<p>${esc(slot.description)}</p>`,
    slot.exerciseNote && `<p><b>Nota:</b> ${esc(slot.exerciseNote)}</p>`,
    slot.progressionNote && `<p><b>Progressione:</b> ${esc(slot.progressionNote)}</p>`,
    slot.tut && `<p><b>TUT:</b> ${esc(slot.tut)}</p>`,
    slot.week4Plus && `<p><b>Settimana 4:</b> aumenta il carico (+).</p>`,
    slot.video && `<p><a href="${esc(slot.video)}" target="_blank" rel="noopener">Apri il video</a></p>`,
  ].filter(Boolean).join("") : "";
  return `<article class="card" data-card="${slot.id}">
    <div class="ex-head"><span class="dist">${esc(ex.district || slot.district || "")}</span>
      <div class="ex-title"><h3>${esc(ex.name)}</h3><div class="meta"><span>${esc(L.schemaLabel(r.blocks, s.week))}</span><span>Recupero ${esc(L.fmtRest(slot.rest))}</span>${supersetLabel(slot)}</div></div>
      <div class="ex-btns"><button class="swapbtn" data-act="swap" data-slot="${slot.id}">⇄ Sostituisci</button><button class="restbtn" data-act="rest" data-slot="${slot.id}">⏱ Recupero</button></div></div>
    ${sub}
    <div class="hist">${chips}<button data-act="history" data-ex="${r.exerciseId}">Storico ›</button></div>
    ${blocks || `<p class="hint" style="margin-top:10px">Nessuna serie prevista questa settimana.</p>`}
    ${extraHtml}
    <div class="extras">${barHtml}
      <label class="setup full" for="setup-${slot.id}"><span>⚙︎ Regolazioni</span><input id="setup-${slot.id}" type="text" data-act="setup" data-ex="${r.exerciseId}" value="${esc(ex.setup || "")}" placeholder="es. schienale tacca 3, sellino 4" aria-label="Regolazioni della macchina"></label>
      <input class="full" type="text" data-act="note" data-slot="${slot.id}" value="${esc(entry?.note || "")}" placeholder="${esc(prevNote)}" aria-label="Note di oggi"></div>
    ${coach ? `<details><summary>Note del coach e video</summary>${coach}</details>` : ""}
  </article>`;
}

function setRow(slotId, i, target, role, saved, reps, load, pr) {
  return `<div class="set ${saved?.done ? "done" : ""} ${pr ? "pr" : ""}" data-slot="${slotId}" data-k="${i}">
    <span class="n">${pr ? '<b class="pr-tag">PR</b>' : i + 1}</span><span class="tgt ${role}">${esc(target)}</span>
    <label class="field"><input data-f="reps" inputmode="numeric" value="${esc(reps)}" placeholder="–" aria-label="Ripetizioni serie ${i + 1}"><em>rip</em></label>
    <label class="field"><input data-f="load" inputmode="decimal" value="${esc(L.fmtNum(load))}" placeholder="–" aria-label="Carico serie ${i + 1}"><em>kg</em></label>
    <button class="check" data-act="check" ${role === "mav" ? 'data-mav="1"' : ""} ${role === "warm" ? 'data-warm="1"' : ""} aria-label="Serie ${i + 1} fatta" aria-pressed="${!!saved?.done}">✓</button></div>`;
}

function ensureEntry(d, s, slot) {
  const c = d.cycles.find((x) => x.id === s.cycleId);
  s.entries ??= {};
  let e = s.entries[slot.id];
  if (!e) {
    const r = L.resolveSlot(c, slot, s);
    e = s.entries[slot.id] = { exerciseId: r.exerciseId, substitution: r.substitution, sets: [] };
  }
  s.updatedAt = store.now();
  return e;
}
const slotOf = (s, slotId) => cycleOfSession(s).sheets[s.sheet].find((x) => x.id === slotId);

function readSet(row) {
  return { reps: L.parseNum($('[data-f="reps"]', row).value), load: L.parseNum($('[data-f="load"]', row).value) };
}

function onSetInput(row) {
  const s = sessionById(ui.sessionId);
  const slotId = row.dataset.slot, k = +row.dataset.k;
  store.mutate((d) => {
    const sess = d.sessions.find((x) => x.id === s.id);
    const e = ensureEntry(d, sess, slotOf(sess, slotId));
    const prev = e.sets[k] || {};
    e.sets[k] = { ...prev, ...readSet(row), done: !!prev.done };
  });
  updateBarTotal(slotId);
}

function onCheck(btn) {
  unlockAudio();
  const row = btn.closest(".set");
  const s = sessionById(ui.sessionId);
  const slotId = row.dataset.slot, k = +row.dataset.k;
  const done = !row.classList.contains("done");
  const values = readSet(row);
  store.mutate((d) => {
    const sess = d.sessions.find((x) => x.id === s.id);
    const e = ensureEntry(d, sess, slotOf(sess, slotId));
    e.sets[k] = { ...values, done };
  });
  row.classList.toggle("done", done);
  btn.setAttribute("aria-pressed", String(done));
  renderHeader();
  const slot = slotOf(s, slotId);
  const r = L.resolveSlot(cycleOfSession(s), slot, sessionById(s.id));
  const best = L.bestLoadBefore(D(), r.exerciseId, sessionById(s.id));
  const pr = done && !btn.dataset.warm && best != null && values.load != null && values.load > best;
  row.classList.toggle("pr", pr);
  $(".n", row).innerHTML = pr ? '<b class="pr-tag">PR</b>' : String(k + 1);
  if (!done) return;
  if (pr) toast(`Nuovo record su ${L.exName(D(), r.exerciseId)}: ${L.fmtNum(values.load)} kg (prima ${L.fmtNum(best)} kg)`, { ms: 3500 });
  startTimer(slot.rest, L.exName(D(), r.exerciseId));
  if (btn.dataset.mav && values.load != null) {
    const next = row.closest(".block").nextElementSibling;
    if (next?.classList.contains("block")) {
      $$(".set:not(.done) [data-f=load]", next).forEach((inp) => { inp.value = L.fmtNum(values.load); });
      toast(`Serie di lavoro precompilate con il carico MAV: ${L.fmtNum(values.load)} kg`);
      updateBarTotal(slotId);
    }
  }
}

function barTotalText(bar, loads) {
  if (!bar) return "";
  if (bar.kg == null) return "Imposta il peso di questo bilanciere in ⚙︎ → Bilancieri";
  const max = Math.max(...loads.filter((x) => x != null));
  if (!Number.isFinite(max)) return `Bilanciere ${L.fmtNum(bar.kg)} kg: inserisci i dischi per vedere il totale`;
  return `Dischi + bilanciere: ${L.fmtNum(max + bar.kg)} kg (serie più pesante)`;
}
function updateBarTotal(slotId) {
  const el = $(`[data-total="${slotId}"]`);
  if (!el) return;
  const sel = $(`select[data-act="bar"][data-slot="${slotId}"]`);
  const loads = $$(`[data-card="${slotId}"] [data-f=load]`).map((i) => L.parseNum(i.value));
  el.textContent = barTotalText(L.barOf(D(), sel?.value), loads);
}
const refreshBarTotals = () => $$("[data-total]").forEach((el) => updateBarTotal(el.dataset.total));

async function startSession(sheet, week, date) {
  const d = D(), c = cycle();
  const existing = L.sessionsOf(d, c.id).filter((s) => s.sheet === sheet && s.week === week).pop();
  if (existing) { go("workout", { sessionId: existing.id }); return; }
  const id = store.uid();
  store.mutate((dd) => store.upsert(dd, "sessions", { id, cycleId: c.id, sheet, week, date: date || L.todayISO(), createdAt: store.now(), finishedAt: null, entries: {} }));
  go("workout", { sessionId: id });
}

async function finishSession() {
  const s = sessionById(ui.sessionId);
  if (!L.sessionHasWork(s)) {
    openModal(`<h2>Nessuna serie segnata</h2><p class="hint" style="font-size:14px">Questa sessione non ha serie spuntate. Vuoi eliminarla?</p>
      <div class="row"><button class="btn ghost" data-act="close">Continua la sessione</button><button class="btn danger" data-act="discard-session">Elimina</button></div>`);
    return;
  }
  store.mutate((d) => { const x = d.sessions.find((y) => y.id === s.id); x.finishedAt ??= store.now(); x.updatedAt = store.now(); });
  saveTimer(null); drawTimer();
  go("home");
  toast("Sessione salvata");
  await runSync(`feat: log session ${s.sheet} week ${s.week} (${s.date})`, { quiet: false });
}

/* ---------- Substitution ---------- */
const SYN = [["press", "spinta", "spinte", "distensioni", "panca"], ["row", "rematore", "pulley"], ["lat", "trazioni", "pulldown"], ["alzate", "laterali", "raise"], ["squat", "pressa", "leg press", "hack"], ["stacco", "rdl", "deadlift"], ["curl", "bicipiti"], ["push down", "pushdown", "tricipiti", "french"], ["croci", "fly", "chest fly"], ["crunch", "addome", "leg raises"]];
function lev(a, b) {
  const dp = [...Array(b.length + 1).keys()];
  for (let i = 1; i <= a.length; i++) {
    let p = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = dp[j]; dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, p + (a[i - 1] === b[j - 1] ? 0 : 1)); p = t; }
  }
  return dp[b.length];
}
function tokenHit(qt, words) {
  const alts = new Set([qt]);
  SYN.forEach((g) => { if (g.some((x) => x.startsWith(qt) || (qt.length >= 4 && lev(qt, x.slice(0, qt.length)) <= 1))) g.forEach((x) => alts.add(x.split(" ")[0])); });
  let best = 0;
  for (const a of alts) for (const w of words) {
    const k = a === qt ? 1 : 0.8;
    let sc = 0;
    if (w === a) sc = 3; else if (w.startsWith(a)) sc = 2.5;
    else if (a.length >= 3 && w.includes(a)) sc = 2;
    else if (a.length >= 4 && Math.min(lev(a, w), lev(a, w.slice(0, a.length))) <= 1) sc = 1.5;
    best = Math.max(best, sc * k);
  }
  return best;
}
export function matchScore(q, name) {
  const qs = L.norm(q).split(" ").filter(Boolean);
  if (!qs.length) return 1;
  const words = L.norm(name).split(" ").filter(Boolean);
  let s = 0, hits = 0;
  qs.forEach((t) => { const h = tokenHit(t, words); if (h) { s += h; hits++; } });
  return hits ? (s * hits) / qs.length : 0;
}

const subState = { slotId: null, pick: null, mode: "today", schemaMode: null };

function openSubstitution(slotId) {
  const s = sessionById(ui.sessionId), c = cycleOfSession(s), slot = slotOf(s, slotId);
  Object.assign(subState, { slotId, pick: null, mode: "today", schemaMode: null });
  openModal(`<div><div class="label">Sostituisci</div><h2>${esc(L.exName(D(), slot.exerciseId))}</h2></div>
    <label class="label" for="subSearch">Cerca nel catalogo<input id="subSearch" type="search" data-act="sub-search" placeholder="Es. chest press" autocomplete="off"></label>
    <ul class="cat" id="subList"></ul>
    <button class="btn ghost small" data-act="sub-new-toggle">+ Crea esercizio nuovo</button>
    <div class="card stack" id="subNew" hidden>
      <label class="label" for="subNewName">Nome<input id="subNewName" type="text" placeholder="Es. Panca piana manubri"></label>
      <div class="extras" style="margin-top:0">
        <label class="label" for="subNewDist">Distretto<select id="subNewDist">${L.DISTRICTS.map((x) => `<option ${x === slot.district ? "selected" : ""}>${x}</option>`).join("")}</select></label>
        <label class="label" for="subNewBar">Bilanciere<select id="subNewBar"><option value="0">No</option><option value="1">Sì</option></select></label>
      </div>
      <button class="btn small" data-act="sub-new-add">Aggiungi al catalogo</button>
    </div>
    <div class="label">Tipo di sostituzione</div>
    <div class="seg" id="subMode"><button data-act="sub-mode" data-mode="today" class="sel">Solo oggi<small>poi torna l'originale</small></button><button data-act="sub-mode" data-mode="permanent">Definitiva<small>fino a fine ciclo</small></button></div>
    <div class="label">Schema</div>
    <p class="hint">Eredita lo schema dell'originale: ${esc(L.schemaLabel(slot.blocks, s.week))}, recupero ${esc(L.fmtRest(slot.rest))}.</p>
    <button class="btn ghost small" data-act="sub-schema-toggle" id="subSchemaToggle">Modifica schema</button>
    <div class="card stack" id="subSchema" hidden>
      <div class="seg"><button data-act="sub-schema" data-schema="uniform" class="sel">Uguale per tutte<small>stesse serie e rip</small></button><button data-act="sub-schema" data-schema="weekly">Diverso per settimana<small>piramidi, target che calano</small></button></div>
      <div id="subUniform" class="wkrow"><span class="label">Sett. ${s.week}–${c.weeks}</span><input id="uSets" type="number" inputmode="numeric" value="${L.atWeek(slot.blocks[0].sets, s.week)}" aria-label="Serie"><input id="uReps" type="text" value="${esc(L.atWeek(slot.blocks[slot.blocks.length - 1].reps, s.week))}" aria-label="Ripetizioni"></div>
      <div id="subWeekly" class="stack" hidden>${Array.from({ length: c.weeks - s.week + 1 }, (_, j) => { const w = s.week + j; return `<div class="wkrow"><span class="label">Sett. ${w}</span><input id="wS${w}" type="number" inputmode="numeric" value="${L.atWeek(slot.blocks[0].sets, w)}" aria-label="Serie settimana ${w}"><input id="wR${w}" type="text" value="${esc(L.atWeek(slot.blocks[slot.blocks.length - 1].reps, w))}" aria-label="Ripetizioni settimana ${w}"></div>`; }).join("")}</div>
      <p class="hint">Prima colonna serie, seconda ripetizioni (anche 10-12 o max).</p>
    </div>
    <div class="row"><button class="btn ghost" data-act="close">Annulla</button><button class="btn" data-act="sub-confirm" id="subOk" disabled>Conferma</button></div>`);
  renderSubList();
}

function renderSubList() {
  const s = sessionById(ui.sessionId), slot = slotOf(s, subState.slotId);
  const current = L.resolveSlot(cycleOfSession(s), slot, s).exerciseId;
  const q = $("#subSearch")?.value || "";
  const dist = slot.district;
  const items = store.live(D().exercises).filter((e) => e.id !== current)
    .map((e) => ({ ...e, score: matchScore(q, e.name) })).filter((e) => e.score > 0)
    .sort((a, b) => (b.district === dist) - (a.district === dist) || b.score - a.score || a.name.localeCompare(b.name, "it"));
  const same = items.filter((e) => e.district === dist), other = items.filter((e) => e.district !== dist);
  const li = (e) => `<li><button data-act="sub-pick" data-id="${e.id}" class="${subState.pick === e.id ? "sel" : ""}"><span class="dist">${esc(e.district)}</span>${esc(e.name)}</button></li>`;
  $("#subList").innerHTML = (same.length ? `<li class="cat-h">Stesso distretto · ${esc(dist)}</li>${same.map(li).join("")}` : "")
    + (other.length ? `<li class="cat-h">Altri distretti</li>${other.map(li).join("")}` : "")
    || `<li style="padding:10px;font-size:13px;color:var(--muted)">Nessun risultato. Crealo qui sotto.</li>`;
  $("#subOk").disabled = !subState.pick;
}

function confirmSubstitution() {
  const s = sessionById(ui.sessionId), c = cycleOfSession(s), slot = slotOf(s, subState.slotId);
  let schema = null;
  if (subState.schemaMode === "uniform") {
    const n = Math.max(1, parseInt($("#uSets").value, 10) || 1), r = $("#uReps").value.trim() || "10";
    schema = [{ sets: Array(c.weeks).fill(n), reps: Array(c.weeks).fill(r) }];
  } else if (subState.schemaMode === "weekly") {
    const sets = [], reps = [];
    for (let w = 1; w <= c.weeks; w++) {
      const S = $(`#wS${Math.max(w, s.week)}`), R = $(`#wR${Math.max(w, s.week)}`);
      sets.push(Math.max(1, parseInt(S?.value, 10) || 1)); reps.push(R?.value.trim() || "10");
    }
    schema = [{ sets, reps }];
  }
  const exerciseId = subState.pick, mode = subState.mode;
  store.mutate((d) => {
    const cc = d.cycles.find((x) => x.id === c.id);
    if (mode === "permanent") {
      cc.overrides = { ...(cc.overrides || {}), [slot.id]: { exerciseId, fromWeek: s.week, schema } };
      cc.updatedAt = store.now();
    }
    const sess = d.sessions.find((x) => x.id === s.id);
    sess.entries ??= {};
    sess.entries[slot.id] = { exerciseId, substitution: mode, schema, sets: [], barId: sess.entries[slot.id]?.barId, note: sess.entries[slot.id]?.note };
    sess.updatedAt = store.now();
  });
  closeModal();
  render();
  toast(mode === "permanent" ? "Sostituito fino a fine ciclo" : "Sostituito solo per oggi");
}

function restoreOriginal(slotId) {
  const s = sessionById(ui.sessionId), c = cycleOfSession(s), slot = slotOf(s, slotId);
  store.mutate((d) => {
    const cc = d.cycles.find((x) => x.id === c.id);
    const ov = cc.overrides?.[slotId];
    if (ov && s.week >= ov.fromWeek) {
      const o = { ...cc.overrides }; delete o[slotId]; cc.overrides = o; cc.updatedAt = store.now();
    }
    const sess = d.sessions.find((x) => x.id === s.id);
    sess.entries ??= {};
    sess.entries[slotId] = { exerciseId: slot.exerciseId, substitution: null, sets: [], barId: sess.entries[slotId]?.barId, note: sess.entries[slotId]?.note };
    sess.updatedAt = store.now();
  });
  render();
  toast("Ripristinato l'esercizio originale");
}

function openHistory(exerciseId) {
  const d = D();
  const hist = L.historyFor(d, exerciseId);
  openModal(`<div><div class="label">Storico completo</div><h2>${esc(L.exName(d, exerciseId))}</h2></div>
    ${hist.length ? `<div class="tbl-wrap"><table class="tbl"><tr><th>Data</th><th>Ciclo</th><th>Serie (kg × rip)</th></tr>
    ${hist.map((h) => `<tr><td>${esc(L.fmtDate(h.session.date, { weekday: false, year: true }))}</td><td>C${h.cycle.number} S${h.session.week}</td><td style="white-space:normal">${L.countedSets(h).map(L.fmtSet).join(", ")}${h.entry.note ? `<br><span class="hint">${esc(h.entry.note)}</span>` : ""}</td></tr>`).join("")}</table></div>` : `<p class="hint">Nessuna serie registrata finora.</p>`}
    <button class="btn ghost" data-act="close">Chiudi</button>`);
}

/* ---------- Logbook ---------- */
function viewLogbook(d) {
  const c = cycle();
  const letters = L.sheetLetters(c);
  if (!letters.includes(ui.logSheet)) ui.logSheet = letters[0];
  const rows = L.logbookRows(d, c, ui.logSheet);
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
  return `<p class="hint">Una pagina per scheda, compilata solo nelle settimane fatte. I sostituti hanno una riga loro sotto l'esercizio originale. Le serie MAV non vengono riportate.</p>
  <button class="btn" data-act="export-logbook">Esporta PDF</button>
  <div class="grid4">${letters.map((l) => `<button class="pick ${l === ui.logSheet ? "sel" : ""}" data-act="log-sheet" data-sheet="${esc(l)}"><b>${esc(l)}</b></button>`).join("")}</div>
  <div class="sheet-wrap"><div class="sheet-head"><b>Scheda ${esc(ui.logSheet)}</b><span>${esc(d.profile?.athlete || "")} · Ciclo ${c.number} · ${esc(L.fmtRange(c.startDate, L.cycleEnd(c)))}</span></div>
  <table class="sheet">${head}${body}</table></div>`;
}

/* ---------- Measurements ---------- */
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

/* ---------- Charts: averages per day / week / month / quarter / year, with navigation back in time ---------- */
const chartData = {};

function chartBlock(id, points, unit, defaultGran, { table = false } = {}) {
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
  const W = 320, H = 140, pl = 36, pr = 10, pt = 12, pb = 24;
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
  const svg = `<svg class="trend" viewBox="0 0 ${W} ${H}" role="img" aria-label="Andamento in ${unit}">
    ${ticks.map((t) => `<line class="grid" x1="${pl}" x2="${W - pr}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="axis" x="${pl - 4}" y="${(y(t) + 3).toFixed(1)}" text-anchor="end">${L.fmtNum(Math.round(t * 10) / 10)}</text>`).join("")}
    ${area ? `<path class="area" d="${area}"/>` : ""}<path class="line" d="${path}"/>
    <circle class="dot last ${lastB.alt ? "alt" : ""}" cx="${x(lastB.i).toFixed(1)}" cy="${y(lastB.v).toFixed(1)}" r="4"/>
    ${filled.map((b) => `<circle class="dot ${b.alt ? "alt" : ""}" cx="${x(b.i).toFixed(1)}" cy="${y(b.v).toFixed(1)}" r="${b.alt ? 3.4 : 2.4}"><title>${esc(b.label)}: ${L.fmtNum(Math.round(b.v * 10) / 10)} ${unit}${b.alt ? " (altra bilancia)" : ""}</title></circle>`).join("")}
    ${labels.map((i) => `<text class="axis" x="${x(i).toFixed(1)}" y="${H - 7}" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${esc(r.buckets[i].short)}</text>`).join("")}
  </svg>`;
  const vals = filled.map((b) => b.v), avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const round = (v) => L.fmtNum(Math.round(v * 10) / 10);
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

const MONTH_NAMES = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
/** Group dated records newest first under a key (month or year), for collapsible lists. */
function groupBy(items, keyFn) {
  const groups = [];
  for (const it of items) {
    const k = keyFn(it);
    let g = groups[groups.length - 1];
    if (!g || g.key !== k) { g = { key: k, items: [] }; groups.push(g); }
    g.items.push(it);
  }
  return groups;
}

function viewMeasures(d) {
  const ws = store.live(d.weights).sort((a, b) => (a.date > b.date ? 1 : -1));
  const ms = store.live(d.measurements).sort((a, b) => (a.date > b.date ? 1 : -1));
  const wl = ws[ws.length - 1];
  const wWeek = wl ? ws.find((w) => w.date >= L.addDays(wl.date, -7)) : null;
  const wEdit = ui.weightEdit ? ws.find((w) => w.id === ui.weightEdit) : null;
  const last = ms[ms.length - 1];
  const editing = ui.measureEdit ? ms.find((m) => m.id === ui.measureEdit) : null;
  if (ui.measureIdx == null || ui.measureIdx >= ms.length) ui.measureIdx = ms.length - 1;
  const cur = ms[ui.measureIdx], prevM = ms[ui.measureIdx - 1];
  return `
  <section class="card stack"><div class="row"><h2>Esporta</h2></div>
    <div class="row"><button class="btn ghost small" style="flex:1" data-act="export-measures" data-mode="last">Ultime misure (PDF)</button><button class="btn ghost small" style="flex:1" data-act="export-measures" data-mode="all">Storico completo (PDF)</button></div></section>

  <section class="card stack"><div class="row"><h2>Peso</h2>${wl && wWeek && wWeek !== wl ? `<span class="delta">7 giorni: ${L.fmtDelta(wl.kg, wWeek.kg)} kg${wl.scale === "other" || wWeek.scale === "other" ? "*" : ""}</span>` : ""}</div>
    ${wEdit ? `<div class="banner info">Stai modificando il peso del ${esc(L.fmtDate(wEdit.date))}</div>` : ""}
    <div class="seg scale-seg" role="group" aria-label="Bilancia"><button data-act="scale" data-v="home" class="${(ui.weightScale ?? wEdit?.scale ?? "home") === "home" ? "sel" : ""}">Bilancia personale<small>quella di casa</small></button><button data-act="scale" data-v="other" class="${(ui.weightScale ?? wEdit?.scale ?? "home") === "other" ? "sel alt" : ""}">Altra bilancia<small>fuori casa, palestra…</small></button></div>
    <div class="wrow"><input class="wdate" id="wDate" type="date" value="${wEdit ? wEdit.date : L.todayISO()}" aria-label="Data"><label class="field"><input id="wVal" inputmode="decimal" value="${wEdit ? esc(L.fmtNum(wEdit.kg)) : ""}" placeholder="${wl ? esc(L.fmtNum(wl.kg)) : "kg"}" aria-label="Peso in kg"><em>kg</em></label><button class="btn small" data-act="save-weight">${wEdit ? "Salva modifica" : "Salva"}</button></div>
    ${wEdit ? `<button class="btn ghost small" data-act="weight-cancel">Annulla modifica</button>` : ""}
    ${ws.length ? chartBlock("weight", ws.map((w) => ({ date: w.date, v: w.kg, alt: w.scale === "other" })), "kg", "D") : ""}
    ${ws.length ? `<div class="label">Tutti i pesi</div><div class="groups">${groupBy(ws.slice().reverse(), (w) => w.date.slice(0, 7)).map((g, gi) => {
      const [yy, mm] = g.key.split("-"), avg = g.items.reduce((a, w) => a + w.kg, 0) / g.items.length;
      return `<details ${gi === 0 || g.items.some((w) => w.id === ui.weightEdit) ? "open" : ""}><summary><span>${MONTH_NAMES[+mm - 1]} ${yy}</span><span class="hint">${g.items.length} ${g.items.length === 1 ? "valore" : "valori"} · media ${L.fmtNum(Math.round(avg * 10) / 10)} kg${g.items.some((w) => w.scale === "other") ? ` · <span class="scale-tag">${g.items.filter((w) => w.scale === "other").length} altra bil.</span>` : ""}</span></summary>
        <div class="tbl-wrap"><table class="tbl">${g.items.map((w) => { const i = ws.findIndex((x) => x.id === w.id), pv = ws[i - 1]; return `<tr class="tap ${w.id === ui.weightEdit ? "editing" : ""}" data-act="edit-weight" data-id="${w.id}"><td>${esc(L.fmtDate(w.date))}${w.scale === "other" ? ' <span class="scale-tag">altra bilancia</span>' : ""}</td><td class="num ${w.scale === "other" ? "alt" : ""}">${L.fmtNum(w.kg)} kg</td><td class="num delta">${pv ? L.fmtDelta(w.kg, pv.kg) + (pv.scale === "other" || w.scale === "other" ? "*" : "") : ""}</td><td class="num"><button class="mini danger" data-confirm="delete-weight" data-id="${w.id}">Elimina</button></td></tr>`; }).join("")}</table></div></details>`;
    }).join("")}</div><p class="hint">Tocca un giorno per modificarlo. * differenza calcolata con una pesata fatta su un'altra bilancia: può esserci uno scarto.</p>` : `<p class="hint">Registra il peso quando vuoi, anche ogni giorno.</p>`}
  </section>

  ${cur ? `<section class="card stack"><div class="row"><h2>Storico circonferenze</h2><span class="hint">${ui.measureIdx + 1} di ${ms.length}</span></div>
    <div class="nav-row"><button class="icon-btn" data-act="measure-nav" data-dir="-1" ${ui.measureIdx <= 0 ? "disabled" : ""} aria-label="Misurazione precedente">‹</button>
      <div class="nav-date"><b>${esc(L.fmtDate(cur.date, { year: true }))}</b><span class="hint">${prevM ? `confronto con ${esc(L.fmtDate(prevM.date, { weekday: false }))}` : "prima misurazione"}</span></div>
      <button class="icon-btn" data-act="measure-nav" data-dir="1" ${ui.measureIdx >= ms.length - 1 ? "disabled" : ""} aria-label="Misurazione successiva">›</button></div>
    <div class="tbl-wrap"><table class="tbl"><tr><th>Misura</th><th class="num">cm</th><th class="num">vs prec.</th><th class="num">vs prima</th></tr>
    ${L.MEASURES.map((m) => `<tr class="tap" data-act="measure-trend" data-mk="${m.k}"><td>${m.name} <span class="hint">›</span></td><td class="num">${cur.values[m.k] != null ? L.fmtNum(cur.values[m.k]) : "–"}</td><td class="num delta">${prevM ? L.fmtDelta(cur.values[m.k], prevM.values[m.k]) : "–"}</td><td class="num delta">${L.fmtDelta(cur.values[m.k], ms[0].values[m.k])}</td></tr>`).join("")}</table></div>
    <p class="hint">Tocca una misura per vederne l'andamento nel tempo.</p>
    <div class="row"><button class="btn ghost small" style="flex:1" data-act="edit-measure" data-id="${cur.id}">Modifica</button><button class="mini danger" style="flex:1;padding:9px" data-confirm="delete-measure" data-id="${cur.id}">Elimina</button></div>
    <div class="label">Tutte le misurazioni</div>
    <div class="groups">${groupBy(ms.map((m, i) => ({ ...m, i })).reverse(), (m) => m.date.slice(0, 4)).map((g, gi) => `<details ${gi === 0 || g.items.some((m) => m.i === ui.measureIdx) ? "open" : ""}><summary><span>${g.key}</span><span class="hint">${g.items.length} ${g.items.length === 1 ? "misurazione" : "misurazioni"}</span></summary>
      <ul class="list">${g.items.map((m) => `<li class="tap ${m.i === ui.measureIdx ? "editing" : ""}" data-act="measure-jump" data-idx="${m.i}"><span>${esc(L.fmtDate(m.date))}</span><span class="hint">${m.values.waist != null ? `vita ${L.fmtNum(m.values.waist)} cm` : `${Object.keys(m.values).length} misure`} ›</span></li>`).join("")}</ul></details>`).join("")}</div>
  </section>` : ""}

  <section class="card stack"><h2>${editing ? `Modifica misurazione del ${esc(L.fmtDate(editing.date, { weekday: false }))}` : "Nuova misurazione"}</h2>
    <label class="label" for="mDate">Data<input id="mDate" type="date" value="${editing ? editing.date : L.todayISO()}"></label>
    <div class="body-fig">${bodySvg()}<div>${L.MEASURES.map((m, i) => `<div class="mrow ${m.k === ui.measureActive ? "on" : ""}" data-mk="${m.k}"><span class="n">${i + 1}</span>
      <div><b>${m.name}</b><small>${m.hint}</small>${last?.values[m.k] != null ? `<span class="prev">Ultima: ${L.fmtNum(last.values[m.k])} cm</span>` : ""}</div>
      <label class="field"><input id="m-${m.k}" data-mk="${m.k}" inputmode="decimal" value="${editing?.values[m.k] != null ? esc(L.fmtNum(editing.values[m.k])) : ""}" placeholder="${last?.values[m.k] != null ? esc(L.fmtNum(last.values[m.k])) : ""}" aria-label="${m.name} in cm"><em>cm</em></label></div>`).join("")}</div></div>
    <div class="row">${editing ? `<button class="btn ghost" data-act="measure-cancel">Annulla modifica</button>` : ""}<button class="btn" style="flex:1" data-act="save-measures">${editing ? "Salva modifiche" : "Salva misure"}</button></div>
  </section>`;
}

function openMeasureTrend(k) {
  const m = L.MEASURES.find((x) => x.k === k);
  const pts = store.live(D().measurements).filter((e) => e.values[k] != null).map((e) => ({ date: e.date, v: e.values[k] }));
  openModal(`<div><div class="label">Andamento</div><h2>${esc(m.name)}</h2></div>
    ${pts.length ? chartBlock(`m-${k}`, pts, "cm", "W", { table: true }) : `<p class="hint">Nessun valore registrato.</p>`}
    <button class="btn ghost" data-act="close">Chiudi</button>`);
}

/* ---------- Report ---------- */
function viewReport(d) {
  const all = L.cyclesSorted(d);
  ui.rep.cycles ??= new Set(all.map((c) => c.id));
  const ids = all.filter((c) => ui.rep.cycles.has(c.id)).map((c) => c.id);
  const rep = L.reportData(d, ids);
  const sec = ui.rep.sections;
  const filters = `<section class="card stack"><div class="label">Cicli</div><div class="chips">${all.map((c) => `<label class="chip"><input type="checkbox" data-act="rep-cycle" value="${c.id}" ${ui.rep.cycles.has(c.id) ? "checked" : ""}>Ciclo ${c.number}</label>`).join("")}</div>
    <div class="label">Sezioni</div><div class="chips">${[["sum", "Riepilogo"], ["cmp", "Confronto cicli"], ["vol", "Volume per distretto"], ["meas", "Misure e peso"], ["ex", "Storico esercizio"]].map(([k, t]) => `<label class="chip"><input type="checkbox" data-act="rep-section" value="${k}" ${sec.has(k) ? "checked" : ""}>${t}</label>`).join("")}</div>
    <button class="btn" data-act="export-report">Esporta PDF</button></section>`;
  const cyc = rep.cycles;
  const parts = [filters];
  if (sec.has("sum")) parts.push(`<section class="card stack"><h2>Riepilogo</h2><div class="tiles">
    <div class="tile"><b>${cyc.length}</b><span>cicli</span></div><div class="tile"><b>${rep.sessionsDone}</b><span>sessioni fatte</span></div>
    <div class="tile"><b>${rep.planned ? Math.round((rep.sessionsDone / rep.planned) * 100) : 0}%</b><span>aderenza</span></div></div></section>`);
  if (sec.has("cmp")) parts.push(`<section class="card stack"><h2>Confronto tra cicli</h2><p class="hint">Carico migliore a inizio e fine ciclo, solo dischi.</p>
    <div class="tbl-wrap"><table class="tbl"><tr><th>Esercizio</th>${cyc.map((c) => `<th class="num">Ciclo ${c.number}</th>`).join("")}</tr>
    ${rep.compare.map((r) => `<tr><td>${esc(r.name)}</td>${r.perCycle.map((p) => `<td class="num">${p ? `${L.fmtNum(p.first) || "–"} → <span class="${p.last > p.first ? "up" : ""}">${L.fmtNum(p.last) || "–"}</span>` : "–"}</td>`).join("")}</tr>`).join("")}</table></div></section>`);
  if (sec.has("vol")) parts.push(`<section class="card stack"><h2>Volume per distretto</h2><p class="hint">Serie totali fatte nel ciclo. Del MAV conta solo l'ultima serie.</p>
    <div class="tbl-wrap"><table class="tbl"><tr><th>Distretto</th>${cyc.map((c) => `<th class="num">Ciclo ${c.number}</th>`).join("")}</tr>
    ${Object.keys(rep.volume).sort().map((k) => `<tr><td><span class="dist">${esc(k)}</span> ${esc(L.DISTRICT_NAMES[k] || "")}</td>${cyc.map((c) => `<td class="num">${rep.volume[k][c.id] || 0}</td>`).join("")}</tr>`).join("")}</table></div></section>`);
  if (sec.has("meas")) {
    const ms = store.live(d.measurements).sort((a, b) => (a.date > b.date ? 1 : -1));
    const ws = store.live(d.weights).sort((a, b) => (a.date > b.date ? 1 : -1));
    const f = ms[0], l = ms[ms.length - 1];
    parts.push(`<section class="card stack"><h2>Misure e peso</h2>${ms.length ? `<div class="tbl-wrap"><table class="tbl"><tr><th>Misura</th><th class="num">${esc(L.fmtDate(f.date, { weekday: false }))}</th><th class="num">${esc(L.fmtDate(l.date, { weekday: false }))}</th><th class="num">Δ</th></tr>
      ${L.MEASURES.map((m) => `<tr><td>${m.name}</td><td class="num">${L.fmtNum(f.values[m.k]) || "–"}</td><td class="num">${L.fmtNum(l.values[m.k]) || "–"}</td><td class="num">${L.fmtDelta(l.values[m.k], f.values[m.k])}</td></tr>`).join("")}</table></div>` : `<p class="hint">Nessuna misurazione registrata.</p>`}
      ${ws.length ? `<p class="hint">Peso: ${L.fmtNum(ws[0].kg)} kg il ${esc(L.fmtDate(ws[0].date, { weekday: false }))}${ws[0].scale === "other" ? "*" : ""}, ${L.fmtNum(ws[ws.length - 1].kg)} kg il ${esc(L.fmtDate(ws[ws.length - 1].date, { weekday: false }))}${ws[ws.length - 1].scale === "other" ? "*" : ""} (${L.fmtDelta(ws[ws.length - 1].kg, ws[0].kg)} kg).${ws[0].scale === "other" || ws[ws.length - 1].scale === "other" ? " * altra bilancia, possibile scarto." : ""}</p>` : ""}</section>`);
  }
  if (sec.has("ex")) {
    const exIds = rep.exerciseIds.slice().sort((a, b) => L.exName(d, a).localeCompare(L.exName(d, b), "it"));
    if (!exIds.includes(ui.rep.ex)) ui.rep.ex = exIds[0];
    const h = rep.history[ui.rep.ex] || [];
    parts.push(`<section class="card stack"><h2>Storico esercizio</h2>
      ${exIds.length ? `<select data-act="rep-ex" aria-label="Esercizio">${exIds.map((id) => `<option value="${id}" ${id === ui.rep.ex ? "selected" : ""}>${esc(L.exName(d, id))}</option>`).join("")}</select>
      <div class="tbl-wrap"><table class="tbl"><tr><th>Ciclo</th><th>Sett.</th><th>Data</th><th class="num">Serie migliore</th><th class="num">Serie</th></tr>
      ${h.map((x) => `<tr><td>Ciclo ${x.cycle.number}</td><td>S${x.week}</td><td>${esc(L.fmtDate(x.date, { weekday: false }))}</td><td class="num">${x.best ? esc(L.fmtSet(x.best)) : "–"}</td><td class="num">${x.count}</td></tr>`).join("")}</table></div>` : `<p class="hint">Nessun dato nei cicli selezionati.</p>`}
      <p class="hint">Nel PDF trovi lo storico di tutti gli esercizi.</p></section>`);
  }
  return parts.join("");
}

/* ---------- Settings ---------- */
function viewSettings(d) {
  const cfg = gh.getConfig(), meta = gh.getMeta();
  const bars = d ? store.live(d.bars) : [];
  const q = ui.catalogQuery;
  const exs = d ? store.live(d.exercises).filter((e) => !q || matchScore(q, e.name) > 0).sort((a, b) => a.name.localeCompare(b.name, "it")) : [];
  const cycles = d ? L.cyclesSorted(d) : [];
  return `
  <section class="card stack"><h2>Sincronizzazione GitHub</h2>
    <p class="hint">I dati restano sul telefono e vengono copiati nel file del tuo repository <b>privato</b>. Il token resta solo su questo dispositivo.</p>
    <div class="extras" style="margin-top:0">
      <label class="label" for="ghOwner">Utente o organizzazione<input id="ghOwner" type="text" autocapitalize="none" autocomplete="off" spellcheck="false" value="${esc(cfg.owner || "")}" placeholder="es. giuseppe"></label>
      <label class="label" for="ghRepo">Repository dati<input id="ghRepo" type="text" autocapitalize="none" autocomplete="off" spellcheck="false" value="${esc(cfg.repo || "")}" placeholder="es. harden-data"></label>
      <label class="label" for="ghBranch">Branch<input id="ghBranch" type="text" autocapitalize="none" value="${esc(cfg.branch || "main")}"></label>
      <label class="label" for="ghPath">File<input id="ghPath" type="text" autocapitalize="none" value="${esc(cfg.path || "harden-data.json")}"></label>
      <label class="label full" for="ghToken">Token (fine-grained, solo questo repository)<input id="ghToken" type="password" autocomplete="off" value="${esc(gh.getToken())}" placeholder="github_pat_…"></label>
      <label class="label" for="ghExpiry">Scadenza token<input id="ghExpiry" type="date" value="${esc(cfg.expiry || "")}"></label>
      <label class="label" for="ghDevice">Nome dispositivo<input id="ghDevice" type="text" value="${esc(cfg.device || "")}" placeholder="es. iPhone Giuseppe"></label>
    </div>
    <button class="btn" data-act="gh-save">Salva e prova la connessione</button>
    <div class="row"><button class="btn ghost small" style="flex:1" data-act="sync">Sincronizza ora</button><button class="btn ghost small" style="flex:1" data-confirm="gh-download">Scarica da GitHub</button></div>
    <p class="hint">${meta.lastSync ? `Ultima sincronizzazione: ${esc(new Date(meta.lastSync).toLocaleString("it-IT"))}.` : "Mai sincronizzato."} ${store.isDirty() ? "Ci sono modifiche da inviare." : ""} "Scarica da GitHub" sostituisce i dati di questo telefono con quelli del repository.</p>
  </section>
  ${d ? `<section class="card stack"><h2>Atleta</h2>
    <label class="label" for="athlete">Nome sul logbook<input id="athlete" type="text" value="${esc(d.profile?.athlete || "")}" data-act="athlete"></label></section>
  <section class="card stack"><h2>Bilancieri</h2><p class="hint">Peso del solo bilanciere. Nei carichi segni sempre i dischi.</p>
    ${bars.map((b) => `<div class="settings-row"><input type="text" value="${esc(b.name)}" data-act="bar-name" data-id="${b.id}" aria-label="Nome bilanciere"><label class="field"><input inputmode="decimal" value="${esc(L.fmtNum(b.kg))}" data-act="bar-kg" data-id="${b.id}" aria-label="Peso ${esc(b.name)}" placeholder="?"><em>kg</em></label><button class="mini danger" data-confirm="delete-bar" data-id="${b.id}">Elimina</button></div>`).join("")}
    <button class="btn ghost small" data-act="add-bar">+ Aggiungi bilanciere</button></section>
  <section class="card stack"><h2>Catalogo esercizi</h2>
    <input type="search" data-act="catalog-search" value="${esc(q)}" placeholder="Cerca" aria-label="Cerca esercizio">
    <div>${exs.map((e) => `<div class="cat-row"><span><span class="dist">${esc(e.district)}</span> ${esc(e.name)}${e.usesBar ? ' <span class="hint">· bilanciere</span>' : ""}</span><button class="mini" data-act="edit-exercise" data-id="${e.id}">Modifica</button></div>`).join("") || `<p class="hint">Nessun esercizio trovato.</p>`}</div>
    <button class="btn ghost small" data-act="edit-exercise" data-id="">+ Nuovo esercizio</button></section>
  <section class="card stack"><h2>Cicli</h2>
    <ul class="list">${cycles.slice().reverse().map((c) => `<li><span>Ciclo ${c.number} · ${esc(L.fmtRange(c.startDate, L.cycleEnd(c)))}<br><span class="hint">${c.closed ? "chiuso" : "in corso"}</span></span>
      <span class="acts">${c.closed ? `<button class="mini" data-act="reopen-cycle" data-id="${c.id}">Riapri</button>` : `<button class="mini" data-confirm="close-cycle" data-id="${c.id}">Chiudi</button>`}</span></li>`).join("")}</ul>
    <label class="btn ghost" for="programFile">Importa nuova scheda del coach (.json)</label>
    <input id="programFile" type="file" accept=".json,application/json" data-act="import-program-file" class="vh">
    <p class="hint">Quando importi una scheda nuova, il ciclo in corso viene chiuso. Resta consultabile e modificabile.</p></section>` : ""}
  <section class="card stack"><h2>Backup</h2>
    ${d ? `<button class="btn ghost" data-act="export-json">Esporta tutti i dati (.json)</button>` : ""}
    <label class="btn ghost" for="dataFile">Importa file dati (.json)</label>
    <input id="dataFile" type="file" accept=".json,application/json" data-act="import-data-file" class="vh">
    <p class="hint">L'import unisce il file ai dati di questo telefono: per ogni elemento vince la versione più recente.</p></section>
  <p class="hint" style="text-align:center">Harden ${APP_VERSION} · ${TAGLINE}</p>`;
}

function openExerciseEditor(id) {
  const d = D();
  const e = id ? L.exerciseOf(d, id) : { id: "", name: "", district: "P", usesBar: false, defaultBarId: "" };
  const bars = store.live(d.bars);
  openModal(`<h2>${id ? "Modifica esercizio" : "Nuovo esercizio"}</h2>
    <label class="label" for="exName">Nome<input id="exName" type="text" value="${esc(e.name)}"></label>
    <div class="extras" style="margin-top:0">
      <label class="label" for="exDist">Distretto<select id="exDist">${L.DISTRICTS.map((x) => `<option ${x === e.district ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      <label class="label full" for="exSetup">Regolazioni<input id="exSetup" type="text" value="${esc(e.setup || "")}" placeholder="es. schienale tacca 3, sellino 4"></label>
      <label class="label" for="exBar">Bilanciere<select id="exBar"><option value="">Nessuno</option>${bars.map((b) => `<option value="${b.id}" ${e.usesBar && e.defaultBarId === b.id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}<option value="any" ${e.usesBar && !e.defaultBarId ? "selected" : ""}>Sì, da scegliere</option></select></label>
    </div>
    <div class="row">${id ? `<button class="btn ghost" style="color:var(--danger)" data-confirm="delete-exercise" data-id="${id}">Elimina</button>` : `<button class="btn ghost" data-act="close">Annulla</button>`}<button class="btn" data-act="save-exercise" data-id="${esc(id || "")}">Salva</button></div>`);
}

/* ================= Import / export ================= */
function readJsonFile(input) {
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
  store.mutate((d) => {
    const byName = new Map(store.live(d.exercises).map((e) => [L.norm(e.name), e]));
    const number = Math.max(0, ...store.live(d.cycles).map((c) => c.number)) + 1;
    for (const c of store.live(d.cycles)) if (!c.closed) { c.closed = true; c.closedAt = store.now(); c.updatedAt = store.now(); }
    const sheets = {};
    for (const [letter, list] of Object.entries(p.sheets)) {
      sheets[letter] = list.map((x, i) => {
        let ex = byName.get(L.norm(x.name));
        if (!ex) { ex = store.upsert(d, "exercises", { id: store.uid(), name: x.name, district: x.district, usesBar: !!x.usesBar }); byName.set(L.norm(x.name), ex); }
        return { id: `${letter}${i + 1}`, exerciseId: ex.id, district: x.district, rest: x.rest, superset: x.superset || null, tut: x.tut || "", video: x.video || "", description: x.description || "", exerciseNote: x.exerciseNote || "", progressionNote: x.progressionNote || "", week4Plus: !!x.week4Plus, blocks: x.blocks };
      });
    }
    store.upsert(d, "cycles", { id: store.uid(), number, startDate: startDate || p.startDate, weeks: p.weeks || 4, dayPlan: p.dayPlan || {}, closed: false, overrides: {}, sheets });
  });
}

async function exportJson() {
  const { deliverFile } = await import("./pdf.js");
  const bytes = new TextEncoder().encode(JSON.stringify(D(), null, 1));
  await deliverFile(bytes, `harden-data-${L.todayISO()}.json`, "application/json");
}

/* ================= Actions ================= */
const actions = {
  go: (el) => go(el.dataset.view),
  close: () => closeModal(),
  sync: () => runSync("chore: sync pending changes"),
  "open-session": (el) => go("workout", { sessionId: el.dataset.id }),
  start: (el) => startSession(el.dataset.sheet, +el.dataset.week),
  "past-session": () => {
    const c = cycle();
    openModal(`<h2>Sessione passata</h2>
      <label class="label" for="pastSheet">Scheda<select id="pastSheet">${L.sheetLetters(c).map((l) => `<option>${esc(l)}</option>`).join("")}</select></label>
      <label class="label" for="pastWeek">Settimana<select id="pastWeek">${Array.from({ length: c.weeks }, (_, i) => `<option>${i + 1}</option>`).join("")}</select></label>
      <label class="label" for="pastDate">Data<input id="pastDate" type="date" value="${L.todayISO()}"></label>
      <div class="row"><button class="btn ghost" data-act="close">Annulla</button><button class="btn" data-act="past-ok">Compila</button></div>`);
  },
  "past-ok": () => { const sh = $("#pastSheet").value, w = +$("#pastWeek").value, dt = $("#pastDate").value; closeModal(); startSession(sh, w, dt); },
  "edit-session-meta": () => {
    const s = sessionById(ui.sessionId), c = cycleOfSession(s);
    openModal(`<h2>Scheda ${esc(s.sheet)}</h2>
      <label class="label" for="metaWeek">Settimana<select id="metaWeek">${Array.from({ length: c.weeks }, (_, i) => `<option ${i + 1 === s.week ? "selected" : ""}>${i + 1}</option>`).join("")}</select></label>
      <label class="label" for="metaDate">Data<input id="metaDate" type="date" value="${s.date}"></label>
      <div class="row"><button class="btn ghost" data-act="close">Annulla</button><button class="btn" data-act="meta-ok">Salva</button></div>`);
  },
  "meta-ok": () => {
    const w = +$("#metaWeek").value, dt = $("#metaDate").value;
    store.mutate((d) => { const s = d.sessions.find((x) => x.id === ui.sessionId); s.week = w; s.date = dt || s.date; s.updatedAt = store.now(); });
    closeModal(); render();
  },
  check: (el) => onCheck(el),
  finish: () => finishSession(),
  "discard-session": () => {
    store.mutate((d) => store.softDelete(d, "sessions", ui.sessionId));
    closeModal(); go("home"); toast("Sessione eliminata");
  },
  rest: (el) => {
    const s = sessionById(ui.sessionId), slot = slotOf(s, el.dataset.slot);
    startTimer(slot.rest, L.exName(D(), L.resolveSlot(cycleOfSession(s), slot, s).exerciseId));
  },
  swap: (el) => openSubstitution(el.dataset.slot),
  "add-set": (el) => {
    document.activeElement?.blur?.();
    store.mutate((d) => { const sess = d.sessions.find((x) => x.id === ui.sessionId); const e = ensureEntry(d, sess, slotOf(sess, el.dataset.slot)); e.extra = (e.extra || 0) + 1; });
    render();
  },
  "remove-set": (el) => {
    document.activeElement?.blur?.();
    store.mutate((d) => {
      const sess = d.sessions.find((x) => x.id === ui.sessionId), slot = slotOf(sess, el.dataset.slot);
      const e = ensureEntry(d, sess, slot);
      if (!e.extra) return;
      const n = L.targetsFor(L.resolveSlot(d.cycles.find((c) => c.id === sess.cycleId), slot, sess).blocks, sess.week).length;
      e.sets.splice(n + e.extra - 1, 1);
      e.extra -= 1;
    });
    render();
  },
  restore: (el) => restoreOriginal(el.dataset.slot),
  history: (el) => openHistory(el.dataset.ex),
  "sub-pick": (el) => { subState.pick = el.dataset.id; renderSubList(); },
  "sub-new-toggle": () => { const f = $("#subNew"); f.hidden = !f.hidden; $("#subNewName").value = $("#subSearch").value; },
  "sub-new-add": () => {
    const name = $("#subNewName").value.trim();
    if (!name) { toast("Scrivi il nome dell'esercizio"); return; }
    const existing = store.live(D().exercises).find((e) => L.norm(e.name) === L.norm(name));
    const id = existing?.id || store.uid();
    if (!existing) store.mutate((d) => store.upsert(d, "exercises", { id, name, district: $("#subNewDist").value, usesBar: $("#subNewBar").value === "1" }));
    subState.pick = id; $("#subSearch").value = name; $("#subNew").hidden = true; renderSubList();
    toast(existing ? "Esercizio già nel catalogo: selezionato" : "Aggiunto al catalogo");
  },
  "sub-mode": (el) => { subState.mode = el.dataset.mode; $$("#subMode button").forEach((b) => b.classList.toggle("sel", b === el)); },
  "sub-schema-toggle": () => {
    const box = $("#subSchema"), open = box.hidden;
    box.hidden = !open; subState.schemaMode = open ? "uniform" : null;
    $("#subSchemaToggle").textContent = open ? "Usa lo schema dell'originale" : "Modifica schema";
    $$("[data-act=sub-schema]").forEach((b) => b.classList.toggle("sel", b.dataset.schema === "uniform"));
    $("#subUniform").hidden = false; $("#subWeekly").hidden = true;
  },
  "sub-schema": (el) => {
    subState.schemaMode = el.dataset.schema;
    $$("[data-act=sub-schema]").forEach((b) => b.classList.toggle("sel", b === el));
    $("#subUniform").hidden = el.dataset.schema !== "uniform"; $("#subWeekly").hidden = el.dataset.schema !== "weekly";
  },
  "sub-confirm": () => confirmSubstitution(),
  "log-sheet": (el) => { ui.logSheet = el.dataset.sheet; render(); },
  "export-logbook": async (el) => {
    el.disabled = true; el.textContent = "Preparo il PDF…";
    try {
      const pdf = await import("./pdf.js");
      const c = cycle();
      const bytes = await pdf.logbookPdf(D(), c);
      await pdf.deliverFile(bytes, `Logbook ciclo ${c.number} - ${L.todayISO()}.pdf`, "application/pdf");
    } catch (e) { toast(e.message, { error: true }); }
    el.disabled = false; el.textContent = "Esporta PDF";
  },
  "export-report": async (el) => {
    el.disabled = true; el.textContent = "Preparo il PDF…";
    try {
      const pdf = await import("./pdf.js");
      const ids = L.cyclesSorted(D()).filter((c) => ui.rep.cycles.has(c.id)).map((c) => c.id);
      const bytes = await pdf.reportPdf(D(), ids, ui.rep.sections);
      await pdf.deliverFile(bytes, `Report Harden - ${L.todayISO()}.pdf`, "application/pdf");
    } catch (e) { toast(e.message, { error: true }); }
    el.disabled = false; el.textContent = "Esporta PDF";
  },
  "save-weight": () => {
    const kg = L.parseNum($("#wVal").value), date = $("#wDate").value;
    if (kg == null || !date) { toast("Inserisci data e peso in kg"); return; }
    const editId = ui.weightEdit;
    store.mutate((d) => {
      const sameDay = store.live(d.weights).find((w) => w.date === date && w.id !== editId);
      if (editId && sameDay) store.softDelete(d, "weights", sameDay.id);
      store.upsert(d, "weights", { id: editId || sameDay?.id || store.uid(), date, kg, scale: ui.weightScale ?? D().weights.find((w) => w.id === editId)?.scale ?? "home" });
    });
    ui.weightEdit = null; ui.weightScale = null;
    render(); toast(editId ? "Peso aggiornato" : "Peso salvato"); runSync(`feat: log weight (${date})`, { quiet: true });
  },
  "edit-weight": (el) => { ui.weightEdit = el.dataset.id; ui.weightScale = null; render(); $("#wVal")?.focus(); },
  "weight-cancel": () => { ui.weightEdit = null; ui.weightScale = null; render(); },
  scale: (el) => { ui.weightScale = el.dataset.v; $$(".scale-seg button").forEach((b) => { const on = b === el; b.classList.toggle("sel", on); b.classList.toggle("alt", on && b.dataset.v === "other"); }); },
  "weights-all": () => { ui.weightShowAll = !ui.weightShowAll; render(); },
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
    const ms = store.live(D().measurements).sort((a, b) => (a.date > b.date ? 1 : -1));
    ui.measureIdx = ms.findIndex((m) => m.date === date);
    render(); toast(editId ? "Misurazione aggiornata" : "Misure salvate");
    runSync(`feat: log measurements (${date})`, { quiet: true });
  },
  "edit-measure": (el) => { ui.measureEdit = el.dataset.id; render(); $("#mDate")?.scrollIntoView({ block: "center" }); },
  "measure-cancel": () => { ui.measureEdit = null; render(); },
  "measure-nav": (el) => { ui.measureIdx += +el.dataset.dir; render(); },
  "measure-trend": (el) => openMeasureTrend(el.dataset.mk),
  "measure-jump": (el) => { ui.measureIdx = +el.dataset.idx; render(); $(".nav-row")?.scrollIntoView({ block: "center" }); },
  "chart-g": (el) => { ui.charts[el.dataset.chart] = { g: el.dataset.g, off: 0 }; rerenderChart(el.dataset.chart); },
  "chart-pan": (el) => { const st = ui.charts[el.dataset.chart]; st.off = Math.max(0, st.off + +el.dataset.dir); rerenderChart(el.dataset.chart); },
  "export-measures": async (el) => {
    const label = el.textContent; el.disabled = true; el.textContent = "Preparo il PDF…";
    try {
      const pdf = await import("./pdf.js");
      const bytes = await pdf.measuresPdf(D(), el.dataset.mode);
      await pdf.deliverFile(bytes, `Harden misure ${el.dataset.mode === "all" ? "storico" : "ultime"} - ${L.todayISO()}.pdf`, "application/pdf");
    } catch (e) { toast(e.message, { error: true }); }
    el.disabled = false; el.textContent = label;
  },
  "gh-save": async () => {
    gh.setConfig({ owner: $("#ghOwner").value.trim(), repo: $("#ghRepo").value.trim(), branch: $("#ghBranch").value.trim() || "main", path: $("#ghPath").value.trim() || "harden-data.json", expiry: $("#ghExpiry").value, device: $("#ghDevice").value.trim() });
    gh.setToken($("#ghToken").value.trim());
    if (!gh.isConfigured()) { toast("Compila utente, repository e token"); renderHeader(); return; }
    try {
      const r = await gh.testConnection();
      if (!r.private) toast("Attenzione: il repository è pubblico. I tuoi dati sarebbero visibili a tutti.", { error: true, ms: 6000 });
      else if (!store.hasData() && r.fileExists) { await gh.downloadReplace(); toast("Dati scaricati da GitHub"); go("home"); return; }
      else toast(r.fileExists ? "Connessione riuscita" : "Connessione riuscita: il file verrà creato alla prima sincronizzazione");
    } catch (e) { toast(e.message, { error: true, ms: 5000 }); }
    render();
  },
  "add-bar": () => { store.mutate((d) => store.upsert(d, "bars", { id: store.uid(), name: "Nuovo bilanciere", kg: null })); render(); },
  "edit-exercise": (el) => openExerciseEditor(el.dataset.id),
  "save-exercise": (el) => {
    const name = $("#exName").value.trim();
    if (!name) { toast("Scrivi il nome dell'esercizio"); return; }
    const barVal = $("#exBar").value;
    const id = el.dataset.id || store.uid();
    store.mutate((d) => {
      const prev = L.exerciseOf(d, id) || {};
      store.upsert(d, "exercises", { ...prev, id, name, district: $("#exDist").value, usesBar: !!barVal, defaultBarId: barVal && barVal !== "any" ? barVal : "", setup: $("#exSetup").value.trim() });
    });
    closeModal(); render(); toast("Esercizio salvato");
  },
  "reopen-cycle": (el) => { store.mutate((d) => { const c = d.cycles.find((x) => x.id === el.dataset.id); c.closed = false; c.updatedAt = store.now(); }); render(); },
  "export-json": () => exportJson().catch((e) => toast(e.message, { error: true })),
};

// Two-tap confirmations: first tap arms the button, second tap runs the action.
const confirmed = {
  "delete-session": (id) => { store.mutate((d) => store.softDelete(d, "sessions", id)); render(); toast("Sessione eliminata"); runSync("fix: remove session", { quiet: true }); },
  "delete-weight": (id) => { store.mutate((d) => store.softDelete(d, "weights", id)); if (ui.weightEdit === id) ui.weightEdit = null; render(); toast("Peso eliminato"); runSync("fix: remove weight entry", { quiet: true }); },
  "delete-measure": (id) => { store.mutate((d) => store.softDelete(d, "measurements", id)); if (ui.measureEdit === id) ui.measureEdit = null; ui.measureIdx = null; render(); toast("Misurazione eliminata"); runSync("fix: remove measurement", { quiet: true }); },
  "delete-bar": (id) => { store.mutate((d) => store.softDelete(d, "bars", id)); render(); },
  "delete-exercise": (id) => { store.mutate((d) => store.softDelete(d, "exercises", id)); closeModal(); render(); toast("Esercizio rimosso dal catalogo. Lo storico resta."); },
  "close-cycle": (id) => { store.mutate((d) => { const c = d.cycles.find((x) => x.id === id); c.closed = true; c.closedAt = store.now(); c.updatedAt = store.now(); }); render(); toast("Ciclo chiuso"); },
  "gh-download": async () => {
    try { await gh.downloadReplace(); toast("Dati scaricati da GitHub"); ui.cycleId = null; go("home"); }
    catch (e) { toast(e.message, { error: true, ms: 5000 }); }
  },
};

/* ================= Event wiring ================= */
document.addEventListener("click", (e) => {
  if (e.target.matches("[data-overlay]")) { closeModal(); return; }
  const conf = e.target.closest("[data-confirm]");
  if (conf) {
    if (!conf.classList.contains("armed")) {
      $$(".armed").forEach((x) => { x.classList.remove("armed"); x.textContent = x.dataset.label || "Elimina"; });
      conf.dataset.label = conf.textContent;
      conf.classList.add("armed"); conf.textContent = "Conferma";
      return;
    }
    conf.classList.remove("armed");
    confirmed[conf.dataset.confirm]?.(conf.dataset.id);
    return;
  }
  if (!e.target.closest(".armed")) $$(".armed").forEach((x) => { x.classList.remove("armed"); x.textContent = x.dataset.label || "Elimina"; });
  const tab = e.target.closest(".tabs [data-view]");
  if (tab) { go(tab.dataset.view); return; }
  const a = e.target.closest("[data-act]");
  if (a && actions[a.dataset.act] && !/^(INPUT|SELECT)$/.test(a.tagName)) { actions[a.dataset.act](a, e); return; }
  const mrow = e.target.closest(".mrow");
  if (mrow && !e.target.matches("input")) { setMeasure(mrow.dataset.mk); $(`#m-${mrow.dataset.mk}`)?.focus(); }
});

function setMeasure(k) {
  ui.measureActive = k;
  $$(".mrow").forEach((r) => r.classList.toggle("on", r.dataset.mk === k));
  const svg = $(".body-fig svg");
  if (svg) svg.outerHTML = bodySvg();
}

document.addEventListener("focusin", (e) => { if (e.target.matches("input[data-mk]")) setMeasure(e.target.dataset.mk); });
document.addEventListener("focusout", () => { setTimeout(() => { if (ui.pendingRender && !document.activeElement?.closest?.("#view input")) render(); }, 50); });

document.addEventListener("input", (e) => {
  if (e.target.dataset.act === "sub-search") renderSubList();
  if (e.target.dataset.act === "catalog-search") {
    ui.catalogQuery = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const inp = $('[data-act="catalog-search"]'); inp?.focus(); inp?.setSelectionRange(pos, pos);
  }
  if (e.target.matches('.set [data-f="load"]')) updateBarTotal(e.target.closest(".set").dataset.slot);
});

document.addEventListener("change", async (e) => {
  const t = e.target;
  if (t.matches(".set input")) { onSetInput(t.closest(".set")); return; }
  const act = t.dataset.act;
  if (act === "cycle") { ui.cycleId = t.value; render(); return; }
  if (act === "bar") {
    const s = sessionById(ui.sessionId);
    store.mutate((d) => { const sess = d.sessions.find((x) => x.id === s.id); ensureEntry(d, sess, slotOf(sess, t.dataset.slot)).barId = t.value; });
    updateBarTotal(t.dataset.slot); return;
  }
  if (act === "setup") {
    store.mutate((d) => { const ex = L.exerciseOf(d, t.dataset.ex); if (ex) { ex.setup = t.value.trim(); ex.updatedAt = store.now(); } });
    toast("Regolazioni salvate per le prossime volte");
    return;
  }
  if (act === "note") {
    const s = sessionById(ui.sessionId);
    store.mutate((d) => { const sess = d.sessions.find((x) => x.id === s.id); ensureEntry(d, sess, slotOf(sess, t.dataset.slot)).note = t.value.trim(); });
    return;
  }
  if (act === "rep-cycle") { t.checked ? ui.rep.cycles.add(t.value) : ui.rep.cycles.delete(t.value); if (!ui.rep.cycles.size) { ui.rep.cycles.add(t.value); toast("Serve almeno un ciclo"); } render(); return; }
  if (act === "rep-section") { t.checked ? ui.rep.sections.add(t.value) : ui.rep.sections.delete(t.value); render(); return; }
  if (act === "rep-ex") { ui.rep.ex = t.value; render(); return; }
  if (act === "athlete") { store.mutate((d) => { d.profile = { athlete: t.value.trim(), updatedAt: store.now() }; }); return; }
  if (act === "bar-name" || act === "bar-kg") {
    store.mutate((d) => { const b = d.bars.find((x) => x.id === t.dataset.id); if (act === "bar-name") b.name = t.value.trim() || b.name; else b.kg = L.parseNum(t.value); b.updatedAt = store.now(); });
    return;
  }
  if (act === "import-data-file") {
    try {
      const incoming = await readJsonFile(t);
      if (incoming.type === "gymlog-program") throw new Error("Questa è una scheda: importala dalla sezione Cicli.");
      if (!Array.isArray(incoming.cycles)) throw new Error("Questo file non contiene dati di Harden.");
      store.replace(store.hasData() ? store.merge(D(), incoming) : incoming, { dirty: true });
      ui.cycleId = null; toast("Dati importati"); go("home");
      runSync("feat: import data backup", { quiet: true });
    } catch (err) { toast(err.message, { error: true }); }
    t.value = "";
    return;
  }
  if (act === "import-program-file") {
    try {
      const p = await readJsonFile(t);
      openModal(`<h2>Nuova scheda</h2><p class="hint" style="font-size:14px">Il ciclo in corso verrà chiuso e ne inizierà uno nuovo con questa scheda.</p>
        <label class="label" for="progStart">Data di inizio<input id="progStart" type="date" value="${esc(p.startDate || L.todayISO())}"></label>
        <div class="row"><button class="btn ghost" data-act="close">Annulla</button><button class="btn" id="progOk">Importa</button></div>`);
      $("#progOk").onclick = () => {
        try { importProgram(p, $("#progStart").value); closeModal(); ui.cycleId = null; go("home"); toast("Nuova scheda importata"); runSync("feat: import new cycle program", { quiet: true }); }
        catch (err) { toast(err.message, { error: true }); }
      };
    } catch (err) { toast(err.message, { error: true }); }
    t.value = "";
  }
});

/* ================= Screen wake lock while training ================= */
let lock = null;
async function wakeLock(on) {
  try {
    if (on && !lock && "wakeLock" in navigator && document.visibilityState === "visible") {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => { lock = null; });
    } else if (!on && lock) { await lock.release(); lock = null; }
  } catch { lock = null; }
}

/* ================= Boot ================= */
store.onChange((ev) => {
  if (ev.type === "storage-error") toast("Memoria del telefono piena o bloccata: i dati non sono stati salvati.", { error: true, ms: 6000 });
  if (ev.type === "replace") render();
  else renderHeader();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    drawTimer();
    if (ui.view === "workout") wakeLock(true);
    if (gh.isConfigured() && navigator.onLine) runSync("chore: sync pending changes", { quiet: true });
  } else if (store.isDirty() && gh.isConfigured() && navigator.onLine) {
    runSync("chore: sync pending changes", { quiet: true });
  }
});
window.addEventListener("online", () => { if (store.isDirty()) runSync("chore: sync pending changes", { quiet: true }); else renderHeader(); });
window.addEventListener("offline", renderHeader);

$("#tPlus").addEventListener("click", () => { const t = timerState(); if (!t) return; t.endAt = Math.max(t.endAt, Date.now()) + 15000; t.total += 15; beeped = false; saveTimer(t); drawTimer(); });
$("#tMinus").addEventListener("click", () => { const t = timerState(); if (!t) return; t.endAt = Math.max(Date.now(), t.endAt - 15000); saveTimer(t); drawTimer(); });
$("#tStop").addEventListener("click", () => { saveTimer(null); drawTimer(); });

store.load();
navigator.storage?.persist?.().catch(() => {});
const open = store.get() && L.openSession(store.get());
if (open) { ui.view = "workout"; ui.sessionId = open.id; }
render();
drawTimer();
if (gh.isConfigured() && navigator.onLine) runSync("chore: sync pending changes", { quiet: true });

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker not registered", e));
}

// Exposed for debugging from the console only.
window.gymlog = { store, gh, L };
