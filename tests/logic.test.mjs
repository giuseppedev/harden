// Unit tests for the pure logic and the record merge. Run with: node --test tests/
import test from "node:test";
import assert from "node:assert/strict";
import * as L from "../js/logic.js";
import { merge } from "../js/data.js";

const today = L.todayISO();
const slot = { id: "A1", exerciseId: "bench", blocks: [{ sets: [3, 3, 3, 3], reps: ["10", "10", "8", "8"] }] };
const cycle = (over = {}) => ({ id: "c1", number: 1, startDate: L.addDays(today, -10), weeks: 4, sheets: { A: [slot] }, overrides: {}, ...over });

test("resolveSlot: a frozen schema survives removing the override", () => {
  const schema = [{ sets: [2, 2, 2, 2], reps: ["12", "12", "12", "12"] }];
  const c = cycle({ overrides: { A1: { exerciseId: "fly", fromWeek: 1, schema } } });
  const s = { week: 2, entries: { A1: { exerciseId: "fly", substitution: "permanent", schema, sets: [] } } };
  assert.deepEqual(L.resolveSlot(c, slot, s).blocks, schema);
  c.overrides = {};
  assert.deepEqual(L.resolveSlot(c, slot, s).blocks, schema);
});

test("freezeSubstitutionSchemas copies the override scheme into old entries", () => {
  const schema = [{ sets: [2, 2, 2, 2], reps: ["12", "12", "12", "12"] }];
  const d = { cycles: [cycle({ overrides: { A1: { exerciseId: "fly", fromWeek: 1, schema } } })], sessions: [{ id: "s", cycleId: "c1", week: 2, entries: { A1: { exerciseId: "fly", substitution: "permanent", sets: [] } } }] };
  assert.equal(L.freezeSubstitutionSchemas(d, "now"), true);
  assert.deepEqual(d.sessions[0].entries.A1.schema, schema);
  assert.equal(L.freezeSubstitutionSchemas(d, "now"), false);
});

test("currentCycle waits for a program that starts in the future", () => {
  const d = { cycles: [cycle(), cycle({ id: "c2", number: 2, startDate: L.addDays(today, 4) })] };
  assert.equal(L.currentCycle(d).id, "c1");
  d.cycles[1].startDate = today;
  assert.equal(L.currentCycle(d).id, "c2");
});

test("closeSupersededCycles closes the old cycle only once the new one has started", () => {
  const d = { cycles: [cycle(), cycle({ id: "c2", number: 2, startDate: L.addDays(today, 4) })] };
  assert.equal(L.closeSupersededCycles(d, "now"), false);
  d.cycles[1].startDate = L.addDays(today, -1);
  assert.equal(L.closeSupersededCycles(d, "now"), true);
  assert.equal(d.cycles[0].closed, true);
  d.cycles[0].closed = false; d.cycles[0].keepOpen = true;
  assert.equal(L.closeSupersededCycles(d, "now"), false, "a cycle reopened by hand stays open");
});

test("nextSuggestion moves to the next sheet, then to the next week", () => {
  const c = cycle({ sheets: { A: [slot], B: [{ ...slot, id: "B1" }] } });
  const done = (sheet, week, date) => ({ id: sheet + week, cycleId: "c1", sheet, week, date, createdAt: date, finishedAt: date, entries: {} });
  assert.deepEqual(L.nextSuggestion({ sessions: [] }, c), { sheet: "A", week: 1 });
  assert.deepEqual(L.nextSuggestion({ sessions: [done("A", 1, "2026-01-01")] }, c), { sheet: "B", week: 1 });
  assert.deepEqual(L.nextSuggestion({ sessions: [done("A", 1, "2026-01-01"), done("B", 1, "2026-01-02")] }, c), { sheet: "A", week: 2 });
});

test("historyFor follows the programme: a week-1 session logged late still comes before week 2", () => {
  const c = cycle({ sheets: { A: [slot], C: [{ ...slot, id: "C1" }] } });
  const set = { done: true, reps: 10, load: 50 };
  const ses = (id, sheet, week, date) => ({ id, cycleId: "c1", sheet, week, date, createdAt: date, finishedAt: date, entries: { [sheet + "1"]: { sets: [set] } } });
  const a1 = ses("a1", "A", 1, "2026-01-01"), c1 = ses("c1s", "C", 1, "2026-01-09"), a2 = ses("a2", "A", 2, "2026-01-08");
  const d = { cycles: [c], sessions: [a1, c1, a2] };
  assert.deepEqual(L.historyFor(d, "bench", { before: a2 }).map((h) => h.session.id), ["c1s", "a1"]);
  assert.deepEqual(L.historyFor(d, "bench").map((h) => h.session.id), ["a2", "c1s", "a1"]);
});

