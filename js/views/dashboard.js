// Home: what to do now (reminders, next session) and a few numbers at a glance. Everything else lives in its tab.
import * as store from "../data.js";
import * as gh from "../github.js";
import * as L from "../logic.js";
import { esc, D, ui, actions, go, cycle, byDate, lastDate } from "../core.js";
import { sparkline } from "../charts.js";
import { sessionRow, sessionMinutes, startSession, openSessionView } from "./session.js";
import { openWeightForm, openMeasureForm } from "./measures.js";
import { planStatus } from "./payments.js";

/** Weight after 3 days, circumferences every 7 days, token expiry within 14 days. */
export function reminders(d) {
  const out = [];
  const lastW = lastDate(d.weights), lastM = lastDate(d.measurements);
  const dw = L.daysSince(lastW), dm = L.daysSince(lastM);
  const ago = (n, last) => (last ? `${n} gg fa` : "mai");
  if (dw >= 3) out.push({ icon: "⚖︎", text: "Peso", small: ago(dw, lastW), act: "go-weight" });
  if (dm >= 7) out.push({ icon: "📏", text: "Circonferenze", small: ago(dm, lastM), act: "go-circ" });
  const pay = planStatus(d);
  if (pay?.late) out.push({ icon: "💶", text: `Rata ${pay.next} coaching`, small: `in ritardo di ${pay.late} gg`, act: "go-settings", warn: true });
  const exp = gh.getConfig().expiry;
  if (exp && gh.isConfigured()) {
    const left = -L.daysSince(exp);
    if (left < 0) out.push({ icon: "🔑", text: "Token scaduto", small: "sync ferma", act: "go-settings", warn: true });
    else if (left <= 14) out.push({ icon: "🔑", text: "Token", small: `scade tra ${left} gg`, act: "go-settings", warn: true });
  }
  return out;
}
export const measureDue = (d) => L.daysSince(lastDate(d.weights)) >= 3 || L.daysSince(lastDate(d.measurements)) >= 7;

