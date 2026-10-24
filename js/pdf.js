// PDF export built on pdf-lib (vendored, works offline): the coach logbook and the report.
import { logbookRows, exName, sheetLetters, cycleEnd, fmtRange, fmtDate, fmtNum, fmtDelta, todayISO, MEASURES, DISTRICT_NAMES, reportData } from "./logic.js";
import { live } from "./data.js";

async function lib() {
  if (window.PDFLib) return window.PDFLib;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/pdf-lib.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Non riesco a caricare il generatore PDF."));
    document.head.append(s);
  });
  return window.PDFLib;
}

// Standard PDF fonts only cover Latin-1 (WinAnsi): replace what they cannot draw.
const safe = (s) => String(s ?? "")
  .replace(/[−–—]/g, "-").replace(/→/g, "->").replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
  .replace(/[^\x20-\x7E\xA0-\xFF]/g, "");

const A4 = [595.28, 841.89];
const M = 28;

function wrap(text, font, size, maxW) {
  const words = safe(text).split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    const t = cur ? cur + " " + w : w;
    if (font.widthOfTextAtSize(t, size) <= maxW) cur = t;
    else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

/* ---------- Coach logbook: one page per sheet, 4 weeks side by side ---------- */
export async function logbookPdf(d, cycle) {
  const { PDFDocument, StandardFonts, rgb } = await lib();
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ital = await doc.embedFont(StandardFonts.HelveticaOblique);
  const black = rgb(0.07, 0.07, 0.07), gray = rgb(0.84, 0.85, 0.87), ink = rgb(0.04, 0.24, 0.66), mid = rgb(0.45, 0.45, 0.45);
  const nameW = 122, weekW = (A4[0] - 2 * M - nameW) / 4, cellW = weekW / 4, rowH = 10.5;
  const athlete = d.profile?.athlete || "";

  for (const sheet of sheetLetters(cycle)) {
    const rows = logbookRows(d, cycle, sheet);
    let page, y, pageNo = 0;
    const newPage = () => {
      page = doc.addPage(A4);
      pageNo++;
      y = A4[1] - M;
      page.drawText(safe(`Scheda ${sheet}${pageNo > 1 ? " (segue)" : ""}`), { x: M, y: y - 14, size: 16, font: bold, color: black });
      const right = safe(`${athlete}${athlete ? " · " : ""}Ciclo ${cycle.number} · ${fmtRange(cycle.startDate, cycleEnd(cycle))}`);
      page.drawText(right, { x: A4[0] - M - font.widthOfTextAtSize(right, 9), y: y - 12, size: 9, font, color: black });
      y -= 30;
      page.drawText(safe("In ogni serie: sopra le ripetizioni, sotto i kg (solo dischi). Le serie MAV non sono riportate."), { x: M, y, size: 7.5, font: ital, color: mid });
      y -= 8;
      for (let w = 0; w < 4; w++) {
        const x = M + nameW + w * weekW;
        page.drawRectangle({ x: x + 2, y: y - 14, width: weekW - 4, height: 12, borderColor: black, borderWidth: 0.8 });
        const t = `Settimana ${w + 1}`;
        page.drawText(t, { x: x + weekW / 2 - bold.widthOfTextAtSize(t, 8) / 2, y: y - 10.5, size: 8, font: bold, color: black });
      }
      y -= 20;
    };
    newPage();
    rows.forEach((r, idx) => {
      const maxSets = Math.max(8, ...Object.values(r.weeks).map((s) => s.length));
      const halves = Math.ceil(maxSets / 4);
      const blockH = halves * 3 * rowH;
      if (y - blockH < M + 14) newPage();
      const top = y;
      // name box
      page.drawRectangle({ x: M, y: top - blockH, width: nameW - 6, height: blockH, borderColor: black, borderWidth: 1 });
      page.drawText(String(idx + 1), { x: M - 9, y: top - 8, size: 7, font, color: black });
      let ty = top - 14;
      for (const line of wrap(exName(d, r.exerciseId), bold, 10, nameW - 16).slice(0, 3)) {
        page.drawText(line, { x: M + 5, y: ty, size: 10, font: bold, color: black }); ty -= 12;
      }
      if (r.isSub) for (const line of wrap(`(sost. di ${exName(d, r.originalId)})`, ital, 7.5, nameW - 16).slice(0, 2)) {
        page.drawText(line, { x: M + 5, y: ty, size: 7.5, font: ital, color: mid }); ty -= 9;
      }
      for (let w = 0; w < 4; w++) {
        const x0 = M + nameW + w * weekW;
        const sets = r.weeks[w + 1] || [];
        for (let h = 0; h < halves; h++) {
          const yh = top - h * 3 * rowH;
          for (let k = 0; k < 4; k++) {
            const x = x0 + k * cellW, n = h * 4 + k, s = sets[n];
            page.drawRectangle({ x, y: yh - rowH, width: cellW, height: rowH, color: gray, borderColor: black, borderWidth: 0.5 });
            const label = String(n + 1);
            page.drawText(label, { x: x + cellW / 2 - bold.widthOfTextAtSize(label, 6.5) / 2, y: yh - rowH + 3, size: 6.5, font: bold, color: black });
            page.drawRectangle({ x, y: yh - 2 * rowH, width: cellW, height: rowH, borderColor: black, borderWidth: 0.5 });
            page.drawRectangle({ x, y: yh - 3 * rowH, width: cellW, height: rowH, borderColor: black, borderWidth: 0.5 });
            if (s) {
              const reps = s.reps == null ? "" : String(s.reps), load = s.load == null ? "" : fmtNum(s.load);
              page.drawText(reps, { x: x + cellW / 2 - bold.widthOfTextAtSize(reps, 8) / 2, y: yh - 2 * rowH + 2.5, size: 8, font: bold, color: ink });
              page.drawText(safe(load), { x: x + cellW / 2 - bold.widthOfTextAtSize(safe(load), 8) / 2, y: yh - 3 * rowH + 2.5, size: 8, font: bold, color: ink });
            }
          }
        }
        page.drawRectangle({ x: x0, y: top - blockH, width: weekW, height: blockH, borderColor: black, borderWidth: 1.2 });
      }
      y = top - blockH - 7;
    });
  }
  stampFooter(doc, font);
  return doc.save();
}

function stampFooter(doc, font) {
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    const t = `Harden · every set, on record.   ${i + 1}/${pages.length}`;
    pg.drawText(safe(t), { x: A4[0] - M - font.widthOfTextAtSize(safe(t), 7), y: 14, size: 7, font, color: window.PDFLib.rgb(0.55, 0.55, 0.55) });
  });
}

