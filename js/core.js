// Shared UI state and helpers. View modules register their handlers in the registries below;
// app.js owns rendering and wires the hooks.
import * as store from "./data.js";
import * as gh from "./github.js";
import * as L from "./logic.js";
import * as pdf from "./pdf.js";

export const APP_VERSION = "2.5.0";
export const TAGLINE = "every set, on record.";
export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const D = () => store.get();

export const ui = {
  view: "home",
  back: "home",
  cycleId: null,
  sessionId: null,
  sheet: null, // sheet shown in Scheda and Logbook
  week: null, // week shown in Scheda › Programma
  progTab: "program",
  rep: { off: new Set() }, // report: cycles switched off
  mTab: "weight", // measures sub-tab: weight | circ
  circMeasure: "waist",
  measureActive: "neck",
  measureEdit: null,
  weightEdit: null,
  weightScale: "home",
  charts: {},
  catalogQuery: "",
  syncState: "idle", // idle | running | error
  syncError: "",
  pendingRender: false,
};

/* Registries filled by the view modules: data-act click handlers, two-tap confirmations, change and input handlers. */
export const actions = {};
export const confirmed = {};
export const changes = {};
export const inputs = {};

/* Rendering hooks, set by app.js (avoids import cycles with the router). */
export const hooks = { render: () => {}, renderHeader: () => {}, go: (_view, _opts) => {} };
export const render = () => hooks.render();
export const renderHeader = () => hooks.renderHeader();
export const go = (view, opts) => hooks.go(view, opts);

/* ---------- Data helpers ---------- */
export const cycle = () => D()?.cycles.find((c) => c.id === ui.cycleId && !c.deleted) || L.currentCycle(D());
export const sessionById = (id) => D()?.sessions.find((s) => s.id === id && !s.deleted);
export const cycleOfSession = (s) => D().cycles.find((c) => c.id === s.cycleId);
export const byDate = (a, b) => (a.date > b.date ? 1 : -1);
export const lastDate = (list) => store.live(list).reduce((a, x) => (x.date > a ? x.date : a), "");

/* ---------- Toasts and bottom sheets ---------- */
export function toast(msg, { error = false, ms = 2800 } = {}) {
  const t = document.createElement("div");
  t.className = "toast" + (error ? " err" : "");
  t.setAttribute("role", "status");
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), ms);
}

/** Toast with an Undo button; `commit` runs only if the user lets it expire. */
export function undoToast(msg, undo, commit) {
  $$(".toast.undo").forEach((t) => t.remove());
  const t = document.createElement("div");
  t.className = "toast undo";
  t.setAttribute("role", "status");
  t.innerHTML = `<span>${esc(msg)}</span><button type="button">Annulla</button>`;
  document.body.append(t);
  let done = false;
  const timer = setTimeout(() => { if (!done) { done = true; t.remove(); commit?.(); } }, 6000);
  t.querySelector("button").addEventListener("click", () => { if (done) return; done = true; clearTimeout(timer); t.remove(); undo(); });
}

export function deleteWithUndo(collection, id, msg, commitMessage) {
  store.mutate((d) => store.softDelete(d, collection, id));
  closeModal(); render();
  undoToast(msg, () => {
    store.mutate((d) => { const r = d[collection].find((x) => x.id === id); if (r) { r.deleted = false; r.updatedAt = store.now(); } });
    render(); toast("Ripristinato");
  }, commitMessage ? () => runSync(commitMessage, { quiet: true }) : null);
}

export function openModal(html) {
  const host = $("#modalHost");
  host.innerHTML = `<div class="overlay" data-overlay><div class="modal" role="dialog" aria-modal="true"><div class="modal-inner stack">${html}</div></div></div>`;
  return host.firstElementChild;
}
/** Closing a sheet that changed data behind it (program editor, catalog, equipment) re-renders the page. */
export function closeModal() {
  const dirtyView = !!$("#modalHost [data-rerender]");
  $("#modalHost").innerHTML = "";
  if (dirtyView) render();
}

/** Menu sheet: a title and a list of [label, data-act, extra attributes] buttons. */
export function openMenu(title, items) {
  openModal(`<h2>${esc(title)}</h2><div class="menu">${items.filter(Boolean).map(([label, act, attrs = ""]) => `<button class="menu-item" data-act="${act}" ${attrs}>${label}</button>`).join("")}</div>
    <button class="btn ghost" data-act="close">Chiudi</button>`);
}

/* ---------- Exports: same card and same behaviour everywhere ---------- */
/** Export card: title, one-line description and the "Esporta PDF" button bound to `act`. */
export const exportCard = (title, hint, act) => `<section class="card row"><div><div class="label">${esc(title)}</div><span class="hint">${esc(hint)}</span></div><button class="btn small nowrap" data-act="${act}">Esporta PDF</button></section>`;
/** Build a PDF and hand it to the share sheet, showing progress on the button. */
export async function runExport(el, build) {
  const label = el.textContent;
  el.disabled = true; el.textContent = "Preparo…";
  try {
    const { bytes, name } = await build(pdf);
    await pdf.deliverFile(bytes, name, "application/pdf");
  } catch (e) { toast(e.message, { error: true }); }
  el.disabled = false; el.textContent = label;
}

/* ---------- Sync ---------- */
export async function runSync(message, { quiet = false } = {}) {
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

/** Shown only when something needs attention: not connected, pending, offline, error. */
export function syncBadge() {
  if (!gh.isConfigured()) return `<button class="sync" data-act="go" data-view="settings">GitHub non collegato</button>`;
  if (ui.syncState === "error") return `<button class="sync err" data-act="sync" title="${esc(ui.syncError)}">Errore sync</button>`;
  if (ui.syncState === "running") return store.isDirty() ? `<button class="sync">Sincronizzo…</button>` : "";
  if (store.isDirty()) return `<button class="sync pending" data-act="sync">${navigator.onLine ? "Da sincronizzare" : "Offline · in coda"}</button>`;
  return "";
}

Object.assign(actions, {
  go: (el) => go(el.dataset.view),
  close: () => closeModal(),
  sync: () => runSync("chore: sync pending changes"),
});
