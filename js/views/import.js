// Guided import of a new cycle from a program PDF (or a program .json): reading, overview, one exercise per step,
// review, done. Each exercise is matched to the catalog (same name, similar name to confirm, or new). The draft lives
// in localStorage, so closing the app halfway resumes the import.
import * as store from "../data.js";
import * as L from "../logic.js";
import { $, $$, esc, D, ui, actions, inputs, changes, toast, go, runSync } from "../core.js";
import { readProgramPdf } from "../pdfimport.js";

const DRAFT_KEY = "harden.importDraft";
const QUICK_RESTS = [60, 90, 120, 150, 180];
let imp = loadDraft();

function loadDraft() {
  try { const x = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); return x && x.screen !== "reading" ? x : null; } catch { return null; }
}
function saveDraft() {
  try { imp && imp.screen !== "reading" && imp.screen !== "done" ? localStorage.setItem(DRAFT_KEY, JSON.stringify(imp)) : localStorage.removeItem(DRAFT_KEY); } catch { /* storage full: the import still works in memory */ }
}
export const hasImportDraft = () => !!imp && imp.screen !== "done";

const restText = (s) => (!s ? "–" : s >= 60 ? `${Math.floor(s / 60)}′${s % 60 ? ` ${s % 60}″` : ""}` : `${s}″`);
const cellText = (b, w) => (b.sets[w] == null ? b.reps[w] || "" : `${b.sets[w]}×${b.reps[w]}`);
const nextNumber = (d) => Math.max(0, ...store.live(d.cycles).map((c) => c.number)) + 1;
/**
 * Past periods belong to the cycles already logged: a new cycle starts after the start of the latest cycle and after
 * the last session logged, so no session already done falls inside the new cycle's period.
 */
const latestCycle = (d) => L.cyclesSorted(d).pop() || null;
const lastSessionDate = (d) => store.live(d.sessions).filter(L.sessionHasWork).map((s) => s.date).sort().pop() || null;
function earliestStart(d) {
  const c = latestCycle(d), last = lastSessionDate(d);
  if (!c) return null;
  const a = L.addDays(c.startDate, 1), b = last ? L.addDays(last, 1) : a;
  return a > b ? a : b;
}
const tooEarly = (d, date) => { const min = earliestStart(d); return !!min && date < min; };
/** The cycle the new one would cut short, when the start date falls inside its planned period. */
const overlapped = (d) => { const c = latestCycle(d); return c && imp.start <= L.cycleEnd(c) ? c : null; };
const day = (iso) => L.fmtDate(iso, { weekday: false });
/** Dates come first: when the new program overlaps the running cycle, ask to close it the day before the new start. */
function datesCard(d) {
  const c = overlapped(d);
  if (!c) return "";
  const close = L.addDays(imp.start, -1), last = lastSessionDate(d), logged = last && last >= c.startDate;
  if (imp.overlapOk) return `<div class="imp-dates ok"><b>✓ Ciclo ${c.number} fino al ${esc(day(close))}, ciclo ${imp.number} dal ${esc(day(imp.start))}.</b>
    <button class="link" data-act="imp-dates-change">Modifica</button></div>`;
  const plan = !imp.picked && imp.read !== imp.start
    ? `Sul PDF la nuova scheda inizia il ${esc(day(imp.read))}, quando è ancora in corso il ciclo ${c.number} (previsto fino al ${esc(day(L.cycleEnd(c)))}).`
    : `Il ciclo ${c.number} è previsto fino al ${esc(day(L.cycleEnd(c)))}, ma il ciclo ${imp.number} inizierebbe il ${esc(day(imp.start))}.`;
  return `<div class="imp-dates"><b>La nuova scheda si sovrappone al ciclo ${c.number}</b>
    <span>${plan} ${logged ? `Gli allenamenti già registrati, fino al ${esc(day(last))}, restano nel ciclo ${c.number}.` : `Gli allenamenti già registrati restano nel ciclo ${c.number}.`}</span>
    <span>Proposta: il ciclo ${c.number} si chiude il ${esc(day(close))} e il ciclo ${imp.number} inizia il ${esc(day(imp.start))}.</span>
    <button class="btn" data-act="imp-dates-ok">Va bene, inizia il ${esc(day(imp.start))}</button>
    <button class="btn ghost" data-act="imp-dates-other">Scegli un'altra data di inizio</button></div>`;
}
/** Why a start date is refused: the latest cycle already has workouts (or simply starts) before it. */
function earlyText(d) {
  const c = latestCycle(d), min = earliestStart(d), last = lastSessionDate(d);
  return last && last >= c.startDate
    ? `Il ciclo ${c.number} ha allenamenti fino al ${day(last)}: il ciclo ${imp.number} può iniziare al più presto il ${day(min)}.`
    : `Il ciclo ${c.number} inizia il ${day(c.startDate)}: il ciclo ${imp.number} può iniziare al più presto il ${day(min)}.`;
}
const sheetItems = (letter) => imp.items.filter((t) => t.L === letter);

