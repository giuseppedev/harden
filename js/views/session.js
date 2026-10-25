// Session view: full screen, one card per exercise. Rarely used actions live in the ⋯ menus.
import * as store from "../data.js";
import * as L from "../logic.js";
import { $, $$, esc, D, ui, actions, changes, inputs, toast, undoToast, openModal, closeModal, openMenu, render, renderHeader, go, sessionById, cycleOfSession, runSync, deleteWithUndo } from "../core.js";
import { startTimer, unlockAudio, stopTimer } from "../timer.js";
import { chartBlock } from "../charts.js";

const noteOpen = new Set();

/* ---------- Lookups ---------- */
const prevEntryFor = (d, session, exerciseId) => L.historyFor(d, exerciseId, { before: session })[0] || null;
function lastBarFor(d, exerciseId) {
  for (const h of L.historyFor(d, exerciseId)) if (h.entry.barId) return h.entry.barId;
  return L.exerciseOf(d, exerciseId)?.defaultBarId || "";
}
/** Variant to preselect: the last one used, if still in the list, otherwise the first. */
function lastVariantFor(d, exerciseId) {
  const list = L.exerciseOf(d, exerciseId)?.variants || [];
  if (!list.length) return "";
  for (const h of L.historyFor(d, exerciseId)) if (h.entry.variant && list.includes(h.entry.variant)) return h.entry.variant;
  return list[0];
}
function supersetLabel(slot) {
  if (slot.superset === "first") return `<span class="ss">Superset 1/2 · ${L.fmtRest(slot.rest)} poi il secondo</span>`;
  if (slot.superset === "second") return `<span class="ss">Superset 2/2 · poi ${L.fmtRest(slot.rest)}</span>`;
  return "";
}
const slotOf = (s, slotId) => cycleOfSession(s).sheets[s.sheet].find((x) => x.id === slotId);
const current = () => sessionById(ui.sessionId);

/** Exercises with at least one set ticked, out of the sheet's exercises. */
function progressOf(s) {
  const slots = cycleOfSession(s).sheets[s.sheet] || [];
  return { done: slots.filter((sl) => L.doneSets(s.entries?.[sl.id]).length).length, total: slots.length };
}
/** Minutes from the first to the last ticked set. */
export function sessionMinutes(s) {
  const times = Object.values(s.entries || {}).flatMap((e) => (e.sets || []).map((st) => st?.at)).filter(Boolean).sort();
  return times.length >= 2 ? Math.round((new Date(times[times.length - 1]) - new Date(times[0])) / 60000) : null;
}

/** One tappable row in a list of sessions (dashboard, Scheda › Sessioni). */
export function sessionRow(s, { week = true } = {}) {
  const p = progressOf(s), min = sessionMinutes(s);
  const status = !s.finishedAt ? `<span class="tag">in corso</span>` : "";
  return `<li class="tap" data-act="open-session" data-id="${s.id}"><span><b>${esc(s.sheet)}</b> · ${esc(L.fmtDate(s.date))}${week ? ` · sett. ${s.week}` : ""} ${status}</span>
    <span class="hint">${min != null ? `${min}′ · ` : ""}${p.done} di ${p.total} esercizi ›</span></li>`;
}

/* ---------- View ---------- */
export function viewWorkout(d) {
  const s = current();
  if (!s) {
    const open = L.openSession(d);
    if (open) { ui.sessionId = open.id; return viewWorkout(d); }
    return `<p class="empty">Nessuna sessione aperta.</p>`; // app.js routes back before getting here
  }
  const c = cycleOfSession(s);
  const slots = c.sheets[s.sheet] || [];
  const p = progressOf(s);
  return `
  <section class="card sess-card"><div class="row"><div class="hint">Settimana ${s.week} · ${esc(L.fmtDate(s.date))} · <span id="sessProg">${p.done} di ${p.total}</span> esercizi${c.closed ? ` · ciclo ${c.number} chiuso` : ""}</div>
    ${s.finishedAt ? `<button class="mini" data-act="workout-back">Fatto</button>` : `<button class="mini primary" data-act="finish">Termina</button>`}</div>
    <div class="progress"><i id="sessBar" style="width:${p.total ? (p.done / p.total) * 100 : 0}%"></i></div></section>
  ${slots.map((slot) => exerciseCard(d, c, s, slot)).join("")}
  ${s.finishedAt ? "" : `<button class="btn" data-act="finish">Termina sessione</button>`}`;
}

