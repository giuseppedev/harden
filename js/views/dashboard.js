// Home: what to do now (reminders, next session) and a few numbers at a glance. Everything else lives in its tab.
import * as store from "../data.js";
import * as L from "../logic.js";
import { esc, D, ui, actions, go, byDate } from "../core.js";
import { sparkline } from "../charts.js";
import { sessionRow, sessionMinutes, fmtMinutes, startSession, openSessionView, progressOf } from "./session.js";
import { openWeightForm, openMeasureForm } from "./measures.js";
import { reminders } from "../reminders.js";

/** Personal records in chronological order (heavier load, or more reps at a load already lifted), newest first. */
function recentRecords(d, n = 3) {
  const out = [];
  for (const ex of store.live(d.exercises)) {
    const earlier = [];
    for (const h of L.historyFor(d, ex.id).reverse()) {
      const sets = L.countedSets(h).filter((st) => st.load != null);
      const pr = L.bestRecord(sets, earlier);
      if (pr) out.push({ name: ex.name, set: pr.set, kind: pr.rec.kind, date: h.session.date });
      earlier.push(...sets);
    }
  }
  return out.sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, n);
}

export function viewDashboard(d) {
  const c = L.currentCycle(d);
  const chips = reminders(d).map((r) => `<button class="rchip ${r.state}" data-act="${r.act}">${r.icon} ${esc(r.name)} <small>${esc(L.dueText(r, r.ending))}</small></button>`).join("");
  if (!c) return `${chips ? `<div class="rchips">${chips}</div>` : ""}<p class="empty">Nessun ciclo. Importa la scheda del coach dal tab Scheda.</p>`;
  const letters = L.sheetLetters(c);
  const done = L.sessionsOf(d, c.id).filter((s) => s.finishedAt || L.sessionHasWork(s));
  return [
    chips && `<div class="rchips">${chips}</div>`,
    nowCard(d, c, letters),
    kpis(d, c, letters),
    records(d),
    done.length && `<section class="card stack"><div class="row"><div class="label">Ultime sessioni</div><button class="mini" data-act="all-sessions">Tutte ›</button></div>
      <ul class="list">${done.slice(-2).reverse().map((s) => sessionRow(s)).join("")}</ul></section>`,
  ].filter(Boolean).join("");
}

