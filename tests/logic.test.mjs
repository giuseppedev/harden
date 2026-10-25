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

test("bucketSeries: day view is one calendar week, month view one year", () => {
  const pts = [{ date: today, v: 78 }, { date: L.addDays(today, -1), v: 78.2 }, { date: L.addDays(today, -9), v: 79 }];
  const wk = L.bucketSeries(pts, "D", 0);
  assert.equal(wk.buckets.length, 7);
  assert.equal(wk.buckets[0].start, L.bucketStart(today, "W"));
  assert.equal(L.bucketSeries(pts, "M", 0).buckets.length, 12);
  assert.equal(L.bucketSeries(pts, "D", 1).title.length > 0, true);
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
