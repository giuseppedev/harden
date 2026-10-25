// Settings: four short cards; the detailed forms open in sheets.
import * as store from "../data.js";
import * as gh from "../github.js";
import * as L from "../logic.js";
import { $, esc, D, ui, actions, confirmed, changes, inputs, toast, openModal, closeModal, render, renderHeader, go, deleteWithUndo, runSync, APP_VERSION } from "../core.js";
import { platesOf, matchScore } from "./session.js";
import { readJsonFile } from "./program.js";
import { paymentsCard } from "./payments.js";
import { remindersFor, dueTag } from "../reminders.js";

export function viewSettings(d) {
  const tok = d ? remindersFor(d, "settings").find((r) => r.key === "token") : null;
  const cfg = gh.getConfig(), meta = gh.getMeta(), on = gh.isConfigured();
  const bars = d ? store.live(d.bars) : [];
  const exCount = d ? store.live(d.exercises).length : 0;
  const syncCard = on ? `<section class="card stack"><div class="row"><h2>Sincronizzazione</h2>${(() => { const expired = cfg.expiry && cfg.expiry < L.todayISO(); const [cls, txt] = expired ? ["err", "token scaduto"] : ui.syncState === "error" ? ["err", "errore"] : store.isDirty() ? ["pending", "da inviare"] : ["ok", "collegato"]; return `<span class="sync ${cls}">${txt}</span>`; })()}</div>
      ${tok?.state === "over" ? `<div class="banner danger">🔑 Token scaduto: la sincronizzazione è ferma. Rigeneralo su GitHub e incollalo in Modifica.</div>` : ""}
      <p class="hint">${esc(cfg.owner)}/${esc(cfg.repo)} · ${meta.lastSync ? `ultimo sync ${esc(new Date(meta.lastSync).toLocaleString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }))}` : "mai sincronizzato"}${cfg.expiry ? ` · token valido fino al ${esc(L.fmtDate(cfg.expiry, { weekday: false, year: true }))}${dueTag(tok)}` : ""}</p>
      ${ui.syncState === "error" ? `<p class="hint" style="color:var(--danger)">${esc(ui.syncError)}</p>` : ""}
      <div class="row"><button class="btn ghost small" style="flex:1" data-act="sync">Sincronizza ora</button><button class="btn ghost small" style="flex:1" data-act="gh-edit">Modifica</button></div></section>`
    : `<section class="card stack"><h2>Sincronizzazione GitHub</h2>${ghForm(cfg)}</section>`;
  if (!d) return syncCard + backupCard(false) + footer();
  return `${syncCard}
  <section class="card stack"><div class="row"><h2>Atleta e attrezzatura</h2><button class="mini" data-act="gear-edit">Modifica</button></div>
    <ul class="list"><li><span>Nome sul logbook</span><span class="hint">${esc(d.profile?.athlete || "–")}</span></li>
    ${bars.map((b) => `<li><span>${esc(b.name)}</span><span class="hint">${b.kg != null ? `${L.fmtNum(b.kg)} kg` : "peso da impostare"}</span></li>`).join("")}
    <li><span>Dischi</span><span class="hint">${platesOf().map(L.fmtNum).join(" · ")}</span></li></ul></section>
  <section class="card stack"><div class="row"><h2>Catalogo esercizi</h2><button class="mini" data-act="catalog-open">Apri</button></div><p class="hint">${exCount} esercizi · nome, distretto, regolazioni e bilanciere predefinito</p></section>
  ${paymentsCard(d)}
  ${backupCard(true)}${footer()}`;
}

const footer = () => `<p class="hint" style="text-align:center">Harden ${APP_VERSION}</p>`;