test("recordOf: heavier load, or more reps at a load already lifted", () => {
  const earlier = [{ load: 100, reps: 8 }, { load: 90, reps: 10 }, { load: 80, reps: 12 }];
  assert.equal(L.recordOf({ load: 105, reps: 3 }, earlier).kind, "load");
  assert.deepEqual(L.recordOf({ load: 100, reps: 10 }, earlier), { kind: "reps", prev: { load: 100, reps: 8 } });
  assert.equal(L.recordOf({ load: 100, reps: 8 }, earlier), null, "same reps is not a record");
  assert.equal(L.recordOf({ load: 90, reps: 9 }, earlier), null);
  assert.equal(L.recordOf({ load: 80, reps: 10 }, earlier), null, "10×90 already beats it");
  assert.equal(L.recordOf({ load: 95, reps: 12 }, earlier), null, "a load never lifted is not a reps record");
  assert.equal(L.recordOf({ load: 50, reps: 5 }, []), null, "the first time is never a record");
  const best = L.bestRecord([{ load: 100, reps: 9 }, { load: 100, reps: 11 }, { load: 90, reps: 12 }], earlier);
  assert.deepEqual([best.index, best.rec.kind], [1, "reps"]);
  assert.equal(L.recordText({ load: 100, reps: 11 }, best.rec), "11×100 kg (prima 8×100 kg)");
});

test("chart ranges: calendar week, month, quarter and year", () => {
  assert.deepEqual(L.rangeWindow("2026-11-06", "W"), { from: "2026-11-02", to: "2026-11-08", title: "2 – 8 nov 2026" });
  assert.equal(L.rangeWindow("2026-11-06", "W", 1).title, "26 ott – 1 nov 2026");
  assert.deepEqual(L.rangeWindow("2026-11-06", "M", 1), { from: "2026-10-01", to: "2026-10-31", title: "Ottobre 2026" });
  assert.deepEqual(L.rangeWindow("2026-11-06", "Q"), { from: "2026-10-01", to: "2026-12-31", title: "ott – dic 2026" });
  assert.equal(L.rangeWindow("2026-11-06", "Q", 4).title, "ott – dic 2025");
  assert.deepEqual(L.rangeWindow("2026-03-31", "M", 1), { from: "2026-02-01", to: "2026-02-28", title: "Febbraio 2026" });
  assert.equal(L.rangeWindow("2026-11-06", "Y", 1).title, "2025");
});

test("chartSeries: days sit on a time axis, empty days leave no point", () => {
  const pts = [{ date: "2026-10-02", v: 65.7 }, { date: "2026-10-14", v: 65.45 }, { date: "2026-10-14", v: 65.55 }, { date: "2026-11-03", v: 66 }];
  const oct = L.chartSeries(pts, "M", 1, { today: "2026-11-06" });
  assert.equal(oct.days, 31);
  assert.deepEqual(oct.buckets.map((b) => [b.start, b.pos, +b.v.toFixed(2), b.n]), [["2026-10-02", 1.5, 65.7, 1], ["2026-10-14", 13.5, 65.5, 2]]);
  assert.deepEqual(oct.ticks.map((t) => t.label), ["5", "12", "19", "26"]);
  assert.equal(oct.when, "mese scorso");
  assert.equal(oct.hasNewer && !oct.hasOlder, true);
  const nov = L.chartSeries(pts, "M", 0, { today: "2026-11-06" });
  assert.equal(nov.title, "Novembre 2026");
  assert.equal(nov.when, "questo mese");
  const wk = L.chartSeries(pts, "W", 0, { today: "2026-11-06" });
  assert.deepEqual(wk.ticks.map((t) => t.label), ["lun 2", "mar 3", "mer 4", "gio 5", "ven 6", "sab 7", "dom 8"]);
  const q = L.chartSeries(pts, "Q", 0, { today: "2026-11-06", best: true });
  assert.equal(q.step, "W");
  assert.deepEqual(q.buckets.map((b) => b.v), [65.7, 65.55, 66]); // best of each week, not the average
  assert.deepEqual(q.ticks.map((t) => t.label), ["ott", "nov", "dic"]);
  const all = L.chartSeries(pts, "all", 0, { today: "2026-11-06" });
  assert.equal(all.from, "2026-10-02");
  assert.equal(all.hasOlder, false);
});

