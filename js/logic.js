// Pure helpers: dates, targets, substitutions, history, logbook and report figures.
import { live } from "./data.js";

/* ---------- Dates and formatting ---------- */
export const DAYS = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
export const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const pad = (n) => String(n).padStart(2, "0");

export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());
export function parseISO(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d, 12); }
export function addDays(s, n) { const d = parseISO(s); d.setDate(d.getDate() + n); return toISO(d); }
export function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }

export function fmtDate(s, { weekday = true, year = false } = {}) {
  if (!s) return "";
  const d = parseISO(s);
  return `${weekday ? DAYS[d.getDay()] + " " : ""}${d.getDate()} ${MONTHS[d.getMonth()]}${year ? " " + d.getFullYear() : ""}`;
}
export function fmtRange(a, b) { return `${fmtDate(a, { weekday: false })} – ${fmtDate(b, { weekday: false, year: true })}`; }
export function fmtRest(sec) {
  if (sec == null) return "";
  if (sec < 60) return `${sec} s`;
  const m = Math.floor(sec / 60), s = sec % 60;
  return s ? `${m}:${pad(s)} min` : `${m} min`;
}
export const fmtNum = (n) => (n == null || n === "" ? "" : String(Math.round(n * 100) / 100).replace(".", ","));
/** Signed difference; `decimals` fixed when given (body weight uses 2), otherwise rounded to one. */
export function fmtDelta(a, b, decimals = null) {
  if (a == null || b == null) return "–";
  const f = 10 ** (decimals ?? 1), d = Math.round((a - b) * f) / f;
  const abs = decimals != null ? Math.abs(d).toFixed(decimals).replace(".", ",") : fmtNum(Math.abs(d));
  return (d > 0 ? "+" : d < 0 ? "−" : "±") + abs;
}
/** Body weight, always with two decimals (77,85). */
export const fmtKg = (n) => (n == null ? "" : n.toFixed(2).replace(".", ","));
export function parseNum(v) {
  if (v == null) return null;
  const s = String(v).trim().replace(",", ".");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
export const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
export const slug = (s) => norm(s).replace(/ /g, "-");

/* ---------- Catalog ---------- */
export const exerciseOf = (d, id) => d.exercises.find((e) => e.id === id);
export const exName = (d, id) => exerciseOf(d, id)?.name || "Esercizio rimosso";
export const barOf = (d, id) => d.bars.find((b) => b.id === id);

/* ---------- Cycles ---------- */
export const cyclesSorted = (d) => live(d.cycles).sort((a, b) => a.number - b.number);
/** The cycle in progress: the newest one already started and not closed (a program imported ahead of its start waits). */
export function currentCycle(d) {
  const cs = cyclesSorted(d), today = todayISO();
  const started = cs.filter((c) => c.startDate <= today);
  return started.filter((c) => !c.closed).pop() || started.pop() || cs[0] || null;
}
/** Close every open cycle once a newer one has started (unless reopened by hand); returns true when something changed. */
export function closeSupersededCycles(d, now) {
  const today = todayISO();
  let changed = false;
  for (const c of cyclesSorted(d)) {
    const next = cyclesSorted(d).find((x) => x.number > c.number && x.startDate <= today);
    if (!c.closed && !c.keepOpen && next) { c.closed = true; c.closedAt = now; c.updatedAt = now; changed = true; }
  }
  return changed;
}
/**
 * Older data: a session using a permanent substitution read its scheme from the cycle override, so removing
 * the override rewrote history. Freeze the scheme into each such entry; returns true when something changed.
 */
export function freezeSubstitutionSchemas(d, now) {
  let changed = false;
  for (const s of live(d.sessions)) {
    const c = d.cycles.find((x) => x.id === s.cycleId);
    for (const [slotId, e] of Object.entries(s.entries || {})) {
      const ov = c?.overrides?.[slotId];
      if (e.substitution && !e.schema && ov?.schema && ov.exerciseId === e.exerciseId) { e.schema = ov.schema; s.updatedAt = now; changed = true; }
    }
  }
  return changed;
}
export const sheetLetters = (c) => Object.keys(c?.sheets || {});
export const cycleEnd = (c) => addDays(c.startDate, c.weeks * 7 - 1);
export function weekForDate(c, date) {
  const w = Math.floor(daysBetween(c.startDate, date) / 7) + 1;
  return Math.min(Math.max(w, 1), c.weeks);
}

/* ---------- Blocks and targets ---------- */
export const atWeek = (arr, w) => (Array.isArray(arr) ? arr[Math.min(w, arr.length) - 1] : arr);

/** Flat list of the sets expected in week `w`, one item per set. */
export function targetsFor(blocks, w) {
  const out = [];
  (blocks || []).forEach((b, bi) => {
    const n = Number(atWeek(b.sets, w)) || 0;
    const reps = String(atWeek(b.reps, w) ?? "");
    for (let j = 0; j < n; j++) {
      out.push({ block: bi, reps, mav: !!b.mav, role: b.mav ? (j === n - 1 ? "mav" : "warm") : "", index: j, n });
    }
  });
  return out;
}
/** Set indices that count in stats: MAV warm-up sets are left out. */
export const countedIdx = (blocks, w) => targetsFor(blocks, w).map((t, i) => (t.role === "warm" ? -1 : i)).filter((i) => i >= 0);
/** Set indices written in the coach logbook: the whole MAV block is left out. */
export const logbookIdx = (blocks, w) => targetsFor(blocks, w).map((t, i) => (t.mav ? -1 : i)).filter((i) => i >= 0);

export function blockLabel(b, w) {
  const n = atWeek(b.sets, w), r = atWeek(b.reps, w);
  return b.mav ? `MAV ${r}` : `${n}×${r}`;
}
export const schemaLabel = (blocks, w) => (blocks || []).map((b) => blockLabel(b, w)).join(" + ");
export const isNumericReps = (r) => /^\d+$/.test(String(r));

/* ---------- Slots and substitutions ---------- */
/**
 * Which exercise and which scheme a slot uses in a given session.
 * A session entry wins; otherwise a permanent override from its starting week; otherwise the coach's exercise.
 */
export function resolveSlot(cycle, slot, session) {
  const ov = cycle.overrides?.[slot.id];
  const ovActive = !!ov && (!session || session.week >= ov.fromWeek);
  const entry = session?.entries?.[slot.id];
  if (entry?.exerciseId) {
    if (entry.exerciseId === slot.exerciseId) return { exerciseId: slot.exerciseId, blocks: slot.blocks, substitution: null };
    const fromOverride = ov && ov.exerciseId === entry.exerciseId ? ov.schema : null;
    return { exerciseId: entry.exerciseId, blocks: entry.schema || fromOverride || slot.blocks, substitution: entry.substitution || "today" };
  }
  if (ovActive) return { exerciseId: ov.exerciseId, blocks: ov.schema || slot.blocks, substitution: "permanent" };
  return { exerciseId: slot.exerciseId, blocks: slot.blocks, substitution: null };
}

/* ---------- Sessions ---------- */
const sessionKey = (s) => `${s.date}|${s.createdAt || ""}`;
/**
 * Training order: cycle, then week, then date. A week-1 session logged late (or dated after a week-2 one)
 * still comes before week 2, so history, prefill and "last time" follow the programme, not the calendar.
 */
const pad4 = (n) => String(n ?? 0).padStart(4, "0");
export const sessionOrder = (d, s) => `${pad4(d.cycles?.find((c) => c.id === s.cycleId)?.number)}|${pad4(s.week)}|${sessionKey(s)}`;
export const sessionsOf = (d, cycleId) => live(d.sessions).filter((s) => s.cycleId === cycleId).sort((a, b) => (sessionOrder(d, a) > sessionOrder(d, b) ? 1 : -1));
export const doneSets = (entry) => (entry?.sets || []).filter((s) => s && s.done);
export const sessionHasWork = (s) => Object.values(s.entries || {}).some((e) => doneSets(e).length > 0);
export const openSession = (d) => live(d.sessions).filter((s) => !s.finishedAt).sort((a, b) => (sessionKey(a) > sessionKey(b) ? -1 : 1))[0] || null;

export function nextSuggestion(d, cycle) {
  const L = sheetLetters(cycle);
  const done = sessionsOf(d, cycle.id).filter((s) => s.finishedAt || sessionHasWork(s));
  if (!done.length) return { sheet: L[0], week: 1 };
  const last = done[done.length - 1];
  const i = L.indexOf(last.sheet);
  if (i >= 0 && i < L.length - 1) return { sheet: L[i + 1], week: last.week };
  return { sheet: L[0], week: Math.min(last.week + 1, cycle.weeks) };
}
export const doneInWeek = (d, cycle, sheet, week) => sessionsOf(d, cycle.id).some((s) => s.sheet === sheet && s.week === week && (s.finishedAt || sessionHasWork(s)));

/* ---------- History ---------- */
/** Every logged appearance of an exercise, newest first, across all cycles. */
export function historyFor(d, exerciseId, { before = null } = {}) {
  const out = [], limit = before && sessionOrder(d, before);
  for (const s of live(d.sessions)) {
    if (before && (s.id === before.id || sessionOrder(d, s) >= limit)) continue;
    const c = d.cycles.find((x) => x.id === s.cycleId && !x.deleted);
    if (!c) continue;
    for (const slot of c.sheets[s.sheet] || []) {
      const e = s.entries?.[slot.id];
      if (!e || !doneSets(e).length) continue;
      const r = resolveSlot(c, slot, s);
      if (r.exerciseId !== exerciseId) continue;
      out.push({ session: s, cycle: c, slot, entry: e, blocks: r.blocks });
    }
  }
  return out.sort((a, b) => (sessionOrder(d, a.session) > sessionOrder(d, b.session) ? -1 : 1));
}
/** Extra sets added beyond the coach's targets sit after the planned ones. */
export function extraIdx(entry, blocks, w) {
  const n = targetsFor(blocks, w).length, out = [];
  for (let i = n; i < n + (entry?.extra || 0); i++) out.push(i);
  return out;
}
export function countedSets(item) {
  const idx = [...countedIdx(item.blocks, item.session.week), ...extraIdx(item.entry, item.blocks, item.session.week)];
  return idx.map((i) => item.entry.sets?.[i]).filter((s) => s && s.done);
}
/** Every counted set (warm-ups excluded) with a load, logged on an exercise before a given session. */
export function loadedSetsBefore(d, exerciseId, session) {
  return historyFor(d, exerciseId, { before: session }).flatMap((h) => countedSets(h)).filter((st) => st.load != null);
}
/**
 * Whether a set is a personal record against earlier sets: a load heavier than ever ("load"), or a load already
 * lifted done for more reps than ever at that load or heavier ("reps": 10×100 after 8×100, but not 8×90 after
 * 10×100). Returns { kind, prev } with the set it beats, or null. The first time on an exercise is never a record.
 */
export function recordOf(set, earlier) {
  if (!set || set.load == null || !earlier.length) return null;
  const top = bestSet(earlier);
  if (set.load > top.load) return { kind: "load", prev: top };
  if (set.reps == null) return null;
  const same = earlier.filter((e) => e.load === set.load);
  if (!same.length) return null;
  const heavier = earlier.filter((e) => e.load >= set.load);
  if (set.reps <= Math.max(...heavier.map((e) => e.reps ?? 0))) return null;
  return { kind: "reps", prev: same.reduce((b, e) => ((e.reps ?? 0) > (b.reps ?? 0) ? e : b)) };
}
/** The best record among some sets (heaviest, then most reps, the earlier one on a full tie): { set, index, rec } or null. */
export function bestRecord(sets, earlier) {
  let out = null;
  sets.forEach((set, index) => {
    const rec = recordOf(set, earlier);
    if (!rec) return;
    if (!out || set.load > out.set.load || (set.load === out.set.load && (set.reps ?? 0) > (out.set.reps ?? 0))) out = { set, index, rec };
  });
  return out;
}
/** "105 kg (prima 100 kg)" for a heavier load, "10×100 kg (prima 8×100 kg)" for more reps. */
export const recordText = (set, rec) => (rec.kind === "load" ? `${fmtNum(set.load)} kg (prima ${fmtNum(rec.prev.load)} kg)` : `${fmtSet(set)} (prima ${fmtSet(rec.prev)})`);
export function bestSet(sets) {
  return (sets || []).reduce((b, s) => (!b || (s.load ?? 0) > (b.load ?? 0) || ((s.load ?? 0) === (b.load ?? 0) && (s.reps ?? 0) > (b.reps ?? 0)) ? s : b), null);
}
/** One set as "reps×kg": repetitions first, then the plate load with its unit. */
export const fmtSet = (s) => (s.load == null ? `${s.reps ?? "–"} rip` : `${s.reps ?? "–"}×${fmtNum(s.load)} kg`);

/* ---------- Exercise variants (e.g. progressive steps of the same movement) ---------- */
/** Variant used in a logged entry; entries logged before variants were set count as the first one. */
export const variantOf = (d, entry) => entry?.variant || exerciseOf(d, entry?.exerciseId)?.variants?.[0] || "";
/** "S1–2 a terra · S3 alla sbarra" from { week: variant }, merging consecutive weeks with the same variant. */
export function variantSummary(byWeek) {
  const weeks = Object.keys(byWeek).map(Number).sort((a, b) => a - b), out = [];
  for (const w of weeks) {
    const g = out[out.length - 1];
    if (g && g.v === byWeek[w] && g.to === w - 1) g.to = w; else out.push({ from: w, to: w, v: byWeek[w] });
  }
  return out.map((g) => `S${g.from}${g.to > g.from ? `–${g.to}` : ""} ${g.v}`).join(" · ");
}

/* ---------- Coach logbook ---------- */
export function logbookRows(d, cycle, sheet) {
  const sessions = sessionsOf(d, cycle.id).filter((s) => s.sheet === sheet);
  const rows = [];
  for (const slot of cycle.sheets[sheet] || []) {
    const ids = [slot.exerciseId];
    for (const s of sessions) {
      if (!s.entries?.[slot.id]) continue;
      const r = resolveSlot(cycle, slot, s);
      if (!ids.includes(r.exerciseId)) ids.push(r.exerciseId);
    }
    const ov = cycle.overrides?.[slot.id];
    if (ov && !ids.includes(ov.exerciseId)) ids.push(ov.exerciseId);
    for (const exId of ids) {
      const weeks = {}, variants = {};
      for (const s of sessions) {
        const e = s.entries?.[slot.id];
        if (!e) continue;
        const r = resolveSlot(cycle, slot, s);
        if (r.exerciseId !== exId) continue;
        const sets = [...logbookIdx(r.blocks, s.week), ...extraIdx(e, r.blocks, s.week)].map((i) => e.sets?.[i]).filter((x) => x && x.done);
        if (sets.length) { weeks[s.week] = sets; const v = variantOf(d, e); if (v) variants[s.week] = v; }
      }
      rows.push({ slotId: slot.id, exerciseId: exId, isSub: exId !== slot.exerciseId, originalId: slot.exerciseId, weeks, variants });
    }
  }
  return rows;
}

/* ---------- Body measurements ---------- */
export const MEASURES = [
  { k: "neck", name: "Collo", hint: "Metro a metà del collo", line: [92, 50, 108, 50] },
  { k: "shoulders", name: "Spalle", hint: "Nel punto più ampio delle spalle", line: [50, 68, 150, 68] },
  { k: "chest", name: "Petto", hint: "Sotto le ascelle, nel punto più ampio tra dorsale e petto", line: [60, 94, 140, 94] },
  { k: "arm", name: "Braccio destro", hint: "Nel punto più ampio del braccio", line: [38, 102, 64, 102] },
  { k: "waist", name: "Vita", hint: "Nel punto più stretto del girovita", line: [62, 140, 138, 140] },
  { k: "hips", name: "Fianchi", hint: "Due dita sotto l'ombelico", line: [64, 163, 136, 163] },
  { k: "glutes", name: "Gluteo", hint: "Nel punto più ampio del gluteo", line: [62, 186, 138, 186] },
  { k: "thigh", name: "Coscia destra", hint: "Nel punto più ampio della coscia", line: [62, 224, 98, 224] },
];
export const DISTRICTS = ["P", "T", "D", "S", "B", "TB", "Q", "E", "G", "A", "Z"];
export const DISTRICT_NAMES = { P: "Petto", T: "Trazioni / dorso", D: "Dorsali", S: "Spalle", B: "Bicipiti", TB: "Tricipiti", Q: "Quadricipiti", E: "Femorali / glutei", G: "Glutei", A: "Addome", Z: "Polpacci" };

/* ---------- Report ---------- */
export function plannedSessions(d, c) {
  const L = sheetLetters(c).length;
  if (c.closed) return c.weeks * L;
  const done = sessionsOf(d, c.id).filter(sessionHasWork).length;
  const w = Math.min(weekForDate(c, todayISO()), c.weeks);
  return Math.max(done, (w - 1) * L);
}

export function reportData(d, cycleIds) {
  const cycles = cyclesSorted(d).filter((c) => cycleIds.includes(c.id));
  const items = [];
  for (const c of cycles) {
    for (const s of sessionsOf(d, c.id)) {
      for (const slot of c.sheets[s.sheet] || []) {
        const e = s.entries?.[slot.id];
        if (!e || !doneSets(e).length) continue;
        const r = resolveSlot(c, slot, s);
        const item = { session: s, cycle: c, slot, entry: e, blocks: r.blocks, exerciseId: r.exerciseId };
        item.sets = countedSets(item);
        if (item.sets.length) items.push(item);
      }
    }
  }
  const sessionsDone = cycles.reduce((n, c) => n + sessionsOf(d, c.id).filter(sessionHasWork).length, 0);
  const planned = cycles.reduce((n, c) => n + plannedSessions(d, c), 0);

  const exIds = [...new Set(items.map((i) => i.exerciseId))];
  const compare = exIds.map((id) => ({
    exerciseId: id,
    name: exName(d, id),
    perCycle: cycles.map((c) => {
      const its = items.filter((i) => i.exerciseId === id && i.cycle.id === c.id);
      if (!its.length) return null;
      const weeks = its.map((i) => i.session.week);
      const first = its.filter((i) => i.session.week === Math.min(...weeks)).flatMap((i) => i.sets);
      const last = its.filter((i) => i.session.week === Math.max(...weeks)).flatMap((i) => i.sets);
      return { first: bestSet(first)?.load ?? null, last: bestSet(last)?.load ?? null };
    }),
  })).sort((a, b) => a.name.localeCompare(b.name, "it"));

  const volume = {};
  for (const i of items) {
    const dist = exerciseOf(d, i.exerciseId)?.district || "?";
    (volume[dist] ??= {})[i.cycle.id] = (volume[dist][i.cycle.id] || 0) + i.sets.length;
  }

  const history = {};
  for (const i of items) {
    (history[i.exerciseId] ??= []).push({ cycle: i.cycle, week: i.session.week, date: i.session.date, best: bestSet(i.sets), count: i.sets.length });
  }
  Object.values(history).forEach((h) => h.sort((a, b) => (a.date > b.date ? 1 : -1)));

  return { cycles, sessionsDone, planned, compare, volume, history, exerciseIds: exIds };
}

/* ---------- Chart ranges ---------- */
/**
 * What a chart shows at once: one calendar week, month, quarter or year, or the whole history.
 * `step` is what one point stands for: a day, a week (Monday to Sunday) or a month.
 */
export const RANGES = [
  { k: "W", name: "S", full: "Settimana", step: "D" },
  { k: "M", name: "M", full: "Mese", step: "D" },
  { k: "Q", name: "3M", full: "Trimestre", step: "W" },
  { k: "Y", name: "A", full: "Anno", step: "M" },
  { k: "all", name: "Tutto", full: "Tutto lo storico" },
];
const MONTH_FULL = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const cap = (s) => s.replace(/^./, (c) => c.toUpperCase());
const addMonths = (date, n) => { const d = parseISO(date); d.setDate(1); d.setMonth(d.getMonth() + n); return toISO(d); };
const monthEnd = (date) => addDays(addMonths(date, 1), -1);
const monthYear = (date) => { const d = parseISO(date); return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`; };

/** First day (ISO date) of the day, week (Monday) or month that contains `date`. */
export function bucketStart(date, step) {
  if (step === "D") return date;
  const d = parseISO(date);
  if (step === "W") { d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return toISO(d); }
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
}
const bucketEnd = (start, step) => (step === "D" ? start : step === "W" ? addDays(start, 6) : monthEnd(start));
export function bucketLabel(start, step) {
  if (step === "D") return fmtDate(start);
  if (step === "W") return `sett. ${spanText(start, addDays(start, 6), false)}`;
  const d = parseISO(start);
  return `${MONTH_FULL[d.getMonth()]} ${d.getFullYear()}`;
}
/** "2 – 8 nov 2026", "26 ott – 1 nov 2026", "29 dic 2025 – 4 gen 2026". */
function spanText(from, to, year = true) {
  const f = parseISO(from), t = parseISO(to), y = (d) => (year ? ` ${d.getFullYear()}` : "");
  if (f.getFullYear() !== t.getFullYear()) return `${f.getDate()} ${MONTHS[f.getMonth()]}${y(f)} – ${t.getDate()} ${MONTHS[t.getMonth()]}${y(t)}`;
  return `${f.getDate()}${f.getMonth() === t.getMonth() ? "" : ` ${MONTHS[f.getMonth()]}`} – ${t.getDate()} ${MONTHS[t.getMonth()]}${y(t)}`;
}

/** The calendar week, month, quarter or year `offset` periods before the one that contains `date`. */
export function rangeWindow(date, k, offset = 0) {
  if (k === "W") { const from = addDays(bucketStart(date, "W"), -7 * offset), to = addDays(from, 6); return { from, to, title: spanText(from, to) }; }
  if (k === "M") { const from = addMonths(bucketStart(date, "M"), -offset), d = parseISO(from); return { from, to: monthEnd(from), title: `${cap(MONTH_FULL[d.getMonth()])} ${d.getFullYear()}` }; }
  if (k === "Q") {
    const d = parseISO(date), from = addMonths(`${d.getFullYear()}-${pad(Math.floor(d.getMonth() / 3) * 3 + 1)}-01`, -3 * offset), to = addDays(addMonths(from, 3), -1);
    return { from, to, title: `${MONTHS[parseISO(from).getMonth()]} – ${monthYear(to)}` };
  }
  const y = parseISO(date).getFullYear() - offset;
  return { from: `${y}-01-01`, to: `${y}-12-31`, title: String(y) };
}

/** Where the date labels go. `pos` counts days from the start of the window; `edge` ticks sit on a month or year boundary. */
function rangeTicks(from, to, k) {
  // Month and year ticks: the line on the first day, the name in the middle of the month (or year) when it is spelled out.
  const out = [], days = daysBetween(from, to) + 1, at = (date, label, edge = false, mid = null) => out.push({ pos: daysBetween(from, date) + (edge ? 0 : 0.5), label, edge, mid });
  const mondays = (label) => { for (let d = bucketStart(from, "W"); d <= to; d = addDays(d, 7)) if (d >= from) at(d, label(parseISO(d))); };
  const months = (label, every = 1) => { let i = 0; for (let d = bucketStart(from, "M"); d <= to; d = addMonths(d, 1), i++) if (d >= from && i % every === 0) at(d, label(parseISO(d)), true); };
  if (k === "W") for (let i = 0; i < 7; i++) { const d = parseISO(addDays(from, i)); at(addDays(from, i), `${DAYS[d.getDay()]} ${d.getDate()}`); }
  else if (k === "M") mondays((d) => String(d.getDate()));
  else if (k === "Q" || k === "Y") for (let d = from; d <= to; d = addMonths(d, 1)) {
    const m = parseISO(d).getMonth();
    at(d, k === "Q" ? MONTHS[m] : MONTHS[m][0].toUpperCase(), true, (daysBetween(from, d) + daysBetween(from, monthEnd(d)) + 1) / 2);
  }
  else if (days <= 62) mondays((d) => `${d.getDate()} ${MONTHS[d.getMonth()]}`);
  else if (days <= 400) months((d) => (d.getMonth() ? MONTHS[d.getMonth()] : String(d.getFullYear())), days > 240 ? 2 : 1);
  else { const years = parseISO(to).getFullYear() - parseISO(from).getFullYear(), every = Math.ceil(years / 6) || 1; for (let y = parseISO(from).getFullYear() + 1, i = 0; y <= parseISO(to).getFullYear(); y++, i++) if (i % every === 0) at(`${y}-01-01`, String(y), true); }
  return out;
}

/**
 * One window of a dated series (`{ date, v, alt }`), ready to draw on a time axis.
 * `offset` 0 is the window with the newest value (never an empty one); 1 the one before, and so on.
 * Each point is the average of its day, week or month, or its best value with `best` (exercise loads).
 */
export function chartSeries(points, k, offset = 0, { best = false, today = todayISO() } = {}) {
  if (!points.length) return null;
  const dates = points.map((p) => p.date).sort(), oldest = dates[0], latest = dates[dates.length - 1];
  const range = RANGES.find((r) => r.k === k) || RANGES[1];
  let win, step;
  if (range.k === "all") {
    const span = daysBetween(oldest, latest);
    step = span <= 62 ? "D" : span <= 270 ? "W" : "M";
    win = { from: oldest, to: latest, title: oldest === latest ? fmtDate(oldest, { weekday: false, year: true }) : span <= 62 ? spanText(oldest, latest) : `${monthYear(oldest)} – ${monthYear(latest)}` };
  } else { step = range.step; win = rangeWindow(latest, range.k, offset); }
  const groups = new Map();
  for (const p of points) {
    if (p.date < win.from || p.date > win.to) continue;
    const key = bucketStart(p.date, step), g = groups.get(key) || { sum: 0, n: 0, max: -Infinity, alt: 0 };
    g.sum += p.v; g.n++; g.max = Math.max(g.max, p.v); if (p.alt) g.alt++;
    groups.set(key, g);
  }
  const buckets = [...groups].sort((a, b) => (a[0] > b[0] ? 1 : -1)).map(([start, g]) => {
    // The point sits in the middle of its day, week or month (the part inside the window).
    const a = start < win.from ? win.from : start, e = bucketEnd(start, step), b = e > win.to ? win.to : e;
    return { start, pos: (daysBetween(win.from, a) + daysBetween(win.from, b) + 1) / 2, v: best ? g.max : g.sum / g.n, n: g.n, alt: g.alt, label: bucketLabel(start, step) };
  });
  return { ...win, step, days: daysBetween(win.from, win.to) + 1, buckets, ticks: rangeTicks(win.from, win.to, range.k), when: windowAgo(win.from, range.k, today), hasOlder: range.k !== "all" && win.from > oldest, hasNewer: offset > 0 };
}

/** How far back a window is from today, in words: "questa settimana", "mese scorso", "2 trimestri fa". */
const AGO = { W: ["questa settimana", "settimana scorsa", "settimane"], M: ["questo mese", "mese scorso", "mesi"], Q: ["questo trimestre", "trimestre scorso", "trimestri"], Y: ["quest'anno", "anno scorso", "anni"] };
export function windowAgo(from, k, today = todayISO()) {
  if (!AGO[k]) return "";
  const a = parseISO(from), t = parseISO(today), months = (t.getFullYear() - a.getFullYear()) * 12 + t.getMonth() - a.getMonth();
  const n = k === "W" ? Math.round(daysBetween(from, bucketStart(today, "W")) / 7) : k === "M" ? months : k === "Q" ? Math.floor(t.getMonth() / 3) - Math.floor(a.getMonth() / 3) + (t.getFullYear() - a.getFullYear()) * 4 : t.getFullYear() - a.getFullYear();
  if (n < 0) return "";
  return n < 2 ? AGO[k][n] : `${n} ${AGO[k][2]} fa`;
}
export function daysSince(date) { return date ? daysBetween(date, todayISO()) : Infinity; }

/* ---------- Coaching payments ---------- */
const LATE_AFTER_DAYS = 30, SOON_DAYS = 3;
/** Coaching programs, newest first. */
export const plansOf = (d) => live(d.plans || []).sort((a, b) => b.number - a.number);
/** Paid instalments of a program and the next one: due 30 days after the previous payment (or the program start). */
export function statusOf(d, plan) {
  const pays = live(d.payments || []).filter((p) => p.planId === plan.id).sort((a, b) => (a.date > b.date ? 1 : -1));
  const paid = pays.reduce((a, p) => a + (p.amount || 0), 0);
  const ref = pays.length ? pays[pays.length - 1].date : plan.startDate;
  const left = Math.max(0, plan.count - pays.length);
  const dueBy = addDays(ref, LATE_AFTER_DAYS);
  return { plan, pays, paid, left, next: pays.length + 1, dueBy, due: left ? deadline(dueBy, SOON_DAYS) : { state: "ok" } };
}
/** Status of the current (newest) program, or null. */
export function planStatus(d) {
  const plan = plansOf(d)[0];
  return plan ? statusOf(d, plan) : null;
}

/* ---------- Deadlines (reminders) ---------- */
/** Days left until `due` (negative once overdue) and state: "ok", "soon" within `window` days, "over" after; no date counts as overdue. */
export function deadline(due, window) {
  if (!due) return { left: null, state: "over" };
  const left = daysBetween(todayISO(), due);
  return { left, state: left < 0 ? "over" : left <= window ? "soon" : "ok" };
}
/** "scade tra 3 gg", "scade domani", "scade oggi", "scaduto da 2 gg"; `ending` agrees the words with the subject (o, a, e = plural). */
export function dueText({ left }, ending = "o", long = false) {
  const days = (n) => (long ? `${n} ${n === 1 ? "giorno" : "giorni"}` : `${n} gg`);
  if (left == null) return `mai registrat${ending}`;
  const verb = ending === "e" ? "scadono" : "scade";
  if (left > 1) return `${verb} tra ${days(left)}`;
  if (left === 1) return `${verb} domani`;
  if (left === 0) return `${verb} oggi`;
  return `scadut${ending} da ${days(-left)}`;
}
