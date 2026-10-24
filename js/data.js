// Local data store: one JSON document kept in localStorage.
// Every record carries `updatedAt` (ISO string) and an optional `deleted` flag,
// so two copies of the document can be merged record by record.

const DATA_KEY = "gymlog.data.v1";
const DIRTY_KEY = "gymlog.dirty";

export const COLLECTIONS = ["bars", "exercises", "cycles", "sessions", "weights", "measurements", "plans", "payments"];

export const now = () => new Date().toISOString();

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export function emptyData() {
  return {
    schemaVersion: 1,
    updatedAt: now(),
    profile: { athlete: "", updatedAt: now() },
    bars: [],
    exercises: [],
    cycles: [],
    sessions: [],
    weights: [],
    measurements: [],
    plans: [],
    payments: [],
  };
}

export function normalize(d) {
  const base = emptyData();
  const out = { ...base, ...(d || {}) };
  for (const c of COLLECTIONS) if (!Array.isArray(out[c])) out[c] = [];
  if (!out.profile) out.profile = base.profile;
  return out;
}

let data = null;
const listeners = new Set();

export function load() {
  try {
    const raw = localStorage.getItem(DATA_KEY);
    data = raw ? normalize(JSON.parse(raw)) : null;
  } catch (e) {
    console.error("Could not read local data", e);
    data = null;
  }
  return data;
}

export const get = () => data;
export const hasData = () => !!data && data.cycles.some((c) => !c.deleted);

function persist() {
  try {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
  } catch (e) {
    console.error("Could not save local data", e);
    listeners.forEach((fn) => fn({ type: "storage-error", error: e }));
  }
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Replace the whole document (import, first download). */
export function replace(next, { dirty = false } = {}) {
  data = normalize(next);
  persist();
  setDirty(dirty);
  listeners.forEach((fn) => fn({ type: "replace" }));
}

/** Apply a change; `fn` receives the live document. */
export function mutate(fn) {
  if (!data) data = emptyData();
  const result = fn(data);
  data.updatedAt = now();
  persist();
  setDirty(true);
  listeners.forEach((l) => l({ type: "mutate" }));
  return result;
}

export function isDirty() {
  try { return localStorage.getItem(DIRTY_KEY) === "1"; } catch { return false; }
}

export function setDirty(v) {
  try { v ? localStorage.setItem(DIRTY_KEY, "1") : localStorage.removeItem(DIRTY_KEY); } catch { /* ignore */ }
}

export const live = (arr) => (arr || []).filter((x) => !x.deleted);

/** Insert or update a record in a collection, stamping updatedAt. */
export function upsert(d, collection, record) {
  record.updatedAt = now();
  const list = d[collection];
  const i = list.findIndex((x) => x.id === record.id);
  if (i >= 0) list[i] = record; else list.push(record);
  return record;
}

export function softDelete(d, collection, id) {
  const rec = d[collection].find((x) => x.id === id);
  if (rec) { rec.deleted = true; rec.updatedAt = now(); }
}

/** Merge two documents: for every record id the newer `updatedAt` wins. */
export function merge(a, b) {
  a = normalize(a); b = normalize(b);
  const out = normalize({ ...a });
  for (const c of COLLECTIONS) {
    const map = new Map();
    for (const r of a[c]) map.set(r.id, r);
    for (const r of b[c]) {
      const cur = map.get(r.id);
      if (!cur || (r.updatedAt || "") > (cur.updatedAt || "")) map.set(r.id, r);
    }
    out[c] = [...map.values()];
  }
  out.profile = (b.profile?.updatedAt || "") > (a.profile?.updatedAt || "") ? b.profile : a.profile;
  out.updatedAt = (a.updatedAt || "") > (b.updatedAt || "") ? a.updatedAt : b.updatedAt;
  return out;
}

/** Stable content comparison used to skip empty commits. */
export function sameContent(a, b) {
  const strip = (d) => {
    const n = normalize(d);
    const o = {};
    for (const c of COLLECTIONS) o[c] = [...n[c]].sort((x, y) => (x.id > y.id ? 1 : -1));
    o.profile = n.profile;
    return JSON.stringify(o);
  };
  return strip(a) === strip(b);
}