function backupCard(hasData) {
  return `<section class="card stack"><h2>Backup</h2><div class="row">
    ${hasData ? `<button class="btn ghost small" style="flex:1" data-act="export-json">Esporta dati</button>` : ""}
    <label class="btn ghost small" style="flex:1" for="dataFile">Importa dati</label></div>
    <input id="dataFile" type="file" accept=".json,application/json" data-act="import-data-file" class="vh">
    <p class="hint">L'import unisce il file ai dati di questo telefono: per ogni elemento vince la versione più recente.</p></section>`;
}

function ghForm(cfg) {
  return `<p class="hint">I dati restano sul telefono e vengono copiati nel file del tuo repository <b>privato</b>. Il token resta solo su questo dispositivo.</p>
    <div class="extras" style="margin-top:0">
      <label class="label" for="ghOwner">Utente<input id="ghOwner" type="text" autocapitalize="none" autocomplete="off" spellcheck="false" value="${esc(cfg.owner || "")}" placeholder="es. giuseppe"></label>
      <label class="label" for="ghRepo">Repository dati<input id="ghRepo" type="text" autocapitalize="none" autocomplete="off" spellcheck="false" value="${esc(cfg.repo || "")}" placeholder="es. harden-data"></label>
      <label class="label" for="ghBranch">Branch<input id="ghBranch" type="text" autocapitalize="none" value="${esc(cfg.branch || "main")}"></label>
      <label class="label" for="ghPath">File<input id="ghPath" type="text" autocapitalize="none" value="${esc(cfg.path || "harden-data.json")}"></label>
      <label class="label full" for="ghToken">Token (fine-grained, solo questo repository)<input id="ghToken" type="password" autocomplete="off" value="${esc(gh.getToken())}" placeholder="github_pat_…"></label>
      <label class="label" for="ghExpiry">Scadenza token<input id="ghExpiry" type="date" value="${esc(cfg.expiry || "")}"></label>
      <label class="label" for="ghDevice">Nome dispositivo<input id="ghDevice" type="text" value="${esc(cfg.device || "")}" placeholder="es. iPhone"></label>
    </div>
    <button class="btn" data-act="gh-save">Salva e prova la connessione</button>`;
}

function openGear() {
  const d = D();
  openModal(`<h2 data-rerender>Atleta e attrezzatura</h2>
    <label class="label" for="athlete">Nome sul logbook<input id="athlete" type="text" value="${esc(d.profile?.athlete || "")}" data-act="athlete"></label>
    <div class="label">Bilancieri · peso del solo bilanciere</div>
    ${store.live(d.bars).map((b) => `<div class="settings-row"><input type="text" value="${esc(b.name)}" data-act="bar-name" data-id="${b.id}" aria-label="Nome bilanciere"><label class="field"><input inputmode="decimal" value="${esc(L.fmtNum(b.kg))}" data-act="bar-kg" data-id="${b.id}" aria-label="Peso ${esc(b.name)}" placeholder="?"><em>kg</em></label><button class="mini danger" data-confirm="delete-bar" data-id="${b.id}">Elimina</button></div>`).join("")}
    <button class="btn ghost small" data-act="add-bar">+ Aggiungi bilanciere</button>
    <label class="label" for="plates">Dischi disponibili (kg, separati da punto e virgola)<input id="plates" type="text" inputmode="decimal" data-act="plates" value="${esc(platesOf().map(L.fmtNum).join("; "))}"></label>
    <p class="hint">Nei carichi segni sempre i dischi: l'app aggiunge il bilanciere per il totale e ti dice quali dischi mettere per lato.</p>
    <button class="btn" data-act="close">Fatto</button>`);
}

