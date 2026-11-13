// Reads a training program PDF laid out as a table (one page per sheet: exercise, notes, rest, sets and reps per week)
// into the program object used by the import. pdf.js is loaded only here, when a PDF is picked. parseProgramPages is
// pure, so it is tested in Node.

const MONTHS = { gen: 1, feb: 2, mar: 3, apr: 4, mag: 5, giu: 6, lug: 7, ago: 8, set: 9, ott: 10, nov: 11, dic: 12 };
const DAY_COLUMNS = { L: "lun", M: "mar", Me: "mer", G: "gio", V: "ven", S: "sab", D: "dom" };
const COLUMNS = [["name", /^Esercizio$/], ["video", /^Video$/], ["description", /^Descrizione$/], ["exerciseNote", /^Note esercizio$/],
  ["progressionNote", /^Note progressioni$/], ["rest", /^Tempo di$/], ["tut", /^T\.?U\.?T\.?$/]];
const NOT_A_SHEET = "Questo PDF non sembra una scheda di allenamento: non trovo le pagine \"Scheda A\", \"Scheda B\"…";

const mid = (it) => it.x + it.w / 2;
const pad = (n) => String(n).padStart(2, "0");
/** "19 ott 2026" → "2026-10-19". */
function isoDate(text) {
  const m = /(\d{1,2})\s+([a-z]{3})\w*\s+(\d{4})/i.exec(text || "");
  return m && MONTHS[m[2].toLowerCase()] ? `${m[3]}-${pad(MONTHS[m[2].toLowerCase()])}-${pad(m[1])}` : null;
}
/** Lines of one cell, top to bottom, joined; a line ending with "-" continues the next one without a space. */
function joinLines(lines, sep = " ") {
  return lines.slice().sort((a, b) => a.y - b.y || a.x - b.x).map((l) => l.s.trim())
    .reduce((acc, s) => (!acc ? s : acc.endsWith("-") ? acc + s : acc + sep + s), "");
}
/** "3 min", "120 sec", "2 min 30 sec", "SUPER SET 10 sec poi …" → seconds. */
export function restSeconds(text) {
  const min = /(\d+)\s*min/i.exec(text), sec = /(\d+)\s*sec/i.exec(text);
  return (min ? +min[1] * 60 : 0) + (sec ? +sec[1] : 0) || null;
}
/** Groups lines that sit close together vertically into clusters: lines of one cell are ~7.5 apart, cells 11+. */
function clusters(lines, gap = 9) {
  const out = [];
  for (const l of lines.slice().sort((a, b) => a.y - b.y)) {
    const last = out[out.length - 1];
    if (last && l.y - last[last.length - 1].y <= gap) last.push(l); else out.push([l]);
  }
  return out;
}

/** One sheet page → its letter and exercises, or null when the page is not a sheet. */
function parseSheetPage(items) {
  const title = items.find((i) => /^Scheda [A-Z]$/.test(i.s.trim()));
  const head = items.find((i) => i.s.trim() === "Esercizio");
  if (!title || !head) return null;
  // Columns: the centre of each header; a line belongs to the column whose range holds its centre.
  const near = (i) => Math.abs(i.y - head.y) < 12;
  const anchors = COLUMNS.map(([k, re]) => { const h = items.find((i) => near(i) && re.test(i.s.trim())); return h && { k, c: mid(h) }; }).filter(Boolean);
  const serie = items.filter((i) => near(i) && /^SERIE$/i.test(i.s.trim())).sort((a, b) => a.x - b.x);
  const reps = items.filter((i) => near(i) && /^REPS$/i.test(i.s.trim())).sort((a, b) => a.x - b.x);
  if (!serie.length || serie.length !== reps.length) return null;
  const weekStart = serie[0].x - 8;
  const nameCol = anchors.find((a) => a.k === "name");
  const distEdge = nameCol.c - 30; // the district letters sit left of the exercise names
  const colOf = (i) => {
    const c = mid(i);
    if (c < distEdge) return "district";
    if (i.x >= weekStart) return "week";
    let best = null;
    for (const a of anchors) if (!best || Math.abs(a.c - c) < Math.abs(best.c - c)) best = a;
    return best.k;
  };
  const body = items.filter((i) => i.y > head.y + 9 && i.w < 200 && i.s.trim()); // wide lines are page footers
  const byCol = {};
  for (const i of body) (byCol[colOf(i)] ??= []).push(i);

  // Rows: every district letter is a block row; name lines grouped into exercises; each block joins the nearest exercise.
  const blocks = (byCol.district || []).filter((i) => /^[A-Z]{1,2}$/.test(i.s.trim())).sort((a, b) => a.y - b.y);
  const names = clusters(byCol.name || []).map((g) => ({ lines: g, cy: (g[0].y + g[g.length - 1].y) / 2, blocks: [] }));
  if (!names.length || !blocks.length) return null;
  for (const b of blocks) names.reduce((best, n) => (Math.abs(n.cy - b.y) < Math.abs(best.cy - b.y) ? n : best)).blocks.push(b);
  const exs = names.filter((n) => n.blocks.length);
  // Every other cell (a cluster of lines, centred on its exercise's rows) goes to the exercise with the nearest centre.
  const centre = (n) => (n.blocks[0].y + n.blocks[n.blocks.length - 1].y) / 2;
  const cell = (k) => {
    const m = new Map(exs.map((e) => [e, []]));
    for (const g of clusters(byCol[k] || [])) {
      const cy = (g[0].y + g[g.length - 1].y) / 2;
      m.get(exs.reduce((best, e) => (Math.abs(centre(e) - cy) < Math.abs(centre(best) - cy) ? e : best))).push(...g);
    }
    return m;
  };
  const cells = Object.fromEntries(["video", "description", "exerciseNote", "progressionNote", "rest", "tut"].map((k) => [k, cell(k)]));
  const allBlocks = exs.flatMap((e) => e.blocks);
  const weekLines = new Map(allBlocks.map((b) => [b, []]));
  for (const i of byCol.week || []) weekLines.get(allBlocks.reduce((best, b) => (Math.abs(b.y - i.y) < Math.abs(best.y - i.y) ? b : best))).push(i);

  const exercises = exs.map((e) => {
    const text = (k, sep) => joinLines(cells[k].get(e), sep);
    const progressionNote = text("progressionNote"), restText = text("rest");
    const mav = /MAV\s*(\d+)\D*?(\d+)\s*[x×]\s*(\d+)/i.exec(progressionNote);
    return {
      name: joinLines(e.lines), district: e.blocks[0].s.trim(),
      rest: restSeconds(restText), superset: /SUPER\s*SET/i.test(restText) ? "pair" : null,
      tut: text("tut"), video: text("video", "").replace(/\s+/g, ""), description: text("description"),
      exerciseNote: text("exerciseNote"), progressionNote,
      blocks: e.blocks.map((b) => {
        const lines = weekLines.get(b), sets = [], rep = [];
        serie.forEach((s, w) => {
          // Each week has a sets column and a reps column: a line belongs to the nearer of the two.
          // SERIE and REPS are written vertically: their x is already the middle of the column.
          const sc = s.x, rc = reps[w].x, mine = lines.filter((l) => { const c = mid(l); return Math.min(Math.abs(c - sc), Math.abs(c - rc)) < 9; });
          sets.push(joinLines(mine.filter((l) => Math.abs(mid(l) - sc) <= Math.abs(mid(l) - rc))));
          rep.push(joinLines(mine.filter((l) => Math.abs(mid(l) - sc) > Math.abs(mid(l) - rc))));
        });
        if (rep.every((r) => /^MA\s?V$/i.test(r))) return { mav: true, sets: sets.map(() => (mav ? +mav[2] : 3)), reps: sets.map(() => (mav ? mav[1] : "")) };
        return { sets: sets.map((x) => (/^\d+$/.test(x) ? +x : x)), reps: rep.map((r) => r.replace(/\s*-\s*/g, "-")) };
      }),
    };
  });
  // Supersets come in pairs, one after the other: the first of a pair, then the one that closes it.
  let open = false;
  for (const x of exercises) { if (x.superset) { x.superset = open ? "second" : "first"; open = !open; } else open = false; }
  return { letter: title.s.trim().slice(-1), weeks: serie.length, exercises };
}