/* ---------- Starting ---------- */
/** Same checks the program file always had: sheet letters, exercises with a name and at least one block. */
function checkProgram(p) {
  if (p.type !== "gymlog-program" || !p.sheets || !Object.keys(p.sheets).length) throw new Error("Questo file non è una scheda di Harden.");
  for (const [letter, list] of Object.entries(p.sheets)) {
    if (!/^[A-Z0-9]{1,3}$/.test(letter) || !Array.isArray(list) || !list.length) throw new Error(`Scheda "${letter}" non valida nel file.`);
    for (const x of list) if (!x.name || !Array.isArray(x.blocks) || !x.blocks.length) throw new Error(`Esercizio senza nome o senza serie nella scheda ${letter}.`);
  }
}

/** Builds the steps from a program: one item per exercise, with its catalog match already worked out. */
function begin(program, fileName) {
  checkProgram(program);
  const d = D(), weeks = program.weeks || 4;
  const items = [];
  for (const [letter, list] of Object.entries(program.sheets)) {
    list.forEach((x) => {
      const m = L.catalogMatches(d.exercises, x.name), best = m.cands[0]?.ex;
      items.push({
        L: letter, kind: m.kind, done: false,
        cands: m.cands.map((c) => ({ id: c.ex.id, name: c.ex.name, district: c.ex.district || "", score: c.score })),
        pick: best ? best.id : "new", usesBar: best ? !!best.usesBar : !!x.usesBar,
        x: { name: x.name, district: x.district || "", rest: x.rest || null, superset: x.superset || null, tut: x.tut || "", video: x.video || "",
          description: x.description || "", exerciseNote: x.exerciseNote || "", progressionNote: x.progressionNote || "", week4Plus: !!x.week4Plus,
          blocks: x.blocks.map((b) => ({ ...(b.mav ? { mav: true } : {}), sets: Array.from({ length: weeks }, (_, w) => L.atWeek(b.sets, w + 1) ?? null), reps: Array.from({ length: weeks }, (_, w) => String(L.atWeek(b.reps, w + 1) ?? "")) })) },
      });
    });
  }
  // Dates first: a PDF dated inside a period already logged starts on the first free day (after the last session);
  // the overview then asks to close the running cycle the day before.
  const read = program.startDate || L.todayISO();
  const start = tooEarly(d, read) ? earliestStart(d) : read;
  imp = { fileName, weeks, dayPlan: program.dayPlan || {}, start, read, overlapOk: false, number: nextNumber(d), items, screen: "overview", cur: 0, dir: "", notesOpen: false, log: imp?.log || [] };
  saveDraft();
}