function openCatalog() {
  openModal(`<h2 data-rerender>Catalogo esercizi</h2>
    <input type="search" data-act="catalog-search" value="${esc(ui.catalogQuery)}" placeholder="Cerca" aria-label="Cerca esercizio">
    <div id="catList">${catalogList()}</div>
    <div class="row"><button class="btn ghost" style="flex:1" data-act="edit-exercise" data-id="">+ Nuovo</button><button class="btn" style="flex:1" data-act="close">Fatto</button></div>`);
}
function catalogList() {
  const q = ui.catalogQuery;
  const exs = store.live(D().exercises).map((e) => ({ e, s: q ? matchScore(q, e.name) : 1 })).filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name, "it")).map((x) => x.e);
  return exs.map((e) => `<div class="cat-row tap" data-act="edit-exercise" data-id="${e.id}"><span><span class="dist">${esc(e.district)}</span> ${esc(e.name)}${e.setup ? `<br><span class="hint">⚙︎ ${esc(e.setup)}</span>` : ""}</span><span class="hint">›</span></div>`).join("") || `<p class="hint">Nessun esercizio trovato.</p>`;
}

function openExerciseEditor(id) {
  const d = D();
  const e = id ? L.exerciseOf(d, id) : { id: "", name: "", district: "P", usesBar: false, defaultBarId: "" };
  const bars = store.live(d.bars);
  openModal(`<h2 data-rerender>${id ? "Modifica esercizio" : "Nuovo esercizio"}</h2>
    <label class="label" for="exName">Nome<input id="exName" type="text" value="${esc(e.name)}"></label>
    <div class="extras" style="margin-top:0">
      <label class="label" for="exDist">Distretto<select id="exDist">${L.DISTRICTS.map((x) => `<option ${x === e.district ? "selected" : ""}>${x}</option>`).join("")}</select></label>
      <label class="label" for="exBar">Bilanciere<select id="exBar"><option value="">Nessuno</option>${bars.map((b) => `<option value="${b.id}" ${e.usesBar && e.defaultBarId === b.id ? "selected" : ""}>${esc(b.name)}</option>`).join("")}<option value="any" ${e.usesBar && !e.defaultBarId ? "selected" : ""}>Sì, da scegliere</option></select></label>
      <label class="label full" for="exSetup">Regolazioni<input id="exSetup" type="text" value="${esc(e.setup || "")}" placeholder="es. schienale tacca 3, sellino 4"></label>
      <label class="label full" for="exVariants">Varianti · una per riga, in ordine di progressione<textarea id="exVariants" rows="4" placeholder="es. a terra&#10;alla sbarra, ginocchia flesse">${esc((e.variants || []).join("\n"))}</textarea></label>
    </div>
    <p class="hint">Con le varianti, nella sessione scegli quale stai facendo: resta la stessa riga nel logbook e nello storico.</p>
    <div class="row">${id ? `<button class="btn ghost" style="color:var(--danger)" data-confirm="delete-exercise" data-id="${id}">Elimina</button>` : ""}<button class="btn ghost" data-act="catalog-open">Annulla</button><button class="btn" data-act="save-exercise" data-id="${esc(id || "")}">Salva</button></div>`);
}

async function exportJson() {
  const { deliverFile } = await import("../pdf.js");
  const bytes = new TextEncoder().encode(JSON.stringify(D(), null, 1));
  await deliverFile(bytes, `harden-data-${L.todayISO()}.json`, "application/json");
}