function exerciseCard(d, c, s, slot) {
  const r = L.resolveSlot(c, slot, s);
  const ex = L.exerciseOf(d, r.exerciseId) || { name: "Esercizio", district: slot.district };
  const entry = s.entries?.[slot.id];
  const targets = L.targetsFor(r.blocks, s.week);
  const prev = prevEntryFor(d, s, r.exerciseId);
  const prevRaw = prev?.entry.sets || [];
  const prevLast = prevRaw.filter(Boolean).pop();
  const hist = L.historyFor(d, r.exerciseId, { before: s }).slice(0, 2);
  const chips = hist.length
    ? hist.map((h) => { const v = ex.variants?.length ? L.variantOf(d, h.entry) : ""; return `<span><b>${h.cycle.id === c.id ? "" : `C${h.cycle.number} `}S${h.session.week}${v ? ` · ${esc(v)}` : ""}:</b> ${L.countedSets(h).map(L.fmtSet).join(", ")}</span>`; }).join("")
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
  const barId = entry?.barId ?? lastBarFor(d, r.exerciseId);
  const barHtml = ex.usesBar ? `<div class="bar-row"><select data-act="bar" data-slot="${slot.id}" aria-label="Bilanciere"><option value="">Nessun bilanciere</option>${store.live(d.bars).map((b) => `<option value="${b.id}" ${b.id === barId ? "selected" : ""}>${esc(b.name)}${b.kg != null ? ` · ${L.fmtNum(b.kg)} kg` : ""}</option>`).join("")}</select>
    <div class="total" data-total="${slot.id}"></div></div>` : "";
  const variant = entry?.variant || lastVariantFor(d, r.exerciseId);
  const variantHtml = ex.variants?.length ? `<label class="variant-row"><span class="label">Variante</span><select data-act="variant" data-slot="${slot.id}">${ex.variants.map((v) => `<option ${v === variant ? "selected" : ""}>${esc(v)}</option>`).join("")}</select></label>` : "";
  const showNote = !!entry?.note || noteOpen.has(slot.id);
  const prevNote = !entry?.note && prev?.entry.note ? prev.entry.note : "";
  const sub = r.substitution ? `<div class="subtag">⇄ Sostituisce ${esc(L.exName(d, slot.exerciseId))} · ${r.substitution === "permanent" ? "definitiva" : "solo oggi"}<button data-act="restore" data-slot="${slot.id}">Ripristina</button></div>` : "";
  return `<article class="card" data-card="${slot.id}">
    <div class="ex-head"><span class="dist">${esc(ex.district || slot.district || "")}</span>
      <div class="ex-title"><h3>${esc(ex.name)}</h3><div class="meta"><span>${esc(L.schemaLabel(r.blocks, s.week))}</span><span>Recupero ${esc(L.fmtRest(slot.rest))}</span>${supersetLabel(slot)}</div>
        <button class="setup-line ${ex.setup ? "" : "empty"}" data-act="setup-edit" data-ex="${r.exerciseId}">⚙︎ ${ex.setup ? esc(ex.setup) : "Regolazioni"}</button></div>
      <button class="icon-btn" data-act="ex-menu" data-slot="${slot.id}" aria-label="Altre azioni">⋯</button></div>
    ${sub}
    <div class="hist">${chips}</div>
    ${variantHtml}
    ${prevNote ? `<p class="hint prev-note">Ultima nota: ${esc(prevNote)}</p>` : ""}
    ${blocks || `<p class="hint" style="margin-top:10px">Nessuna serie prevista questa settimana.</p>`}
    ${extra ? `<div class="block"><span class="label">Serie extra</span>${extraRows}</div>` : ""}
    ${barHtml}
    ${showNote ? `<input class="note-input" type="text" data-act="note" data-slot="${slot.id}" value="${esc(entry?.note || "")}" placeholder="Nota di oggi" aria-label="Nota di oggi">` : ""}
    <div class="card-acts"><button class="mini" data-act="add-set" data-slot="${slot.id}">+ serie</button>${extra ? `<button class="mini danger" data-act="remove-set" data-slot="${slot.id}">− serie</button>` : ""}${showNote ? "" : `<button class="mini" data-act="note-open" data-slot="${slot.id}">＋ nota</button>`}</div>
  </article>`;
}