async function importFile(file) {
  if (!file) return;
  const isPdf = /\.pdf$/i.test(file.name) || file.type === "application/pdf";
  if (!isPdf) {
    try {
      let program;
      try { program = JSON.parse(await file.text()); } catch { throw new Error("Scegli il PDF della scheda (o un file .json di Harden)."); }
      begin(program, file.name); go("import");
    } catch (e) { toast(e.message, { error: true }); }
    return;
  }
  imp = { screen: "reading", fileName: file.name, log: [], target: 4 };
  go("import"); glide();
  try {
    const program = await readProgramPdf(file, (n, total) => { imp.target = 10 + (n / total) * 80; });
    const letters = Object.keys(program.sheets);
    imp.log = [`${letters.length} schede, ${program.weeks} settimane`, ...(Object.keys(program.dayPlan || {}).length ? [`Giorni consigliati: ${letters.map((l) => `${l} ${program.dayPlan[l] || "–"}`).join(", ")}`] : []),
      ...letters.map((l) => `Scheda ${l}: ${program.sheets[l].length} esercizi`), "Confronto con il tuo catalogo"];
    // Show what was found, line by line, then open the overview.
    for (let k = 0; k < imp.log.length; k++) {
      await new Promise((r) => setTimeout(r, 160));
      $("#impLog")?.insertAdjacentHTML("beforeend", `<li>${esc(imp.log[k])}</li>`);
      imp.target = 90 + ((k + 1) / imp.log.length) * 10;
    }
    await new Promise((r) => setTimeout(r, 500));
    begin(program, file.name);
    go("import");
  } catch (e) {
    imp = null; saveDraft();
    go("program"); toast(e.message, { error: true, ms: 6000 });
  }
}