Object.assign(actions, {
  "gh-edit": () => openModal(`<h2 data-rerender>Collegamento GitHub</h2>${ghForm(gh.getConfig())}
    <button class="btn ghost small" data-confirm="gh-download">Scarica da GitHub e sostituisci i dati del telefono</button>
    <button class="btn ghost" data-act="close">Chiudi</button>`),
  "gh-save": async () => {
    gh.setConfig({ owner: $("#ghOwner").value.trim(), repo: $("#ghRepo").value.trim(), branch: $("#ghBranch").value.trim() || "main", path: $("#ghPath").value.trim() || "harden-data.json", expiry: $("#ghExpiry").value, device: $("#ghDevice").value.trim() });
    gh.setToken($("#ghToken").value.trim());
    if (!gh.isConfigured()) { toast("Compila utente, repository e token"); renderHeader(); return; }
    try {
      const r = await gh.testConnection();
      if (!r.private) toast("Attenzione: il repository è pubblico. I tuoi dati sarebbero visibili a tutti.", { error: true, ms: 6000 });
      else if (!store.hasData() && r.fileExists) { await gh.downloadReplace(); closeModal(); toast("Dati scaricati da GitHub"); go("home"); return; }
      else toast(r.fileExists ? "Connessione riuscita" : "Connessione riuscita: il file verrà creato alla prima sincronizzazione");
    } catch (e) { toast(e.message, { error: true, ms: 5000 }); }
    closeModal(); render();
  },
  "gear-edit": () => openGear(),
  "add-bar": () => { store.mutate((d) => store.upsert(d, "bars", { id: store.uid(), name: "Nuovo bilanciere", kg: null })); openGear(); },
  "catalog-open": () => openCatalog(),
  "edit-exercise": (el) => openExerciseEditor(el.dataset.id),
  "save-exercise": (el) => {
    const name = $("#exName").value.trim();
    if (!name) { toast("Scrivi il nome dell'esercizio"); return; }
    const barVal = $("#exBar").value;
    const id = el.dataset.id || store.uid();
    store.mutate((d) => {
      const prev = L.exerciseOf(d, id) || {};
      store.upsert(d, "exercises", { ...prev, id, name, district: $("#exDist").value, usesBar: !!barVal, defaultBarId: barVal && barVal !== "any" ? barVal : "", setup: $("#exSetup").value.trim(), variants: $("#exVariants").value.split("\n").map((x) => x.trim()).filter(Boolean) });
    });
    openCatalog(); toast("Esercizio salvato");
  },
  "export-json": () => exportJson().catch((e) => toast(e.message, { error: true })),
});

Object.assign(confirmed, {
  "delete-bar": (id) => deleteWithUndo("bars", id, "Bilanciere eliminato"),
  "delete-exercise": (id) => deleteWithUndo("exercises", id, "Esercizio rimosso dal catalogo (lo storico resta)"),
  "gh-download": async () => {
    try { await gh.downloadReplace(); closeModal(); toast("Dati scaricati da GitHub"); ui.cycleId = null; go("home"); }
    catch (e) { toast(e.message, { error: true, ms: 5000 }); }
  },
});

Object.assign(inputs, {
  "catalog-search": (t) => { ui.catalogQuery = t.value; $("#catList").innerHTML = catalogList(); },
});

Object.assign(changes, {
  plates: (t) => {
    const list = t.value.split(/[;\s]+/).map((x) => L.parseNum(x)).filter((x) => x != null && x > 0);
    store.mutate((d) => { d.profile = { ...d.profile, plates: [...new Set(list)].sort((a, b) => b - a), updatedAt: store.now() }; });
    toast("Dischi aggiornati");
  },
  athlete: (t) => { store.mutate((d) => { d.profile = { ...d.profile, athlete: t.value.trim(), updatedAt: store.now() }; }); },
  "bar-name": (t) => store.mutate((d) => { const b = d.bars.find((x) => x.id === t.dataset.id); b.name = t.value.trim() || b.name; b.updatedAt = store.now(); }),
  "bar-kg": (t) => store.mutate((d) => { const b = d.bars.find((x) => x.id === t.dataset.id); b.kg = L.parseNum(t.value); b.updatedAt = store.now(); }),
  "import-data-file": async (t) => {
    try {
      const incoming = await readJsonFile(t);
      if (incoming.type === "gymlog-program") throw new Error("Questa è una scheda: importala dal tab Scheda.");
      if (!Array.isArray(incoming.cycles)) throw new Error("Questo file non contiene dati di Harden.");
      store.replace(store.hasData() ? store.merge(D(), incoming) : incoming, { dirty: true });
      ui.cycleId = null; toast("Dati importati"); go("home");
      runSync("feat: import data backup", { quiet: true });
    } catch (err) { toast(err.message, { error: true }); }
    t.value = "";
  },
});