function setRow(slotId, i, target, role, saved, reps, load, pr) {
  return `<div class="set ${saved?.done ? "done" : ""} ${pr ? "pr" : ""}" data-slot="${slotId}" data-k="${i}">
    <span class="n">${pr ? '<b class="pr-tag">PR</b>' : i + 1}</span><span class="tgt ${role}">${esc(target)}</span>
    <label class="field"><input data-f="reps" inputmode="numeric" value="${esc(reps)}" placeholder="–" aria-label="Ripetizioni serie ${i + 1}"><em>rip</em></label>
    <label class="field"><input data-f="load" inputmode="decimal" value="${esc(L.fmtNum(load))}" placeholder="–" aria-label="Carico serie ${i + 1}"><em>kg</em></label>
    <button class="check" data-act="check" ${role === "mav" ? 'data-mav="1"' : ""} ${role === "warm" ? 'data-warm="1"' : ""} aria-label="Serie ${i + 1} fatta" aria-pressed="${!!saved?.done}">✓</button></div>`;
}

/* ---------- Writing sets ---------- */
function ensureEntry(d, s, slot) {
  const c = d.cycles.find((x) => x.id === s.cycleId);
  s.entries ??= {};
  let e = s.entries[slot.id];
  if (!e) {
    const r = L.resolveSlot(c, slot, s);
    e = s.entries[slot.id] = { exerciseId: r.exerciseId, substitution: r.substitution, sets: [] };
    if (r.substitution) e.schema = r.blocks; // frozen: restoring the original later must not rewrite this session
    const v = lastVariantFor(d, r.exerciseId);
    if (v) e.variant = v;
  }
  s.updatedAt = store.now();
  return e;
}
function withEntry(slotId, fn) {
  store.mutate((d) => { const sess = d.sessions.find((x) => x.id === ui.sessionId); fn(ensureEntry(d, sess, slotOf(sess, slotId)), d, sess); });
}
const readSet = (row) => ({ reps: L.parseNum($('[data-f="reps"]', row).value), load: L.parseNum($('[data-f="load"]', row).value) });

export function onSetInput(row) {
  const slotId = row.dataset.slot, k = +row.dataset.k;
  withEntry(slotId, (e) => { const prev = e.sets[k] || {}; e.sets[k] = { ...prev, ...readSet(row), done: !!prev.done }; });
  updateBarTotal(slotId);
}

function refreshProgress() {
  const s = current(), p = progressOf(s);
  if ($("#sessProg")) $("#sessProg").textContent = `${p.done} di ${p.total}`;
  if ($("#sessBar")) $("#sessBar").style.width = `${p.total ? (p.done / p.total) * 100 : 0}%`;
}

function onCheck(btn) {
  unlockAudio();
  const row = btn.closest(".set");
  const s = current();
  const slotId = row.dataset.slot, k = +row.dataset.k;
  const done = !row.classList.contains("done");
  const values = readSet(row);
  withEntry(slotId, (e) => { e.sets[k] = { ...values, done, ...(done ? { at: store.now() } : {}) }; });
  row.classList.toggle("done", done);
  btn.setAttribute("aria-pressed", String(done));
  renderHeader(); refreshProgress();
  const slot = slotOf(s, slotId);
  const r = L.resolveSlot(cycleOfSession(s), slot, current());
  const best = L.bestLoadBefore(D(), r.exerciseId, current());
  const pr = done && !btn.dataset.warm && best != null && values.load != null && values.load > best;
  row.classList.toggle("pr", pr);
  $(".n", row).innerHTML = pr ? '<b class="pr-tag">PR</b>' : String(k + 1);
  if (!done) return;
  if (pr) toast(`Nuovo record su ${L.exName(D(), r.exerciseId)}: ${L.fmtNum(values.load)} kg (prima ${L.fmtNum(best)} kg)`, { ms: 3500 });
  startTimer(slot.rest, L.exName(D(), r.exerciseId));
  if (btn.dataset.mav && values.load != null) {
    const next = row.closest(".block").nextElementSibling;
    if (next?.classList.contains("block")) {
      $$(".set:not(.done) [data-f=load]", next).forEach((inp) => { inp.value = L.fmtNum(values.load); onSetInput(inp.closest(".set")); });
      toast(`Serie di lavoro precompilate con il carico MAV: ${L.fmtNum(values.load)} kg`);
      updateBarTotal(slotId);
    }
  }
}

