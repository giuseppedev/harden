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
export function fmtDelta(a, b) {
  if (a == null || b == null) return "–";
  const d = Math.round((a - b) * 10) / 10;
  return (d > 0 ? "+" : d < 0 ? "−" : "±") + fmtNum(Math.abs(d));
}
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
export function currentCycle(d) {
  const cs = cyclesSorted(d);
  return cs.filter((c) => !c.closed).pop() || cs[cs.length - 1] || null;
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
export const sessionsOf = (d, cycleId) => live(d.sessions).filter((s) => s.cycleId === cycleId).sort((a, b) => (sessionKey(a) > sessionKey(b) ? 1 : -1));
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
  const out = [];
  for (const s of live(d.sessions)) {
    if (before && (s.id === before.id || sessionKey(s) >= sessionKey(before))) continue;
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
  return out.sort((a, b) => (sessionKey(a.session) > sessionKey(b.session) ? -1 : 1));
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
/** Heaviest load ever lifted on an exercise before a given session (warm-ups excluded). */
export function bestLoadBefore(d, exerciseId, session) {
  let best = null;
  for (const h of historyFor(d, exerciseId, { before: session })) {
    for (const st of countedSets(h)) if (st.load != null && (best == null || st.load > best)) best = st.load;
  }
  return best;
}
export function bestSet(sets) {
  return (sets || []).reduce((b, s) => (!b || (s.load ?? 0) > (b.load ?? 0) || ((s.load ?? 0) === (b.load ?? 0) && (s.reps ?? 0) > (b.reps ?? 0)) ? s : b), null);
}
export const fmtSet = (s) => (s.load == null ? `${s.reps ?? "–"} rip` : `${fmtNum(s.load)}×${s.reps ?? "–"}`);

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
      const weeks = {};
      for (const s of sessions) {
        const e = s.entries?.[slot.id];
        if (!e) continue;
        const r = resolveSlot(cycle, slot, s);
        if (r.exerciseId !== exId) continue;
        const sets = [...logbookIdx(r.blocks, s.week), ...extraIdx(e, r.blocks, s.week)].map((i) => e.sets?.[i]).filter((x) => x && x.done);
        if (sets.length) weeks[s.week] = sets;
      }
      rows.push({ slotId: slot.id, exerciseId: exId, isSub: exId !== slot.exerciseId, originalId: slot.exerciseId, weeks });
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

/* ---------- Time buckets for charts ---------- */
export const GRANULARITIES = [
  { k: "D", name: "Giorno", window: 30 },
  { k: "W", name: "Settimana", window: 26 },
  { k: "M", name: "Mese", window: 12 },
  { k: "Q", name: "Trimestre", window: 8 },
  { k: "Y", name: "Anno", window: 6 },
];
/** First day (ISO date) of the bucket that contains `date`. Weeks start on Monday. */
export function bucketStart(date, g) {
  const d = parseISO(date);
  if (g === "D") return date;
  if (g === "W") { const dow = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dow); return toISO(d); }
  if (g === "M") return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`;
  if (g === "Q") return `${d.getFullYear()}-${pad(Math.floor(d.getMonth() / 3) * 3 + 1)}-01`;
  return `${d.getFullYear()}-01-01`;
}
export function shiftBucket(start, g, n) {
  const d = parseISO(start);
  if (g === "D") d.setDate(d.getDate() + n);
  else if (g === "W") d.setDate(d.getDate() + 7 * n);
  else if (g === "M") d.setMonth(d.getMonth() + n);
  else if (g === "Q") d.setMonth(d.getMonth() + 3 * n);
  else d.setFullYear(d.getFullYear() + n);
  return toISO(d);
}
export function bucketLabel(start, g, { short = false } = {}) {
  const d = parseISO(start);
  if (g === "D") return fmtDate(start, { weekday: false });
  if (g === "W") return `${short ? "" : "sett. "}${d.getDate()} ${MONTHS[d.getMonth()]}`;
  if (g === "M") return `${MONTHS[d.getMonth()]} ${short ? String(d.getFullYear()).slice(2) : d.getFullYear()}`;
  if (g === "Q") return `T${Math.floor(d.getMonth() / 3) + 1} ${short ? String(d.getFullYear()).slice(2) : d.getFullYear()}`;
  return String(d.getFullYear());
}
/**
 * Average a dated series into buckets and return one window of `window` buckets.
 * `offset` 0 is the window ending at the newest bucket; 1 is the window before it, and so on.
 */
export function bucketSeries(points, g, offset = 0) {
  const gran = GRANULARITIES.find((x) => x.k === g) || GRANULARITIES[0];
  if (!points.length) return { buckets: [], hasOlder: false, hasNewer: false };
  const sums = new Map();
  for (const p of points) {
    const k = bucketStart(p.date, g);
    const s = sums.get(k) || { sum: 0, n: 0, min: Infinity, max: -Infinity, alt: 0 };
    s.sum += p.v; s.n++; s.min = Math.min(s.min, p.v); s.max = Math.max(s.max, p.v); if (p.alt) s.alt++;
    sums.set(k, s);
  }
  const latest = points.reduce((a, p) => (p.date > a ? p.date : a), points[0].date);
  const newest = bucketStart(latest > todayISO() ? latest : todayISO(), g);
  const oldest = bucketStart(points.reduce((a, p) => (p.date < a ? p.date : a), points[0].date), g);
  const end = shiftBucket(newest, g, -offset * gran.window);
  const buckets = [];
  for (let i = gran.window - 1; i >= 0; i--) {
    const start = shiftBucket(end, g, -i);
    const s = sums.get(start);
    buckets.push({ start, label: bucketLabel(start, g), short: bucketLabel(start, g, { short: true }), v: s ? s.sum / s.n : null, n: s?.n || 0, min: s?.min, max: s?.max, alt: s?.alt || 0 });
  }
  return { buckets, hasOlder: buckets[0].start > oldest, hasNewer: offset > 0 };
}
export function daysSince(date) { return date ? daysBetween(date, todayISO()) : Infinity; }
