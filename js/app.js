// Harden — router and event wiring. Views render HTML strings; events are delegated on the document
// and dispatched to the handlers each view module registers in core.js.
import * as store from "./data.js";
import * as gh from "./github.js";
import * as L from "./logic.js";
import { $, $$, esc, D, ui, actions, confirmed, changes, inputs, hooks, TAGLINE, openModal, closeModal, sessionById, runSync, syncBadge, toast } from "./core.js";
import { drawTimer, initTimer, wakeLock } from "./timer.js";
import { viewDashboard, measureDue } from "./views/dashboard.js";
import { planStatus } from "./views/payments.js";
import { viewWorkout, onSetInput, updateBarTotal, refreshBarTotals, finishSession } from "./views/session.js";
import { viewProgram } from "./views/program.js";
import { viewMeasures, setMeasure } from "./views/measures.js";
import { viewReport } from "./views/report.js";
import { viewLogbook } from "./views/logbook.js";
import { viewSettings } from "./views/settings.js";

const VIEWS = { home: viewDashboard, workout: viewWorkout, program: viewProgram, measures: viewMeasures, report: viewReport, logbook: viewLogbook, settings: viewSettings };
const TITLES = { home: "Harden", program: "Scheda", measures: "Misure", report: "Report", logbook: "Logbook", settings: "Impostazioni" };

/* ================= Rendering ================= */
function headerSub() {
  const c = D() && store.hasData() && L.currentCycle(D());
  if (ui.view !== "home" || !c) return "";
  if (c.closed) return `Ciclo ${c.number} · chiuso`;
  const day = L.daysBetween(c.startDate, L.todayISO()) + 1, total = c.weeks * 7;
  return day < 1 ? `Ciclo ${c.number} · inizia ${L.fmtDate(c.startDate, { weekday: false })}` : `Ciclo ${c.number} · giorno ${Math.min(day, total)} di ${total}`;
}

function renderHeader() {
  const d = D(), badge = d && ui.view !== "settings" ? syncBadge() : "";
  const s = ui.view === "workout" && sessionById(ui.sessionId);
  const sub = headerSub();
  $("#appHeader").innerHTML = `<div class="wrap"><div class="row">${s
    ? `<div class="row" style="gap:8px;justify-content:flex-start;min-width:0"><button class="icon-btn" data-act="workout-back" aria-label="Indietro">‹</button><h1>Scheda ${esc(s.sheet)}</h1></div>
       <div class="row" style="gap:6px">${badge}<button class="icon-btn" data-act="session-menu" aria-label="Altro sulla sessione">⋯</button></div>`
    : `<div><h1>${esc(TITLES[ui.view] || "Harden")}</h1>${sub ? `<div class="hint">${esc(sub)}</div>` : ""}</div>
       <div class="row" style="gap:6px">${badge}${ui.view === "settings" ? "" : `<button class="icon-btn ${d && planStatus(d)?.late ? "dot" : ""}" data-act="go" data-view="settings" aria-label="Impostazioni">⚙︎</button>`}</div>`}</div></div>`;
  document.body.classList.toggle("full", ui.view === "workout");
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
  const d = D();
  // A deleted or missing session sends the user back to where they came from.
  if (ui.view === "workout" && d && !sessionById(ui.sessionId) && !L.openSession(d)) ui.view = ui.back || "home";
  renderHeader();
  const v = $("#view");
  if (!store.hasData() && ui.view !== "settings") v.innerHTML = viewWelcome();
  else v.innerHTML = (VIEWS[ui.view] || viewDashboard)(d);
  if (ui.view === "workout") refreshBarTotals();
  wakeLock(ui.view === "workout");
}

function go(view, opts = {}) {
  Object.assign(ui, opts, { view });
  render();
  window.scrollTo(0, 0);
}
Object.assign(hooks, { render, renderHeader, go });

function viewWelcome() {
  return `<section class="card stack">
    <h2>Benvenuto in Harden</h2><p class="tagline" style="margin:0">${TAGLINE}</p>
    <p class="hint" style="font-size:14px">Per iniziare carica i tuoi dati. Se il file <b>harden-data.json</b> è già nel tuo repository privato, collega GitHub e scaricalo. Altrimenti importa il file direttamente dal telefono.</p>
    <button class="btn" data-act="go" data-view="settings">Collega GitHub</button>
    <label class="btn ghost" for="welcomeFile">Importa file dati (.json)</label>
    <input id="welcomeFile" type="file" accept=".json,application/json" data-act="import-data-file" class="vh">
  </section>`;
}