/* ---------- Bars and plates ---------- */
export const DEFAULT_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25];
export const platesOf = () => (D()?.profile?.plates?.length ? D().profile.plates : DEFAULT_PLATES).slice().sort((a, b) => b - a);
/** Plates for one side of the bar, given the total plate load logged (both sides). Greedy on available plates. */
function platesPerSide(total) {
  let left = Math.round((total / 2) * 1000) / 1000;
  const out = [];
  for (const p of platesOf()) while (left >= p - 1e-9) { out.push(p); left = Math.round((left - p) * 1000) / 1000; }
  return { plates: out, rest: left };
}
function barTotalText(bar, loads) {
  const max = Math.max(...loads.filter((x) => x != null && x > 0));
  const side = Number.isFinite(max) ? platesPerSide(max) : null;
  const sideTxt = side && side.plates.length ? `Per lato: ${side.plates.map(L.fmtNum).join(" + ")}${side.rest > 0.01 ? ` (mancano ${L.fmtNum(side.rest)} kg)` : ""}` : "";
  if (!bar) return sideTxt;
  if (bar.kg == null) return `Imposta il peso di questo bilanciere in ⚙︎ → Attrezzatura${sideTxt ? ` · ${sideTxt}` : ""}`;
  if (!Number.isFinite(max)) return `Bilanciere ${L.fmtNum(bar.kg)} kg: inserisci i dischi per vedere il totale`;
  return `Totale con bilanciere: ${L.fmtNum(max + bar.kg)} kg · ${sideTxt}`;
}
export function updateBarTotal(slotId) {
  const el = $(`[data-total="${slotId}"]`);
  if (!el) return;
  const sel = $(`select[data-act="bar"][data-slot="${slotId}"]`);
  const loads = $$(`[data-card="${slotId}"] [data-f=load]`).map((i) => L.parseNum(i.value));
  el.textContent = barTotalText(L.barOf(D(), sel?.value), loads);
}
export const refreshBarTotals = () => $$("[data-total]").forEach((el) => updateBarTotal(el.dataset.total));

/* ---------- Start and finish ---------- */
export function startSession(sheet, week, date, cycleId) {
  const d = D(), c = d.cycles.find((x) => x.id === cycleId);
  const same = L.sessionsOf(d, c.id).filter((s) => s.sheet === sheet && s.week === week);
  const back = ui.view === "workout" ? ui.back : ui.view;
  const open = same.filter((s) => !s.finishedAt).pop();
  if (open) { go("workout", { sessionId: open.id, back }); return; }
  const done = same.pop();
  if (done && date) { go("workout", { sessionId: done.id, back }); return; } // past session already logged: open it
  if (done) {
    openModal(`<h2>Scheda ${esc(sheet)} · settimana ${week} già fatta</h2>
      <p class="hint" style="font-size:14px">L'hai terminata ${esc(L.fmtDate(done.date))}. Vuoi rivederla o iniziarne una nuova?</p>
      <button class="btn" data-act="start-new" data-sheet="${esc(sheet)}" data-week="${week}" data-cycle="${c.id}">Inizia una nuova sessione</button>
      <button class="btn ghost" data-act="open-session" data-id="${done.id}">Apri quella del ${esc(L.fmtDate(done.date, { weekday: false }))}</button>
      <button class="btn ghost" data-act="close">Annulla</button>`);
    return;
  }
  createSession(c, sheet, week, date, back);
}
function createSession(c, sheet, week, date, back) {
  const id = store.uid();
  store.mutate((dd) => store.upsert(dd, "sessions", { id, cycleId: c.id, sheet, week, date: date || L.todayISO(), createdAt: store.now(), finishedAt: null, entries: {} }));
  go("workout", { sessionId: id, back });
}
export const openSessionView = (id) => go("workout", { sessionId: id, back: ui.view === "workout" ? ui.back : ui.view });