/** Session in progress, otherwise the suggested next sheet with A–D picks. */
function nowCard(d, c, letters) {
  const open = L.openSession(d);
  if (open) {
    const p = progressOf(open);
    return `<section class="card next stack"><div class="label">In corso · settimana ${open.week}</div>
      <div class="row"><div><div class="big">${esc(open.sheet)}</div><div class="hint" style="font-size:14px">${esc(L.fmtDate(open.date))} · ${p.done} di ${p.total} esercizi</div></div>
      <button class="btn" data-act="open-session" data-id="${open.id}">Riprendi</button></div></section>`;
  }
  if (c.closed) return `<section class="card stack"><div class="label">Ciclo ${c.number} chiuso</div><p class="hint" style="font-size:14px">Importa la scheda nuova del coach per iniziare il prossimo ciclo.</p><label class="btn" for="programFileHome">Importa la scheda nuova</label><input id="programFileHome" type="file" accept=".json,application/json" data-act="import-program-file" class="vh"></section>`;
  const sug = L.nextSuggestion(d, c);
  const slots = c.sheets[sug.sheet] || [];
  const lastSame = L.sessionsOf(d, c.id).filter((s) => s.sheet === sug.sheet && s.finishedAt).pop();
  const min = lastSame && sessionMinutes(lastSame);
  return `<section class="card next stack"><div class="label">Prossima · settimana ${sug.week}</div>
    <div class="row"><div><div class="big">${esc(sug.sheet)}</div><div class="hint" style="font-size:14px">${slots.length} esercizi${min ? ` · ~${fmtMinutes(min)} l'ultima volta` : ""}</div></div>
    <button class="btn" data-act="start" data-sheet="${esc(sug.sheet)}" data-week="${sug.week}">Inizia ${esc(sug.sheet)}</button></div>
    <div class="grid4">${letters.map((l) => {
      const isDone = L.doneInWeek(d, c, l, sug.week);
      return `<button class="pick ${l === sug.sheet ? "sel" : ""} ${isDone ? "done" : ""}" data-act="start" data-sheet="${esc(l)}" data-week="${sug.week}"><b>${esc(l)}</b><small>${isDone ? "✓ fatta" : l === sug.sheet ? "suggerita" : esc(c.dayPlan?.[l] || "da fare")}</small></button>`;
    }).join("")}</div></section>`;
}

function kpis(d, c, letters) {
  const w = Math.min(Math.max(1, L.weekForDate(c, L.todayISO())), c.weeks);
  // The session in progress fills its own segment set by set, instead of counting as done.
  const open = L.openSession(d);
  const live = open?.cycleId === c.id && open.week === w ? open : null;
  const inWeek = letters.filter((l) => L.sessionsOf(d, c.id).some((s) => s.sheet === l && s.week === w && s !== live && (s.finishedAt || L.sessionHasWork(s))));
  const liveSheet = live && !inWeek.includes(live.sheet) ? live.sheet : null;
  const ws = store.live(d.weights).sort(byDate);
  const last = ws[ws.length - 1];
  const ref = last && ws.filter((x) => x.date <= L.addDays(last.date, -7)).pop();
  const recent = last ? ws.filter((x) => x.date > L.addDays(last.date, -30)) : [];
  return `<div class="kpis">
    <div class="kpi wide"><div class="row"><div class="label">Settimana ${w}</div><span class="hint">sessioni fatte</span></div>
      <div class="row"><b>${inWeek.length}<small>/${letters.length}</small></b><div class="segs">${letters.map((l) => l === liveSheet
        ? `<i class="live" style="--p:${Math.round(progressOf(live).ratio * 100)}%"></i>`
        : `<i class="${inWeek.includes(l) ? "on" : ""}"></i>`).join("")}</div></div></div>
    <button class="kpi wide" data-act="go-weight-tab">${last ? `<div class="row"><div class="label">Peso</div><span class="hint">${esc(L.fmtDate(last.date))}</span></div>
      <div class="row"><b>${L.fmtKg(last.kg)}<small> kg</small></b>${ref ? `<span><span class="delta">${L.fmtDelta(last.kg, ref.kg, 2)}</span> <span class="hint">in 7 gg</span></span>` : ""}</div>${sparkline(recent.map((x) => x.kg))}`
      : `<div class="label">Peso</div><span class="hint">Nessuna pesata. Tocca per registrarla.</span>`}</button>
  </div>`;
}

function records(d) {
  const prs = recentRecords(d);
  if (!prs.length) return "";
  return `<section class="card stack"><div class="label">Ultimi record</div>
    <ul class="list">${prs.map((p) => `<li><span>🏆 ${esc(p.name)}</span><span class="val"><b>${p.kind === "load" ? `${L.fmtNum(p.set.load)} kg` : esc(L.fmtSet(p.set))}</b><span class="hint">${esc(L.fmtDate(p.date, { weekday: false }))}</span></span></li>`).join("")}</ul></section>`;
}

Object.assign(actions, {
  start: (el) => startSession(el.dataset.sheet, +el.dataset.week, null, L.currentCycle(D()).id),
  "open-session": (el) => openSessionView(el.dataset.id),
  "all-sessions": () => { ui.progTab = "sessions"; go("program"); },
  "go-weight": () => { ui.mTab = "weight"; go("measures"); openWeightForm(null); },
  "go-weight-tab": () => { ui.mTab = "weight"; go("measures"); if (!store.live(D().weights).length) openWeightForm(null); },
  "go-circ": () => { ui.mTab = "circ"; go("measures"); openMeasureForm(null); },
  "go-settings": () => go("settings"),
});