Object.assign(actions, {
  "stale-resume": (el) => { closeModal(); go("workout", { sessionId: el.dataset.id, back: "home" }); },
  "stale-finish": (el) => { closeModal(); ui.sessionId = el.dataset.id; finishSession(); },
});

/* ================= Event wiring ================= */
const disarm = () => $$(".armed").forEach((x) => { x.classList.remove("armed"); x.textContent = x.dataset.label || "Elimina"; });

document.addEventListener("click", (e) => {
  if (e.target.matches("[data-overlay]")) { closeModal(); return; }
  const conf = e.target.closest("[data-confirm]");
  // Deletions run at once and offer Undo; other confirmations need a second tap.
  if (conf && conf.dataset.confirm.startsWith("delete-")) { confirmed[conf.dataset.confirm]?.(conf.dataset.id); return; }
  if (conf) {
    if (!conf.classList.contains("armed")) {
      disarm();
      conf.dataset.label = conf.textContent;
      conf.classList.add("armed"); conf.textContent = "Conferma";
      return;
    }
    conf.classList.remove("armed");
    confirmed[conf.dataset.confirm]?.(conf.dataset.id);
    return;
  }
  if (!e.target.closest(".armed")) disarm();
  const tab = e.target.closest(".tabs [data-view]");
  if (tab) { go(tab.dataset.view); return; }
  const a = e.target.closest("[data-act]");
  if (a && actions[a.dataset.act] && !/^(INPUT|SELECT)$/.test(a.tagName)) { actions[a.dataset.act](a, e); return; }
  const mrow = e.target.closest(".mrow");
  if (mrow && !e.target.matches("input")) { setMeasure(mrow.dataset.mk); $(`#m-${mrow.dataset.mk}`)?.focus(); }
});

document.addEventListener("focusin", (e) => { if (e.target.matches("input[data-mk]")) setMeasure(e.target.dataset.mk); });
document.addEventListener("focusout", () => { setTimeout(() => { if (ui.pendingRender && !document.activeElement?.closest?.("#view input")) render(); }, 50); });

let typingTimer = null;
document.addEventListener("input", (e) => {
  const t = e.target;
  if (t.matches('.set [data-f="load"]')) updateBarTotal(t.closest(".set").dataset.slot);
  if (t.matches(".set input")) {
    const row = t.closest(".set");
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => onSetInput(row), 400);
    return;
  }
  inputs[t.dataset.act]?.(t);
});

document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.matches(".set input")) { clearTimeout(typingTimer); onSetInput(t.closest(".set")); return; }
  changes[t.dataset.act]?.(t);
});

/** Save the field being edited right away (used before the app goes to background). */
function flushTyping() {
  clearTimeout(typingTimer);
  const el = document.activeElement;
  if (el?.matches?.(".set input") && sessionById(ui.sessionId)) onSetInput(el.closest(".set"));
}

/* ================= Boot ================= */
store.onChange((ev) => {
  if (ev.type === "storage-error") toast("Memoria del telefono piena o bloccata: i dati non sono stati salvati.", { error: true, ms: 6000 });
  if (ev.type === "replace") render();
  else renderHeader();
});

const syncIfNeeded = () => { if (gh.isConfigured() && navigator.onLine) runSync("chore: sync pending changes", { quiet: true }); };
window.addEventListener("pagehide", flushTyping);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") { flushTyping(); if (store.isDirty()) syncIfNeeded(); return; }
  drawTimer();
  if (ui.view === "workout") wakeLock(true);
  syncIfNeeded();
});
window.addEventListener("online", () => { if (store.isDirty()) runSync("chore: sync pending changes", { quiet: true }); else renderHeader(); });
window.addEventListener("offline", renderHeader);

store.load();
navigator.storage?.persist?.().catch(() => {});
const open = store.get() && L.openSession(store.get());
const staleOpen = open && open.date < L.todayISO();
if (open && !staleOpen) Object.assign(ui, { view: "workout", sessionId: open.id, back: "home" });
render();
if (staleOpen) {
  openModal(`<h2>Sessione ancora aperta</h2>
    <p class="hint" style="font-size:14px">La scheda ${esc(open.sheet)} della settimana ${open.week}, iniziata ${esc(L.fmtDate(open.date))}, non è stata terminata.</p>
    <button class="btn" data-act="stale-finish" data-id="${open.id}">Termina e salva</button>
    <button class="btn ghost" data-act="stale-resume" data-id="${open.id}">Riprendi la sessione</button>`);
}
initTimer();
syncIfNeeded();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch((e) => console.warn("Service worker not registered", e));
}

// Exposed for debugging from the console only.
window.gymlog = { store, gh, L };