export async function finishSession() {
  const s = current();
  if (!L.sessionHasWork(s)) {
    openModal(`<h2>Nessuna serie segnata</h2><p class="hint" style="font-size:14px">Questa sessione non ha serie spuntate. Vuoi eliminarla?</p>
      <div class="row"><button class="btn ghost" data-act="close">Continua la sessione</button><button class="btn danger" data-act="discard-session">Elimina</button></div>`);
    return;
  }
  store.mutate((d) => { const x = d.sessions.find((y) => y.id === s.id); x.finishedAt ??= store.now(); x.updatedAt = store.now(); });
  stopTimer();
  go("home");
  openSummary(sessionById(s.id));
  await runSync(`feat: log session ${s.sheet} week ${s.week} (${s.date})`, { quiet: true });
}

/** Figures for the end-of-session summary. Volume counts plates only (kg × reps), warm-ups excluded. */
function sessionSummary(d, s) {
  const c = cycleOfSession(s);
  const out = { planned: 0, done: 0, volume: 0, prs: [], lines: [], minutes: sessionMinutes(s), prevVolume: null };
  const volumeOf = (sess) => {
    let v = 0;
    for (const slot of c.sheets[sess.sheet] || []) {
      const e = sess.entries?.[slot.id];
      if (!e) continue;
      const r = L.resolveSlot(c, slot, sess);
      for (const st of L.countedSets({ session: sess, entry: e, blocks: r.blocks })) if (st.load != null && st.reps != null) v += st.load * st.reps;
    }
    return v;
  };
  for (const slot of c.sheets[s.sheet] || []) {
    const r = L.resolveSlot(c, slot, s), e = s.entries?.[slot.id];
    out.planned += L.countedIdx(r.blocks, s.week).length;
    if (!e) continue;
    const sets = L.countedSets({ session: s, entry: e, blocks: r.blocks });
    out.done += sets.length;
    const top = L.bestSet(sets);
    if (!top) continue;
    const name = L.exName(d, r.exerciseId);
    const best = L.bestLoadBefore(d, r.exerciseId, s);
    if (best != null && top.load != null && top.load > best) out.prs.push({ name, load: top.load, prev: best });
    const prev = L.historyFor(d, r.exerciseId, { before: s })[0];
    out.lines.push({ name, now: top, prev: prev ? L.bestSet(L.countedSets(prev)) : null });
  }
  out.volume = volumeOf(s);
  const before = L.sessionsOf(d, c.id).filter((x) => x.sheet === s.sheet && x.id !== s.id && (x.date < s.date || (x.date === s.date && (x.createdAt || "") < (s.createdAt || "")))).pop();
  if (before) out.prevVolume = volumeOf(before);
  return out;
}