/** The reading bar eases toward the pages read so far on every frame, so it never jumps. */
function glide() {
  let shown = 0;
  const step = () => {
    if (!imp || imp.screen !== "reading" || ui.view !== "import") return;
    shown = Math.min(imp.target, shown + (imp.target - shown) * 0.08 + 0.15);
    const bar = $("#impBar");
    if (bar) bar.style.width = `${shown}%`;
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- Screens ---------- */
const top = (left, right, extra = "") => `<div class="imp-top"><div class="row">${left}${right}</div>${extra}</div>`;
const foot = (html) => `<div class="imp-foot">${html}</div>`;

export function viewImport(d) {
  if (!imp) return `<section class="card stack"><h2>Nessuna scheda da importare</h2><button class="btn" data-act="go" data-view="program">Vai alla Scheda</button></section>`;
  return SCREENS[imp.screen](d);
}

const SCREENS = {
  reading: () => `${top(`<h1>Leggo la scheda…</h1>`, "")}
    <section class="card stack"><div class="imp-file"><div class="ic">PDF</div><b>${esc(imp.fileName)}</b></div>
      <div class="imp-bar"><i id="impBar"></i></div><ul class="imp-log" id="impLog"></ul></section>`,

  overview: () => {
    const c = { ok: 0, sim: 0, new: 0 };
    imp.items.forEach((t) => c[t.kind]++);
    const letters = [...new Set(imp.items.map((t) => t.L))], cur = latestCycle(D());
    return `${top(`<button class="link" data-act="imp-exit">‹ Esci</button>`, `<span class="hint">Ciclo ${imp.number}</span>`, `<h1>Scheda letta</h1>`)}
      ${datesCard(D())}
      <section class="card stack">
        <div class="imp-file"><div class="ic">${/\.pdf$/i.test(imp.fileName) ? "PDF" : "JSON"}</div><b>${esc(imp.fileName)}</b></div>
        <div class="imp-facts">
          <div><b>${letters.length}</b><span>schede</span></div><div><b>${imp.items.length}</b><span>esercizi</span></div>
          <div><b>${imp.weeks}</b><span>settimane</span></div><div class="period"><b>${esc(L.fmtRange(imp.start, L.addDays(imp.start, imp.weeks * 7 - 1)).replace(/ \d{4}$/, ""))}</b><span>periodo</span></div>
        </div>
        ${Object.keys(imp.dayPlan).length ? `<div><div class="label" style="margin-bottom:6px">Giorni consigliati</div><div class="imp-days">${letters.map((l) => `<span><b>${esc(l)}</b>${esc(imp.dayPlan[l] || "–")}</span>`).join("")}</div></div>` : ""}
        <label class="label" for="impStart">Inizio del ciclo<input id="impStart" type="date" value="${esc(imp.start)}" ${earliestStart(D()) ? `min="${earliestStart(D())}"` : ""} data-act="imp-start"></label>
        ${cur && !cur.closed && !overlapped(D()) ? `<p class="hint">Il ciclo ${cur.number} in corso finisce il ${esc(day(L.cycleEnd(cur)))}, poi si chiude da solo.</p>` : ""}
      </section>
      <section class="card stack"><div class="label">Confronto con il tuo catalogo</div>
        <div class="imp-sum">
          <div><span class="pill ok">${c.ok}</span> già nel catalogo, con lo stesso nome</div>
          ${c.sim ? `<div><span class="pill sim">${c.sim}</span> con un nome simile: scegli tu se è lo stesso</div>` : ""}
          ${c.new ? `<div><span class="pill new">${c.new}</span> nuovi, da aggiungere al catalogo</div>` : ""}
        </div></section>
      ${foot(`<button class="btn grow" data-act="imp-steps">Controlla gli esercizi</button>`)}`;
  },

  step: () => {
    const t = imp.items[imp.cur], x = t.x, mine = sheetItems(t.L), pos = mine.indexOf(t) + 1, letters = [...new Set(imp.items.map((y) => y.L))];
    const last = imp.cur === imp.items.length - 1, lastOfSheet = pos === mine.length;
    const track = `<div class="imp-track" style="grid-template-columns:repeat(${letters.length},1fr)">${letters.map((l) => `<div class="g ${l === t.L ? "cur" : ""}"><span>${esc(l)}</span><div class="segs">${sheetItems(l).map((y) => `<i class="${y === t ? "cur" : y.done ? "ok" : ""}"></i>`).join("")}</div></div>`).join("")}</div>`;
    const opt = (id, title, sub, extra = "") => `<button class="imp-opt ${t.pick === id ? "sel" : ""}" data-act="imp-pick" data-id="${esc(id)}"><span class="r"></span><span class="nm">${title}<small>${sub}</small></span>${extra}</button>`;
    const bar = t.pick === "new" ? `<label class="imp-check"><input type="checkbox" data-act="imp-bar" ${t.usesBar ? "checked" : ""}> Si fa con il bilanciere (calcolo dei dischi)</label>` : "";
    const match = t.kind === "ok"
      ? `<div class="imp-match ok"><div class="title">✓ Nel tuo catalogo</div><span class="hint">Storico, record e carichi precompilati continuano da qui.</span></div>`
      : t.kind === "sim"
        ? `<div class="imp-match sim"><div class="title">≈ Nome simile nel catalogo</div><span class="hint">Se è lo stesso esercizio collegalo, così continua il suo storico.</span>
            ${t.cands.map((c) => opt(c.id, esc(c.name), `distretto ${esc(c.district || "–")}`, `<span class="pc">${Math.round(c.score * 100)}%</span>`)).join("")}
            ${opt("new", "È un esercizio diverso", "lo aggiungo al catalogo come nuovo")}${bar}</div>`
        : `<div class="imp-match new"><div class="title">＋ Esercizio nuovo</div><span class="hint">Non c'è niente di simile nel catalogo: lo aggiungo io.</span>${bar}</div>`;
    const mavBlock = x.blocks.find((b) => b.mav);
    const rows = x.blocks.map((b, bi) => `<tr><td class="k ${b.mav ? "mav" : ""}">${b.mav ? "MAV" : x.blocks.length < 2 ? "Serie×rip" : x.blocks.some((y) => y.mav) ? "Lavoro" : `Blocco ${bi + 1}`}</td>${b.sets.map((_, w) => `<td><input type="text" autocomplete="off" class="${b.sets[w] == null ? "bad" : ""}" value="${esc(cellText(b, w))}" data-act="imp-cell" data-b="${bi}" data-w="${w}" aria-label="Settimana ${w + 1}, serie per ripetizioni"></td>`).join("")}</tr>`).join("");
    const ss = x.superset === "first" ? `<span class="imp-tag">⇄ Superset con l'esercizio dopo</span>` : x.superset === "second" ? `<span class="imp-tag">⇄ Chiude il superset con quello prima</span>` : "";
    const area = (f, label, rows = 2) => `<label><span class="label">${label}</span><textarea data-act="imp-field" data-f="${f}" rows="${rows}">${esc(x[f])}</textarea></label>`;
    return `${top(`<button class="link" data-act="imp-exit">‹ Esci</button>`, `<span class="hint">Scheda ${esc(t.L)} · ${pos} di ${mine.length}</span>`, track)}
      <section class="card stack imp-ex ${imp.dir ? `in-${imp.dir}` : ""}">
        <div class="imp-head"><span class="dist">${esc(x.district)}</span><textarea class="imp-name" rows="1" data-act="imp-field" data-f="name" aria-label="Nome esercizio">${esc(x.name)}</textarea></div>
        ${match}
        <div><div class="label" style="margin-bottom:4px">Serie e ripetizioni</div>
          <table class="imp-grid"><tr><th></th>${x.blocks[0].sets.map((_, w) => `<th>S${w + 1}</th>`).join("")}</tr>${rows}</table>
          ${mavBlock ? `<p class="hint" style="margin-top:4px">MAV ${esc(mavBlock.reps[0])}: ${mavBlock.sets[0] ?? "–"} serie a salire, conta l'ultima.</p>` : ""}
        </div>
        <div><div class="label" style="margin-bottom:6px">Recupero</div>
          <div class="imp-rest"><button class="step" data-act="imp-rest" data-d="-15" aria-label="Meno 15 secondi">−</button><output id="impRest">${restText(x.rest)}</output><button class="step" data-act="imp-rest" data-d="15" aria-label="Più 15 secondi">+</button></div>
          <div class="imp-quick">${QUICK_RESTS.map((v) => `<button class="${x.rest === v ? "sel" : ""}" data-act="imp-rest-set" data-v="${v}">${restText(v)}</button>`).join("")}</div>
        </div>
        <label class="label" for="impTut">TUT<input id="impTut" type="text" value="${esc(x.tut)}" placeholder="es. 3-1-1" data-act="imp-field" data-f="tut"></label>
        ${ss}
        <details class="imp-notes" ${imp.notesOpen ? "open" : ""}><summary>Note e video</summary><div class="fields">
          ${area("description", "Descrizione", 3)}${area("exerciseNote", "Note esercizio")}${area("progressionNote", "Note progressioni", 3)}
          <label><span class="label">Video</span><div class="imp-vid"><input type="text" value="${esc(x.video)}" inputmode="url" autocomplete="off" placeholder="Link YouTube" data-act="imp-field" data-f="video">${/^https?:/i.test(x.video) ? `<a class="btn ghost" href="${esc(x.video)}" target="_blank" rel="noopener">Apri</a>` : ""}</div></label>
        </div></details>
      </section>
      ${foot(`<button class="btn ghost" data-act="imp-prev" ${imp.cur === 0 ? "disabled" : ""}>Indietro</button>
        <button class="btn grow" data-act="imp-next">${last ? "Conferma e vai al riepilogo" : lastOfSheet ? `Conferma · passa alla scheda ${esc(imp.items[imp.cur + 1].L)}` : "Conferma e avanti"}</button>`)}`;
  },

  review: () => {
    const letters = [...new Set(imp.items.map((t) => t.L))];
    const linked = imp.items.filter((t) => t.kind === "sim" && t.pick !== "new").length, nw = imp.items.filter((t) => t.pick === "new").length;
    return `${top(`<button class="link" data-act="imp-back-last">‹ Indietro</button>`, `<span class="hint">Ciclo ${imp.number} · dal ${esc(L.fmtDate(imp.start, { weekday: false }))}</span>`, `<h1>Riepilogo</h1>`)}
      <p class="hint">Tocca un esercizio per tornarci.${linked ? ` ${linked} collegati a un nome simile.` : ""}${nw ? ` ${nw} nuovi nel catalogo.` : ""}</p>
      ${letters.map((l) => `<section class="card"><div class="row"><h2>Scheda ${esc(l)}</h2><span class="hint">${esc(imp.dayPlan[l] || "")}</span></div>
        <ul class="imp-rv">${sheetItems(l).map((t) => {
          const k = imp.items.indexOf(t), c = t.cands.find((x) => x.id === t.pick);
          const pill = t.pick === "new" ? `<span class="pill new">nuovo</span>` : t.kind === "sim" ? `<span class="pill sim">collegato</span>` : `<span class="pill ok">catalogo</span>`;
          return `<li><span class="dist">${esc(t.x.district)}</span><button data-act="imp-jump" data-k="${k}">${esc(t.x.name)}${t.kind === "sim" && c ? `<small>= ${esc(c.name)}</small>` : ""}</button>${pill}</li>`;
        }).join("")}</ul></section>`).join("")}
      ${foot(`<button class="btn grow" data-act="imp-create">Crea il ciclo ${imp.number}</button>`)}`;
  },

  done: () => {
    const nw = imp.items.filter((t) => t.pick === "new").length, letters = new Set(imp.items.map((t) => t.L)).size;
    return `<div class="imp-done"><div class="big">✓</div><h1>Ciclo ${imp.number} pronto</h1>
      <p class="hint">Inizia ${esc(L.fmtDate(imp.start, { year: true }))} · ${letters} schede · ${imp.items.length} esercizi${nw ? ` · ${nw} nuovi nel catalogo` : ""}</p></div>
      <button class="btn" data-act="imp-finish">Vai alla scheda</button>`;
  },
};

/** Card shown in Scheda while an import is half done. */
export const importDraftCard = () => (hasImportDraft()
  ? `<section class="card stack"><div><div class="label">Import della scheda a metà</div><span class="hint" style="overflow-wrap:anywhere">${imp.items.filter((t) => t.done).length} di ${imp.items.length} esercizi controllati · ${esc(imp.fileName)}</span></div>
      <div class="row"><button class="btn ghost" style="flex:1" data-act="imp-discard">Scarta</button><button class="btn" style="flex:2" data-act="imp-resume">Riprendi l'import</button></div></section>`
  : "");

/* ---------- Checking and creating ---------- */
/** First problem of an exercise, or "" when it can be confirmed. */
function problem(t) {
  if (!t.x.name.trim()) return "Scrivi il nome dell'esercizio.";
  for (const b of t.x.blocks) for (let w = 0; w < b.sets.length; w++) {
    if (!(Number.isInteger(b.sets[w]) && b.sets[w] > 0 && String(b.reps[w]).trim())) return `Settimana ${w + 1}: scrivi serie×ripetizioni, per esempio 3×10.`;
  }
  return "";
}

function createCycle() {
  if (tooEarly(D(), imp.start)) { show("overview"); toast(earlyText(D()), { error: true, ms: 5000 }); return; }
  if (overlapped(D()) && !imp.overlapOk) { show("overview"); toast(`Prima decidi le date: il ciclo ${imp.number} si sovrappone al ciclo ${overlapped(D()).number}.`, { error: true }); return; }
  const cut = overlapped(D());
  const bad = imp.items.findIndex((t) => problem(t));
  if (bad >= 0) { imp.cur = bad; imp.dir = ""; imp.screen = "step"; go("import"); toast(problem(imp.items[bad]), { error: true }); return; }
  store.mutate((d) => {
    const fresh = new Map(); // a new exercise used in two sheets is created once
    const sheets = {};
    for (const t of imp.items) {
      let exId = t.pick;
      if (exId === "new") {
        const key = L.norm(t.x.name);
        if (!fresh.has(key)) fresh.set(key, store.upsert(d, "exercises", { id: store.uid(), name: t.x.name.trim(), district: t.x.district, usesBar: t.usesBar }).id);
        exId = fresh.get(key);
      }
      const list = (sheets[t.L] ??= []);
      const { name: _name, ...slot } = t.x;
      list.push({ id: `${t.L}${list.length + 1}`, exerciseId: exId, ...slot, blocks: slot.blocks.map((b) => ({ ...b, reps: b.reps.map(String) })) });
    }
    // The running cycle ends the day before the new one: what was logged in it stays where it is.
    if (cut) { const c = d.cycles.find((x) => x.id === cut.id); c.endDate = L.addDays(imp.start, -1); delete c.keepOpen; c.updatedAt = store.now(); }
    store.upsert(d, "cycles", { id: store.uid(), number: imp.number, startDate: imp.start, weeks: imp.weeks, dayPlan: imp.dayPlan, closed: false, overrides: {}, sheets });
    // The running cycle closes when the new one starts: today if it starts today, otherwise on that day.
    L.closeSupersededCycles(d, store.now());
  });
  imp.screen = "done"; saveDraft(); go("import");
  runSync(`feat: import cycle ${imp.number} program`, { quiet: true });
}

/* ---------- Handlers ---------- */
const current = () => imp.items[imp.cur];
const show = (screen, dir = "") => { imp.screen = screen; imp.dir = dir; saveDraft(); go("import"); };
const fit = (t) => { t.style.height = "auto"; t.style.height = `${t.scrollHeight + 2}px`; };
export const fitImportFields = () => $$("#view .imp-ex textarea").forEach(fit);

Object.assign(actions, {
  "imp-steps": () => {
    if (overlapped(D()) && !imp.overlapOk) { toast(`Prima decidi le date: il ciclo ${imp.number} si sovrappone al ciclo ${overlapped(D()).number}.`, { error: true }); $(".imp-dates")?.scrollIntoView({ block: "center", behavior: "smooth" }); return; }
    imp.cur = 0; show("step", "next");
  },
  "imp-dates-ok": () => { imp.overlapOk = true; show("overview"); },
  "imp-dates-change": () => { imp.overlapOk = false; show("overview"); },
  "imp-dates-other": () => { const i = $("#impStart"); i.scrollIntoView({ block: "center", behavior: "smooth" }); i.focus(); i.showPicker?.(); },
  "imp-exit": () => { saveDraft(); go("program"); toast("Import salvato: lo riprendi dalla Scheda."); },
  "imp-resume": () => go("import"),
  "imp-discard": () => { imp = null; saveDraft(); go("program"); toast("Import scartato"); },
  "imp-pick": (el) => { current().pick = el.dataset.id; show("step"); },
  "imp-prev": () => { if (imp.cur > 0) { imp.cur--; show("step", "back"); } },
  "imp-next": () => {
    const t = current(), why = problem(t);
    if (why) { toast(why, { error: true }); return; }
    t.done = true;
    if (imp.cur === imp.items.length - 1) show("review"); else { imp.cur++; show("step", "next"); }
  },
  "imp-jump": (el) => { imp.cur = +el.dataset.k; show("step", "back"); },
  "imp-back-last": () => { imp.cur = imp.items.length - 1; show("step", "back"); },
  "imp-rest": (el) => setRest(Math.max(0, Math.min(600, (current().x.rest || 0) + +el.dataset.d))),
  "imp-rest-set": (el) => setRest(+el.dataset.v),
  "imp-create": () => createCycle(),
  "imp-finish": () => { imp = null; saveDraft(); ui.cycleId = null; ui.week = null; go("program"); },
});
function setRest(v) {
  current().x.rest = v || null; saveDraft();
  $("#impRest").textContent = restText(v);
  $$(".imp-quick button").forEach((b) => b.classList.toggle("sel", +b.dataset.v === v));
}

Object.assign(inputs, {
  "imp-field": (el) => { current().x[el.dataset.f] = el.value; if (el.matches("textarea")) fit(el); saveDraft(); },
  "imp-cell": (el) => {
    const b = current().x.blocks[+el.dataset.b], w = +el.dataset.w;
    const m = /^\s*(\d+)\s*[x×*]\s*(\S.*?)\s*$/i.exec(el.value);
    b.sets[w] = m ? +m[1] : null; b.reps[w] = m ? m[2] : el.value.trim();
    el.classList.toggle("bad", !m); saveDraft();
  },
});

Object.assign(changes, {
  "import-program-file": (t) => { const f = t.files?.[0]; t.value = ""; importFile(f); },
  "imp-start": (el) => {
    if (!el.value) return;
    if (tooEarly(D(), el.value)) { el.value = imp.start; toast(earlyText(D()), { error: true, ms: 5000 }); return; }
    imp.start = el.value; imp.picked = true; imp.overlapOk = false; show("overview");
  },
  "imp-bar": (el) => { current().usesBar = el.checked; saveDraft(); },
});

// An exercise name is one line: Enter would only break it.
document.addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches?.(".imp-name")) e.preventDefault(); });
document.addEventListener("toggle", (e) => { if (e.target.matches?.(".imp-notes") && imp) { imp.notesOpen = e.target.open; e.target.querySelectorAll("textarea").forEach(fit); saveDraft(); } }, true);