/* ---------- Report ---------- */
export async function reportPdf(d, cycleIds, sections) {
  const { PDFDocument, StandardFonts, rgb } = await lib();
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0.08, 0.08, 0.1), mid = rgb(0.4, 0.42, 0.46), line = rgb(0.82, 0.84, 0.87), accent = rgb(0.12, 0.31, 0.82);
  const rep = reportData(d, cycleIds);
  let page, y;
  const W = A4[0] - 2 * M;
  const newPage = () => { page = doc.addPage(A4); y = A4[1] - M; };
  const need = (h) => { if (y - h < M) newPage(); };
  const text = (t, x, size = 9, f = font, color = black) => page.drawText(safe(t), { x, y, size, font: f, color });
  const heading = (t) => { need(46); y -= 24; text(t, M, 14, bold, accent); y -= 14; };
  const table = (cols, rows) => {
    // cols: [{title, w (fraction), align}]
    const widths = cols.map((c) => c.w * W);
    const drawRow = (cells, f, size, isHead) => {
      need(16);
      y -= 13;
      let x = M;
      cells.forEach((c, i) => {
        const s = safe(c);
        const tw = f.widthOfTextAtSize(s, size);
        const tx = cols[i].align === "right" ? x + widths[i] - tw - 4 : x + 4;
        page.drawText(s, { x: tx, y, size, font: f, color: isHead ? mid : black });
        x += widths[i];
      });
      page.drawLine({ start: { x: M, y: y - 4 }, end: { x: M + W, y: y - 4 }, thickness: 0.5, color: line });
    };
    drawRow(cols.map((c) => c.title.toUpperCase()), bold, 7.5, true);
    rows.forEach((r) => drawRow(r, font, 9, false));
    y -= 6;
  };

  newPage();
  text("Report allenamenti", M, 20, bold);
  y -= 16;
  text(`${d.profile?.athlete || ""} · ${rep.cycles.map((c) => `Ciclo ${c.number}`).join(", ")} · generato il ${fmtDate(todayISO(), { year: true })}`, M, 9, font, mid);
  y -= 6;

  if (sections.has("sum")) {
    heading("Riepilogo");
    table([{ title: "Cicli", w: 0.33 }, { title: "Sessioni fatte", w: 0.33 }, { title: "Aderenza", w: 0.34 }],
      [[String(rep.cycles.length), String(rep.sessionsDone), rep.planned ? `${Math.round((rep.sessionsDone / rep.planned) * 100)}%` : "-"]]);
  }
  if (sections.has("cmp")) {
    heading("Confronto tra cicli");
    text("Carico migliore a inizio e fine ciclo, solo dischi.", M, 8, font, mid); y -= 4;
    const n = rep.cycles.length;
    table([{ title: "Esercizio", w: 0.4 }, ...rep.cycles.map((c) => ({ title: `Ciclo ${c.number}`, w: 0.6 / n, align: "right" }))],
      rep.compare.map((r) => [r.name, ...r.perCycle.map((p) => (p ? `${fmtNum(p.first) || "-"} -> ${fmtNum(p.last) || "-"}` : "-"))]));
  }
  if (sections.has("vol")) {
    heading("Volume per distretto");
    text("Serie totali fatte nel ciclo. Del MAV conta solo l'ultima serie.", M, 8, font, mid); y -= 4;
    const n = rep.cycles.length;
    table([{ title: "Distretto", w: 0.4 }, ...rep.cycles.map((c) => ({ title: `Ciclo ${c.number}`, w: 0.6 / n, align: "right" }))],
      Object.keys(rep.volume).sort().map((k) => [`${k} · ${DISTRICT_NAMES[k] || ""}`, ...rep.cycles.map((c) => String(rep.volume[k][c.id] || 0))]));
  }
  if (sections.has("meas")) {
    const ms = live(d.measurements).sort((a, b) => (a.date > b.date ? 1 : -1));
    const ws = live(d.weights).sort((a, b) => (a.date > b.date ? 1 : -1));
    heading("Misure e peso");
    if (ms.length) {
      const f = ms[0], l = ms[ms.length - 1];
      table([{ title: "Misura (cm)", w: 0.4 }, { title: fmtDate(f.date, { weekday: false, year: true }), w: 0.2, align: "right" }, { title: fmtDate(l.date, { weekday: false, year: true }), w: 0.2, align: "right" }, { title: "Diff.", w: 0.2, align: "right" }],
        MEASURES.map((m) => [m.name, fmtNum(f.values[m.k]) || "-", fmtNum(l.values[m.k]) || "-", fmtDelta(l.values[m.k], f.values[m.k])]));
    } else { need(14); y -= 12; text("Nessuna misurazione registrata.", M, 9, font, mid); y -= 4; }
    if (ws.length) {
      const f = ws[0], l = ws[ws.length - 1];
      table([{ title: "Peso", w: 0.4 }, { title: fmtDate(f.date, { weekday: false, year: true }), w: 0.2, align: "right" }, { title: fmtDate(l.date, { weekday: false, year: true }), w: 0.2, align: "right" }, { title: "Diff.", w: 0.2, align: "right" }],
        [["kg", fmtNum(f.kg), fmtNum(l.kg), fmtDelta(l.kg, f.kg)]]);
    }
  }
  if (sections.has("ex")) {
    heading("Storico esercizi");
    const ids = rep.exerciseIds.slice().sort((a, b) => exName(d, a).localeCompare(exName(d, b), "it"));
    for (const id of ids) {
      need(50);
      y -= 14;
      text(exName(d, id), M, 10.5, bold);
      y -= 2;
      table([{ title: "Ciclo", w: 0.15 }, { title: "Sett.", w: 0.15 }, { title: "Data", w: 0.25 }, { title: "Serie migliore", w: 0.3, align: "right" }, { title: "Serie", w: 0.15, align: "right" }],
        rep.history[id].map((h) => [`Ciclo ${h.cycle.number}`, `S${h.week}`, fmtDate(h.date, { weekday: false, year: true }), h.best?.load == null ? `${h.best?.reps ?? "-"} rip` : `${fmtNum(h.best.load)} kg x ${h.best.reps ?? "-"}`, String(h.count)]));
    }
  }
  stampFooter(doc, font);
  return doc.save();
}

/** Hand a file to the iPhone share sheet (WhatsApp, Mail, Files…); fall back to a download. */
export async function deliverFile(bytes, filename, type) {
  const blob = new Blob([bytes], { type });
  const file = new File([blob], filename, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return "shared"; }
    catch (e) { if (e.name === "AbortError") return "cancelled"; }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return "downloaded";
}