function openSummary(s) {
  const d = D(), r = sessionSummary(d, s);
  const trend = (now, prev) => {
    if (!prev || now.load == null || prev.load == null) return `<span class="hint">prima volta</span>`;
    if (now.load > prev.load || (now.load === prev.load && (now.reps ?? 0) > (prev.reps ?? 0))) return `<span class="up">↑ ${esc(L.fmtSet(prev))}</span>`;
    if (now.load < prev.load || (now.reps ?? 0) < (prev.reps ?? 0)) return `<span class="down">↓ ${esc(L.fmtSet(prev))}</span>`;
    return `<span class="hint">= come l'ultima volta</span>`;
  };
  const volDelta = r.prevVolume ? Math.round(((r.volume - r.prevVolume) / r.prevVolume) * 100) : null;
  openModal(`<div><div class="label">Sessione completata</div><h2>Scheda ${esc(s.sheet)} · Settimana ${s.week}</h2></div>
    <div class="tiles four">
      <div class="tile"><b>${r.minutes != null ? `${r.minutes}′` : "–"}</b><span>durata</span></div>
      <div class="tile"><b>${r.done}/${r.planned}</b><span>serie</span></div>
      <div class="tile"><b>${L.fmtNum(Math.round(r.volume))}</b><span>kg sollevati</span></div>
      <div class="tile"><b>${r.prs.length}</b><span>record</span></div>
    </div>
    ${volDelta != null ? `<p class="hint" style="font-size:14px">Volume ${volDelta >= 0 ? "+" : ""}${volDelta}% rispetto alla scheda ${esc(s.sheet)} precedente.</p>` : ""}
    ${r.prs.length ? `<div class="banner">🏆 ${r.prs.map((p) => `${esc(p.name)}: ${L.fmtNum(p.load)} kg (prima ${L.fmtNum(p.prev)})`).join(" · ")}</div>` : ""}
    <div class="label">Serie migliore per esercizio</div>
    <ul class="list">${r.lines.map((l) => `<li><span>${esc(l.name)}</span><span class="val"><b>${esc(L.fmtSet(l.now))}</b>${trend(l.now, l.prev)}</span></li>`).join("")}</ul>
    <p class="hint">Durata dalla prima all'ultima serie spuntata. Il volume conta solo i dischi, senza serie di avvicinamento.</p>
    <button class="btn" data-act="close">Fatto</button>`);
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
/** Fuzzy match of a search query against an exercise name (typos, synonyms, word prefixes). */
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
  const s = current(), c = cycleOfSession(s), slot = slotOf(s, slotId);
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
  const s = current(), slot = slotOf(s, subState.slotId);
  const cur = L.resolveSlot(cycleOfSession(s), slot, s).exerciseId;
  const q = $("#subSearch")?.value || "";
  const dist = slot.district;
  const items = store.live(D().exercises).filter((e) => e.id !== cur)
    .map((e) => ({ ...e, score: matchScore(q, e.name) })).filter((e) => e.score > 0)
    .sort((a, b) => (b.district === dist) - (a.district === dist) || b.score - a.score || a.name.localeCompare(b.name, "it"));
  const same = items.filter((e) => e.district === dist), other = items.filter((e) => e.district !== dist);
  const li = (e) => `<li><button data-act="sub-pick" data-id="${e.id}" class="${subState.pick === e.id ? "sel" : ""}"><span class="dist">${esc(e.district)}</span>${esc(e.name)}</button></li>`;
  $("#subList").innerHTML = (same.length ? `<li class="cat-h">Stesso distretto · ${esc(dist)}</li>${same.map(li).join("")}` : "")
    + (other.length ? `<li class="cat-h">Altri distretti</li>${other.map(li).join("")}` : "")
    || `<li style="padding:10px;font-size:14px;color:var(--muted)">Nessun risultato. Crealo qui sotto.</li>`;
  $("#subOk").disabled = !subState.pick;
}

function confirmSubstitution() {
  const s = current(), c = cycleOfSession(s), slot = slotOf(s, subState.slotId);
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
  const undo = snapshotSlot(s, slot.id);
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
  undoToast(`${mode === "permanent" ? "Sostituito fino a fine ciclo" : "Sostituito solo per oggi"}${undo.hadSets ? " · serie di oggi azzerate" : ""}`, undo.restore);
}

/** Snapshot of a slot (today's entry and the cycle override) so a substitution or a restore can be undone. */
function snapshotSlot(s, slotId) {
  const c = cycleOfSession(s);
  const entry = s.entries?.[slotId] ? JSON.parse(JSON.stringify(s.entries[slotId])) : null;
  const override = c.overrides?.[slotId] ? JSON.parse(JSON.stringify(c.overrides[slotId])) : null;
  return {
    hadSets: !!entry && L.doneSets(entry).length > 0,
    restore: () => {
      store.mutate((dd) => {
        const cc = dd.cycles.find((x) => x.id === c.id), sess = dd.sessions.find((x) => x.id === s.id);
        const o = { ...(cc.overrides || {}) };
        if (override) o[slotId] = override; else delete o[slotId];
        cc.overrides = o; cc.updatedAt = store.now();
        sess.entries ??= {};
        if (entry) sess.entries[slotId] = entry; else delete sess.entries[slotId];
        sess.updatedAt = store.now();
      });
      render(); toast("Ripristinato");
    },
  };
}

function restoreOriginal(slotId) {
  const s = current(), c = cycleOfSession(s), slot = slotOf(s, slotId);
  const undo = snapshotSlot(s, slotId);
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
  closeModal(); render();
  undoToast(`Ripristinato l'esercizio originale${undo.hadSets ? " · serie di oggi azzerate" : ""}`, undo.restore);
}