test("windowAgo says how far back a window is", () => {
  assert.equal(L.windowAgo("2026-11-02", "W", "2026-11-06"), "questa settimana");
  assert.equal(L.windowAgo("2026-10-26", "W", "2026-11-06"), "settimana scorsa");
  assert.equal(L.windowAgo("2026-10-12", "W", "2026-11-06"), "3 settimane fa");
  assert.equal(L.windowAgo("2026-08-01", "M", "2026-11-06"), "3 mesi fa");
  assert.equal(L.windowAgo("2026-07-01", "Q", "2026-11-06"), "trimestre scorso");
  assert.equal(L.windowAgo("2025-10-01", "Q", "2026-11-06"), "4 trimestri fa");
  assert.equal(L.windowAgo("2024-01-01", "Y", "2026-11-06"), "2 anni fa");
});

test("deadline and dueText count down, then count the days overdue", () => {
  assert.equal(L.dueText(L.deadline(L.addDays(today, 2), 3)), "scade tra 2 gg");
  assert.equal(L.dueText(L.deadline(L.addDays(today, 1), 3)), "scade domani");
  assert.equal(L.dueText(L.deadline(today, 3)), "scade oggi");
  assert.equal(L.dueText(L.deadline(L.addDays(today, -3), 3), "e"), "scadute da 3 gg");
  assert.equal(L.deadline(L.addDays(today, 9), 3).state, "ok");
  assert.equal(L.deadline(null, 3).state, "over");
});

test("coaching: next instalment due 30 days after the last payment", () => {
  const d = { plans: [{ id: "p", number: 1, startDate: "2026-10-13", endDate: "2027-10-12", total: 1300, count: 4 }], payments: [{ id: "q", planId: "p", date: "2026-10-13", amount: 325 }] };
  const st = L.planStatus(d);
  assert.equal(st.next, 2);
  assert.equal(st.dueBy, "2026-11-12");
  assert.equal(st.paid, 325);
});

test("merge keeps the newer version of each record, deletions included", () => {
  const a = { cycles: [], weights: [{ id: "w1", kg: 78, updatedAt: "2026-10-01" }, { id: "w2", kg: 77, updatedAt: "2026-10-05" }] };
  const b = { cycles: [], weights: [{ id: "w1", kg: 77.5, updatedAt: "2026-10-03" }, { id: "w2", kg: 77, deleted: true, updatedAt: "2026-10-02" }], plans: [{ id: "p", updatedAt: "2026-10-04" }] };
  const m = merge(a, b);
  assert.equal(m.weights.find((w) => w.id === "w1").kg, 77.5);
  assert.equal(m.weights.find((w) => w.id === "w2").deleted, undefined);
  assert.equal(m.plans.length, 1);
});

test("fmtSet writes reps first, then kg", () => {
  assert.equal(L.fmtSet({ reps: 3, load: 45 }), "3×45 kg");
  assert.equal(L.fmtSet({ reps: 18, load: null }), "18 rip");
});

test("similarity and catalogMatches: same name, similar name, new", () => {
  assert.equal(L.similarity("Row machine (presa stretta)", "row machine presa stretta"), 1);
  assert.ok(L.similarity("Row machine (presa stretta)", "Row machine stretta") < 1);
  const cat = [{ id: "a", name: "Row machine stretta" }, { id: "b", name: "Row machine (presa stretta)", deleted: true }, { id: "c", name: "Squat" }];
  const m = L.catalogMatches(cat, "Row machine (presa stretta)");
  assert.equal(m.kind, "sim");
  assert.deepEqual(m.cands.map((c) => c.ex.id), ["a"], "deleted exercises are never offered");
  assert.equal(L.catalogMatches(cat, "squat").kind, "ok");
  assert.equal(L.catalogMatches([], "Squat").kind, "new");
  assert.equal(L.catalogMatches(cat, "Leg raises a terra").kind, "new");
});

test("cycleEnd: a cycle closed early ends on its endDate, and plans only the weeks it lasted", () => {
  const c = cycle({ startDate: "2026-10-19", weeks: 4, sheets: { A: [slot], B: [{ ...slot, id: "B1" }] } });
  assert.equal(L.cycleEnd(c), "2026-11-15");
  const cut = { ...c, endDate: "2026-10-23", closed: true };
  assert.equal(L.cycleEnd(cut), "2026-10-23");
  assert.equal(L.plannedSessions({ sessions: [] }, cut), 2, "one week of two sheets");
});
