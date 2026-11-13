// Parser of a program PDF, on synthetic pages laid out as a table (no real program in the repo).
import test from "node:test";
import assert from "node:assert/strict";
import { parseProgramPages, restSeconds } from "../js/pdfimport.js";

/** A centred line: x is the left edge, as pdf.js gives it. */
const at = (s, cx, y, w = s.length * 4) => ({ s, x: cx - w / 2, y, w });
const header = [
  at("Scheda A", 60, 114), at("DIS", 58, 122), at("Esercizio", 100, 130), at("Video", 145, 130), at("Descrizione", 220, 130),
  at("Note esercizio", 320, 130), at("Note progressioni", 414, 130), at("Tempo di", 475, 126), at("T.U.T", 515, 130),
  // vertical headers: their x is the middle of the column
  { s: "SERIE", x: 540, y: 134, w: 20 }, { s: "REPS", x: 553, y: 134, w: 18 }, { s: "SERIE", x: 578, y: 134, w: 20 }, { s: "REPS", x: 591, y: 134, w: 18 },
];
const sheetA = [
  ...header,
  // 1. MAV exercise: two block rows, name centred between them, wrapped video and notes
  at("P", 60, 160, 3), at("P", 60, 190, 3), at("Panca inclinata", 100, 175),
  at("https://example.c", 145, 168), at("om/v?t=9", 145, 175),
  at("Prima riga di prova", 220, 171), at("seconda riga", 220, 178.5),
  at("MAV 7: esegui 3x7 nota", 414, 160), at("di prova", 414, 167.5), at("nota della", 414, 186), at("riga sotto", 414, 193.5),
  at("3 min", 475, 175),
  at("1", 539, 160, 3), at("MA", 551, 156), at("V", 551, 163.5, 3), at("1", 577, 160, 3), at("MA", 589, 156), at("V", 589, 163.5, 3),
  at("3", 539, 190, 3), at("4", 551, 190, 3), at("3", 577, 190, 3), at("4", 589, 190, 3),
  // 2. first of a superset, reps written on two lines
  at("T", 60, 240, 3), at("Pulley triangolo", 100, 240),
  at("SUPER SET", 475, 236), at("10 sec poi", 475, 243.5),
  at("3", 539, 240, 3), at("10-", 551, 236), at("12", 551, 243.5), at("3", 577, 240, 3), at("10-", 589, 236), at("12", 589, 243.5),
  // 3. second of the superset, with a "max" block
  at("S", 60, 280, 3), at("S", 60, 300, 3), at("Alzate laterali", 100, 287), at("in piedi", 100, 294.5),
  at("SUPER SET", 475, 286), at("90 sec", 475, 293.5),
  at("2", 539, 280, 3), at("10", 551, 280, 6), at("2", 577, 280, 3), at("9", 589, 280, 3),
  at("1", 539, 300, 3), at("max", 551, 300), at("1", 577, 300, 3), at("max", 589, 300),
  // page footer across the table
  at("Riga a piè di pagina larga quanto tutta la tabella, fuori da ogni esercizio", 250, 330, 354),
];
const cover = [at("Programma", 140, 80), { s: "19 ott 2026 - 15 nov 2026", x: 162, y: 92, w: 80 }];
const days = [
  at("L", 539, 74, 3), at("M", 550, 74, 3), at("Me", 562, 74, 6), at("G", 576, 74, 3), at("V", 589, 74, 3),
  { s: "SETTIMANA 1", x: 500, y: 82, w: 30 }, at("A", 539, 82.6, 3),
];

test("parseProgramPages reads a program sheet: blocks, MAV, supersets, wrapped cells, day plan, start date", () => {
  const p = parseProgramPages([{ items: cover }, { items: days }, { items: sheetA }]);
  assert.equal(p.type, "gymlog-program");
  assert.equal(p.weeks, 2);
  assert.equal(p.startDate, "2026-10-19");
  assert.deepEqual(p.dayPlan, { A: "lun" });
  const [panca, pulley, alzate] = p.sheets.A;
  assert.equal(p.sheets.A.length, 3);
  assert.equal(panca.name, "Panca inclinata");
  assert.equal(panca.district, "P");
  assert.equal(panca.rest, 180);
  assert.equal(panca.video, "https://example.com/v?t=9");
  assert.equal(panca.description, "Prima riga di prova seconda riga");
  assert.equal(panca.progressionNote, "MAV 7: esegui 3x7 nota di prova nota della riga sotto");
  assert.deepEqual(panca.blocks, [{ mav: true, sets: [3, 3], reps: ["7", "7"] }, { sets: [3, 3], reps: ["4", "4"] }]);
  assert.deepEqual([pulley.superset, pulley.rest, pulley.blocks[0].reps], ["first", 10, ["10-12", "10-12"]]);
  assert.equal(alzate.name, "Alzate laterali in piedi");
  assert.deepEqual([alzate.superset, alzate.rest], ["second", 90]);
  assert.deepEqual(alzate.blocks, [{ sets: [2, 2], reps: ["10", "9"] }, { sets: [1, 1], reps: ["max", "max"] }]);
  assert.ok(!JSON.stringify(p).includes("piè di pagina"), "the page footer is not part of any exercise");
});

test("parseProgramPages refuses a PDF that is not a training program", () => {
  assert.throws(() => parseProgramPages([{ items: cover }, { items: [at("Fattura n. 12", 100, 100)] }]), /non sembra una scheda di allenamento/);
});

test("restSeconds reads minutes and seconds", () => {
  assert.equal(restSeconds("3 min"), 180);
  assert.equal(restSeconds("2 min 30 sec"), 150);
  assert.equal(restSeconds("120 sec"), 120);
  assert.equal(restSeconds("SUPER SET 10 sec poi"), 10);
  assert.equal(restSeconds(""), null);
});