/* ---------- History, coach notes, setup ---------- */
export function openHistory(exerciseId) {
  const d = D();
  const hist = L.historyFor(d, exerciseId);
  const pts = hist.map((h) => ({ date: h.session.date, v: L.bestSet(L.countedSets(h))?.load })).filter((x) => x.v != null).reverse();
  openModal(`<div><div class="label">Storico e progressione</div><h2>${esc(L.exName(d, exerciseId))}</h2></div>
    ${pts.length ? `<div class="label">Carico migliore (dischi)</div>${chartBlock(`ex-${exerciseId}`, pts, "kg", "W")}` : ""}
    ${hist.length ? `<div class="tbl-wrap"><table class="tbl"><tr><th>Data</th><th>Ciclo</th><th>Serie (rip × kg)</th></tr>
    ${hist.map((h) => `<tr><td>${esc(L.fmtDate(h.session.date, { weekday: false, year: true }))}</td><td>C${h.cycle.number} S${h.session.week}</td><td style="white-space:normal">${L.exerciseOf(d, exerciseId)?.variants?.length ? `<b>${esc(L.variantOf(d, h.entry))}</b> · ` : ""}${L.countedSets(h).map(L.fmtSet).join(", ")}${h.entry.note ? `<br><span class="hint">${esc(h.entry.note)}</span>` : ""}</td></tr>`).join("")}</table></div>` : `<p class="hint">Nessuna serie registrata finora.</p>`}
    <button class="btn ghost" data-act="close">Chiudi</button>`);
}

/** Coach notes of a slot as paragraphs (shared with the program detail). */
export function coachNotes(slot) {
  return [
    slot.description && `<p>${esc(slot.description)}</p>`,
    slot.exerciseNote && `<p><b>Nota:</b> ${esc(slot.exerciseNote)}</p>`,
    slot.progressionNote && `<p><b>Progressione:</b> ${esc(slot.progressionNote)}</p>`,
    slot.tut && `<p><b>TUT:</b> ${esc(slot.tut)}</p>`,
    slot.week4Plus && `<p><b>Settimana 4:</b> aumenta il carico (+).</p>`,
    /^https?:\/\//i.test(slot.video || "") && `<p><a href="${esc(slot.video)}" target="_blank" rel="noopener">Apri il video</a></p>`,
  ].filter(Boolean).join("");
}

function openSetup(exId) {
  const ex = L.exerciseOf(D(), exId);
  openModal(`<div><div class="label">Regolazioni</div><h2>${esc(ex.name)}</h2></div>
    <p class="hint">Posizioni della macchina da ritrovare la prossima volta. Valgono per questo esercizio in tutte le schede.</p>
    <input id="setupVal" type="text" value="${esc(ex.setup || "")}" placeholder="es. schienale tacca 3, sellino 4" aria-label="Regolazioni">
    <div class="row"><button class="btn ghost" style="flex:1" data-act="close">Annulla</button><button class="btn" style="flex:1" data-act="setup-save" data-ex="${exId}">Salva</button></div>`);
  $("#setupVal").focus();
}