/** Suggested weekday per sheet, from a weekday grid (L M Me G V S D) with a "Settimana 1" row of sheet letters. */
function parseDayPlan(items) {
  const w1 = items.find((i) => /^SETTIMANA 1$/i.test(i.s.trim()));
  const l = items.find((i) => i.s.trim() === "L" && items.some((m) => m.s.trim() === "Me" && Math.abs(m.y - i.y) < 2));
  if (!l || !w1) return {};
  const days = items.filter((i) => Math.abs(i.y - l.y) < 2 && DAY_COLUMNS[i.s.trim()]);
  const plan = {};
  for (const i of items.filter((x) => Math.abs(x.y - w1.y) < 2 && /^[A-Z]$/.test(x.s.trim()) && x.x > w1.x + w1.w)) {
    const day = days.reduce((best, d) => (!best || Math.abs(mid(d) - mid(i)) < Math.abs(mid(best) - mid(i)) ? d : best), null);
    if (day) plan[i.s.trim()] = DAY_COLUMNS[day.s.trim()];
  }
  return plan;
}

/** Positioned text lines of every page → { type, weeks, startDate, dayPlan, sheets }. Throws when it is not a program. */
export function parseProgramPages(pages) {
  const sheets = {};
  let weeks = 0, startDate = null, dayPlan = {};
  for (const { items } of pages) {
    // The program's period: the first "19 ott 2026 - 15 nov 2026" style range.
    const range = !startDate && items.find((i) => /\d{1,2}\s+[a-z]{3}\w*\s+\d{4}\s*-\s*\d{1,2}\s+[a-z]{3}/i.test(i.s));
    if (range) startDate = isoDate(range.s);
    if (!Object.keys(dayPlan).length) dayPlan = parseDayPlan(items);
    const sh = parseSheetPage(items);
    if (sh && sh.exercises.length) { sheets[sh.letter] = sh.exercises; weeks = Math.max(weeks, sh.weeks); }
  }
  if (!Object.keys(sheets).length) throw new Error(NOT_A_SHEET);
  return { type: "gymlog-program", weeks, startDate, dayPlan, sheets };
}

/** Reads a PDF file with pdf.js (loaded now) and parses it. onProgress(done, total) runs after each page. */
export async function readProgramPdf(file, onProgress = () => {}) {
  const pdfjs = await import(new URL("../vendor/pdfjs/pdf.min.mjs", import.meta.url).href);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("../vendor/pdfjs/pdf.worker.min.mjs", import.meta.url).href;
  let doc;
  try { doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; }
  catch { throw new Error("Non riesco ad aprire il PDF: è protetto o rovinato?"); }
  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n), h = page.getViewport({ scale: 1 }).height;
    const tc = await page.getTextContent();
    pages.push({ items: tc.items.filter((i) => i.str?.trim()).map((i) => ({ s: i.str, x: i.transform[4], y: h - i.transform[5], w: i.width })) });
    onProgress(n, doc.numPages);
  }
  doc.destroy();
  return parseProgramPages(pages);
}