/** Personal bests in chronological order (a set heavier than every earlier one on that exercise), newest first. */
function recentRecords(d, n = 3) {
  const out = [];
  for (const ex of store.live(d.exercises)) {
    let best = null;
    for (const h of L.historyFor(d, ex.id).reverse()) {
      const top = L.bestSet(L.countedSets(h));
      if (top?.load == null) continue;
      if (best != null && top.load > best) out.push({ name: ex.name, load: top.load, prev: best, date: h.session.date });
      best = Math.max(best ?? -Infinity, top.load);
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, n);
}

export function viewDashboard(d) {
  const c = cycle();
  const chips = reminders(d).map((r) => `<button class="rchip ${r.warn ? "warn" : ""}" data-act="${r.act}">${r.icon} ${esc(r.text)} <small>${esc(r.small)}</small></button>`).join("");
  if (!c) return `${chips ? `<div class="rchips">${chips}</div>` : ""}<p class="empty">Nessun ciclo. Importa la scheda del coach dal tab Scheda.</p>`;
  const letters = L.sheetLetters(c);
  const done = L.sessionsOf(d, c.id).filter((s) => s.finishedAt || L.sessionHasWork(s));
  return [
    chips && `<div class="rchips">${chips}</div>`,
    nowCard(d, c, letters),
    kpis(d, c, letters, done),
    records(d),
    done.length && `<section class="card stack"><div class="row"><div class="label">Ultime sessioni</div><button class="mini" data-act="all-sessions">Tutte ›</button></div>
      <ul class="list">${done.slice(-2).reverse().map((s) => sessionRow(s)).join("")}</ul></section>`,
  ].filter(Boolean).join("");
}

/** Session in progress, otherwise the suggested next sheet with A–D picks. */
function nowCard(d, c, letters) {
  const open = L.openSession(d);
  if (open) {
    const oc = d.cycles.find((x) => x.id === open.cycleId);
    const slots = oc.sheets[open.sheet] || [];
    const n = slots.filter((sl) => L.doneSets(open.entries?.[sl.id]).length).length;
    return `<section class="card next stack"><div class="label">In corso · settimana ${open.week}</div>
      <div class="row"><div><div class="big">${esc(open.sheet)}</div><div class="hint" style="font-size:13px">${esc(L.fmtDate(open.date))} · ${n} di ${slots.length} esercizi</div></div>
      <button class="btn" data-act="open-session" data-id="${open.id}">Riprendi</button></div></section>`;
  }
  if (c.closed) return `<section class="card stack"><div class="label">Ciclo ${c.number} chiuso</div><p class="hint" style="font-size:14px">Importa la scheda nuova del coach per iniziare il prossimo ciclo.</p><button class="btn" data-act="go" data-view="program">Vai alla scheda</button></section>`;
  const sug = L.nextSuggestion(d, c);
  const slots = c.sheets[sug.sheet] || [];
  const lastSame = L.sessionsOf(d, c.id).filter((s) => s.sheet === sug.sheet && s.finishedAt).pop();
  const min = lastSame && sessionMinutes(lastSame);
  return `<section class="card next stack"><div class="label">Prossima · settimana ${sug.week}</div>
    <div class="row"><div><div class="big">${esc(sug.sheet)}</div><div class="hint" style="font-size:13px">${slots.length} esercizi${min ? ` · ~${min}′ l'ultima volta` : ""}</div></div>
    <button class="btn" data-act="start" data-sheet="${esc(sug.sheet)}" data-week="${sug.week}">Inizia ${esc(sug.sheet)}</button></div>
    <div class="grid4">${letters.map((l) => {
      const isDone = L.doneInWeek(d, c, l, sug.week);
      return `<button class="pick ${l === sug.sheet ? "sel" : ""} ${isDone ? "done" : ""}" data-act="start" data-sheet="${esc(l)}" data-week="${sug.week}"><b>${esc(l)}</b><small>${isDone ? "✓ fatta" : l === sug.sheet ? "suggerita" : esc(c.dayPlan?.[l] || "da fare")}</small></button>`;
    }).join("")}</div></section>`;
}

function kpis(d, c, letters, done) {
  const w = Math.min(Math.max(1, L.weekForDate(c, L.todayISO())), c.weeks);
  const inWeek = letters.filter((l) => L.doneInWeek(d, c, l, w));
  const planned = L.plannedSessions(d, c);
  const adherence = planned ? Math.round((Math.min(done.length, planned) / planned) * 100) : null;
  const ws = store.live(d.weights).sort(byDate);
  const last = ws[ws.length - 1];
  const ref = last && ws.filter((x) => x.date <= L.addDays(last.date, -7)).pop();
  const recent = last ? ws.filter((x) => x.date > L.addDays(last.date, -30)) : [];
  return `<div class="kpis">
    <div class="kpi"><div class="label">Settimana ${w}</div><b>${inWeek.length}<small>/${letters.length}</small></b>
      <div class="segs">${letters.map((l) => `<i class="${inWeek.includes(l) ? "on" : ""}"></i>`).join("")}</div><span class="hint">sessioni fatte</span></div>
    <div class="kpi"><div class="label">Aderenza ciclo</div><b>${adherence != null ? `${adherence}<small>%</small>` : "–"}</b><span class="hint">${planned ? `${Math.min(done.length, planned)} di ${planned} previste` : "dalla settimana 2"}</span></div>
    <button class="kpi wide" data-act="go-weight-tab">${last ? `<div class="row"><div class="label">Peso</div><span class="hint">${esc(L.fmtDate(last.date))}</span></div>
      <div class="row"><b>${L.fmtNum(last.kg)}<small> kg</small></b>${ref ? `<span><span class="delta">${L.fmtDelta(last.kg, ref.kg)}</span> <span class="hint">in 7 gg</span></span>` : ""}</div>${sparkline(recent.map((x) => x.kg))}`
      : `<div class="label">Peso</div><span class="hint">Nessuna pesata. Tocca per registrarla.</span>`}</button>
  </div>`;
}

function records(d) {
  const prs = recentRecords(d);
  if (!prs.length) return "";
  return `<section class="card stack"><div class="label">Ultimi record</div>
    <ul class="list">${prs.map((p) => `<li><span>🏆 ${esc(p.name)}</span><span class="val"><b>${L.fmtNum(p.load)} kg</b><span class="hint">${esc(L.fmtDate(p.date, { weekday: false }))}</span></span></li>`).join("")}</ul></section>`;
}

Object.assign(actions, {
  start: (el) => startSession(el.dataset.sheet, +el.dataset.week),
  "open-session": (el) => openSessionView(el.dataset.id),
  "all-sessions": () => { ui.progTab = "sessions"; go("program"); },
  "go-weight": () => { ui.mTab = "weight"; go("measures"); openWeightForm(null); },
  "go-weight-tab": () => { ui.mTab = "weight"; go("measures"); if (!store.live(D().weights).length) openWeightForm(null); },
  "go-circ": () => { ui.mTab = "circ"; go("measures"); openMeasureForm(null); },
  "go-settings": () => go("settings"),
});