/* ---------- Handlers ---------- */
Object.assign(actions, {
  "workout-back": () => go(ui.back || "home"),
  "start-new": (el) => { closeModal(); createSession(D().cycles.find((x) => x.id === el.dataset.cycle), el.dataset.sheet, +el.dataset.week, null, ui.view); },
  check: (el) => onCheck(el),
  finish: () => finishSession(),
  "session-menu": () => {
    const s = current();
    openMenu(`Scheda ${s.sheet} · settimana ${s.week}`, [
      ["Cambia data o settimana", "edit-session-meta"],
      ["Elimina sessione", "session-delete", `data-id="${s.id}"`],
    ]);
  },
  "session-delete": (el) => { const back = ui.back || "home"; ui.sessionId = null; deleteWithUndo("sessions", el.dataset.id, "Sessione eliminata", "fix: remove session"); go(back); },
  "edit-session-meta": () => {
    const s = current(), c = cycleOfSession(s);
    openModal(`<h2>Scheda ${esc(s.sheet)}</h2>
      <label class="label" for="metaWeek">Settimana<select id="metaWeek">${Array.from({ length: c.weeks }, (_, i) => `<option ${i + 1 === s.week ? "selected" : ""}>${i + 1}</option>`).join("")}</select></label>
      <label class="label" for="metaDate">Data<input id="metaDate" type="date" value="${s.date}"></label>
      <div class="row"><button class="btn ghost" data-act="close">Annulla</button><button class="btn" data-act="meta-ok">Salva</button></div>`);
  },
  "meta-ok": () => {
    const w = +$("#metaWeek").value, dt = $("#metaDate").value, s = current(), c = cycleOfSession(s);
    if (!dt) { toast("Inserisci la data"); return; }
    const clash = L.sessionsOf(D(), c.id).find((x) => x.id !== s.id && x.sheet === s.sheet && x.week === w);
    if (clash) { toast(`C'è già la scheda ${s.sheet} della settimana ${w} (${L.fmtDate(clash.date, { weekday: false })})`, { error: true }); return; }
    if (dt < c.startDate || dt > L.cycleEnd(c)) { toast(`La data deve essere nel ciclo ${c.number}: ${L.fmtRange(c.startDate, L.cycleEnd(c))}`, { error: true }); return; }
    store.mutate((d) => { const s = d.sessions.find((x) => x.id === ui.sessionId); s.week = w; s.date = dt || s.date; s.updatedAt = store.now(); });
    closeModal(); render();
  },
  "discard-session": () => {
    store.mutate((d) => store.softDelete(d, "sessions", ui.sessionId));
    closeModal(); go("home"); toast("Sessione eliminata");
  },
  "ex-menu": (el) => {
    const s = current(), slot = slotOf(s, el.dataset.slot), r = L.resolveSlot(cycleOfSession(s), slot, s);
    const notes = !r.substitution && coachNotes(slot);
    openMenu(L.exName(D(), r.exerciseId), [
      ["⇄ Sostituisci esercizio", "swap", `data-slot="${slot.id}"`],
      r.substitution && ["↺ Ripristina l'originale", "restore", `data-slot="${slot.id}"`],
      ["📈 Storico e progressione", "history", `data-ex="${r.exerciseId}"`],
      ["⏱ Avvia recupero ora", "rest", `data-slot="${slot.id}"`],
      notes && ["▶︎ Note del coach e video", "coach", `data-slot="${slot.id}"`],
    ]);
  },
  coach: (el) => {
    const s = current(), slot = slotOf(s, el.dataset.slot);
    openModal(`<div><div class="label">Note del coach</div><h2>${esc(L.exName(D(), slot.exerciseId))}</h2></div><div class="notes">${coachNotes(slot)}</div><button class="btn ghost" data-act="close">Chiudi</button>`);
  },
  rest: (el) => {
    closeModal();
    const s = current(), slot = slotOf(s, el.dataset.slot);
    startTimer(slot.rest, L.exName(D(), L.resolveSlot(cycleOfSession(s), slot, s).exerciseId));
  },
  swap: (el) => openSubstitution(el.dataset.slot),
  restore: (el) => restoreOriginal(el.dataset.slot),
  history: (el) => openHistory(el.dataset.ex),
  "setup-edit": (el) => openSetup(el.dataset.ex),
  "setup-save": (el) => {
    const v = $("#setupVal").value.trim();
    store.mutate((d) => { const ex = L.exerciseOf(d, el.dataset.ex); if (ex) { ex.setup = v; ex.updatedAt = store.now(); } });
    closeModal(); render(); toast("Regolazioni salvate");
  },
  "note-open": (el) => { noteOpen.add(el.dataset.slot); render(); $(`[data-act=note][data-slot="${el.dataset.slot}"]`)?.focus(); },
  "add-set": (el) => {
    document.activeElement?.blur?.();
    withEntry(el.dataset.slot, (e) => { e.extra = (e.extra || 0) + 1; });
    render();
  },
  "remove-set": (el) => {
    document.activeElement?.blur?.();
    withEntry(el.dataset.slot, (e, d, sess) => {
      if (!e.extra) return;
      const slot = slotOf(sess, el.dataset.slot);
      const n = L.targetsFor(L.resolveSlot(d.cycles.find((c) => c.id === sess.cycleId), slot, sess).blocks, sess.week).length;
      e.sets.splice(n + e.extra - 1, 1);
      e.extra -= 1;
    });
    render();
  },
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
});

Object.assign(changes, {
  bar: (t) => { withEntry(t.dataset.slot, (e) => { e.barId = t.value; }); updateBarTotal(t.dataset.slot); },
  note: (t) => { withEntry(t.dataset.slot, (e) => { e.note = t.value.trim(); }); },
  variant: (t) => { withEntry(t.dataset.slot, (e) => { e.variant = t.value; }); },
});
Object.assign(inputs, { "sub-search": () => renderSubList() });
