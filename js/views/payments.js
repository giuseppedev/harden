// Coaching payments: numbered programs (period, total cost, number of instalments) and the instalments paid.
// The newest program is the current one. An instalment is late when more than 30 days have passed since
// the previous payment (or the start of the program). Older programs stay viewable and editable.
import * as store from "../data.js";
import * as L from "../logic.js";
import { $, esc, D, actions, confirmed, toast, openModal, closeModal, render, runSync, deleteWithUndo, byDate } from "../core.js";

const LATE_AFTER_DAYS = 30, SOON_DAYS = 3;
const eur = (n) => `${Number(n || 0).toLocaleString("it-IT", { maximumFractionDigits: 2, useGrouping: "always" })} €`;
const dateY = (s) => L.fmtDate(s, { weekday: false, year: true });
const period = (p) => `${dateY(p.startDate)} – ${dateY(p.endDate)}`;
/** Programs, newest first. */
const plansOf = (d) => store.live(d.plans || []).sort((a, b) => b.number - a.number);
const planById = (d, id) => store.live(d.plans || []).find((p) => p.id === id);
const paymentsOf = (d, plan) => store.live(d.payments || []).filter((p) => p.planId === plan.id).sort(byDate);

function statusOf(d, plan) {
  const pays = paymentsOf(d, plan);
  const paid = pays.reduce((a, p) => a + (p.amount || 0), 0);
  const ref = pays.length ? pays[pays.length - 1].date : plan.startDate;
  const left = Math.max(0, plan.count - pays.length);
  const dueBy = L.addDays(ref, LATE_AFTER_DAYS);
  return { plan, pays, paid, left, next: pays.length + 1, dueBy, due: left ? L.deadline(dueBy, SOON_DAYS) : { state: "ok" } };
}
/** Status of the current (newest) program, or null; `dueBy` is the last day to pay the next instalment. */
export function planStatus(d) {
  const plan = plansOf(d)[0];
  return plan ? statusOf(d, plan) : null;
}

const summary = (st) => (st.left ? `${st.pays.length} di ${st.plan.count} rate · ${eur(st.paid)} di ${eur(st.plan.total)}` : `saldato · ${eur(st.paid)}`);
const paymentList = (st) => `<ul class="list">${st.pays.slice().reverse().map((p, i) => `<li class="tap" data-act="pay-edit" data-id="${p.id}"><span>Rata ${st.pays.length - i} · ${esc(dateY(p.date))}</span><span class="val"><b>${eur(p.amount)}</b> ›</span></li>`).join("")}</ul>`;

export function paymentsCard(d) {
  const plans = plansOf(d);
  const head = (btn) => `<div class="row"><h2>Pagamento coaching</h2>${btn}</div>`;
  if (!plans.length) return `<section class="card stack">${head(`<button class="mini" data-act="plan-edit">Imposta</button>`)}
    <p class="hint">Inserisci il programma (periodo, costo, rate) e registra ogni rata versata. Dopo 30 giorni dall'ultimo pagamento la rata successiva risulta in ritardo.</p></section>`;
  const st = statusOf(d, plans[0]), past = plans.slice(1);
  return `<section class="card stack">${head(`<button class="mini" data-act="plan-edit" data-id="${st.plan.id}">Modifica</button>`)}
    <div><b>Programma ${st.plan.number}</b> <span class="hint">· ${esc(period(st.plan))}</span>
      <p class="hint">${summary(st)}${st.left ? ` · rata ${st.next} entro il ${esc(L.fmtDate(st.dueBy, { weekday: false }))}${st.due.state !== "ok" ? ` · <span class="due ${st.due.state}">${esc(L.dueText(st.due, "a"))}</span>` : ""}` : ""}</p></div>
    ${st.left ? `<button class="btn" data-act="pay-new" data-plan="${st.plan.id}">Registra rata ${st.next}</button>` : ""}
    ${st.pays.length ? paymentList(st) : ""}
    ${past.length ? `<div class="groups"><details><summary class="plain"><span>Programmi precedenti</span><span class="hint">${past.length}</span></summary>
      <ul class="list">${past.map((p) => `<li class="tap" data-act="plan-open" data-id="${p.id}"><span>Programma ${p.number} · ${esc(period(p))}<br><span class="hint">${summary(statusOf(d, p))}</span></span><span class="hint">›</span></li>`).join("")}</ul></details></div>` : ""}
  </section>`;
}

/** A past program: its instalments, each editable. */
function openPlanDetail(id) {
  const st = statusOf(D(), planById(D(), id));
  openModal(`<div data-rerender><div class="label">${esc(period(st.plan))}</div><h2>Programma ${st.plan.number}</h2></div>
    <p class="hint">${summary(st)}</p>
    ${st.pays.length ? paymentList(st) : ""}
    ${st.left ? `<button class="btn ghost small" data-act="pay-new" data-plan="${id}">Registra rata</button>` : ""}
    <div class="row"><button class="btn ghost" style="flex:1" data-act="plan-edit" data-id="${id}">Modifica</button><button class="btn" style="flex:1" data-act="close">Chiudi</button></div>`);
}

/** Program form: edits the program with `id`, or creates the next one (older programs stay in the data). */
function openPlan(id) {
  const d = D(), cur = id && planById(d, id);
  const start = L.todayISO();
  const p = cur || { total: "", count: 4, startDate: start, endDate: L.addDays(`${+start.slice(0, 4) + 1}${start.slice(4)}`, -1) };
  const number = cur ? cur.number : Math.max(0, ...store.live(d.plans || []).map((x) => x.number)) + 1;
  openModal(`<h2 data-rerender>Programma ${number}</h2>
    <div class="extras" style="margin-top:0">
      <label class="label" for="plStart">Inizio<input id="plStart" type="date" value="${esc(p.startDate)}"></label>
      <label class="label" for="plEnd">Fine<input id="plEnd" type="date" value="${esc(p.endDate)}"></label>
      <label class="label" for="plTotal">Costo totale (€)<input id="plTotal" inputmode="decimal" value="${esc(L.fmtNum(p.total))}" placeholder="1300"></label>
      <label class="label" for="plCount">Numero di rate<input id="plCount" type="number" inputmode="numeric" value="${p.count}"></label>
    </div>
    <button class="btn" data-act="plan-save" data-id="${cur ? cur.id : ""}" data-number="${number}">Salva</button>
    ${cur && plansOf(d)[0].id === cur.id ? `<button class="btn ghost small" data-act="plan-edit">+ Nuovo programma</button>` : ""}
    <div class="row">${cur ? `<button class="btn ghost" style="flex:1;color:var(--danger)" data-confirm="delete-plan" data-id="${cur.id}">Elimina</button>` : ""}<button class="btn ghost" style="flex:1" data-act="close">Annulla</button></div>`);
}

function openPayment(id, planId) {
  const d = D(), p = id ? d.payments.find((x) => x.id === id) : null;
  const st = statusOf(d, planById(d, p ? p.planId : planId));
  const rate = Math.round((st.plan.total / st.plan.count) * 100) / 100;
  openModal(`<h2 data-rerender>Rata ${p ? st.pays.indexOf(p) + 1 : st.next} di ${st.plan.count}</h2>
    <p class="hint">Programma ${st.plan.number} · ${esc(period(st.plan))}</p>
    <label class="label" for="payDate">Data del pagamento<input id="payDate" type="date" value="${p ? p.date : L.todayISO()}"></label>
    <label class="field big"><input id="payAmount" inputmode="decimal" value="${esc(L.fmtNum(p ? p.amount : rate))}" aria-label="Importo in euro"><em>€</em></label>
    <button class="btn" data-act="pay-save" data-id="${p?.id || ""}" data-plan="${st.plan.id}">Salva</button>
    <div class="row">${p ? `<button class="btn ghost" style="flex:1;color:var(--danger)" data-confirm="delete-payment" data-id="${p.id}">Elimina</button>` : ""}<button class="btn ghost" style="flex:1" data-act="close">Annulla</button></div>`);
}

Object.assign(actions, {
  "plan-edit": (el) => openPlan(el.dataset.id),
  "plan-open": (el) => openPlanDetail(el.dataset.id),
  "plan-save": (el) => {
    const total = L.parseNum($("#plTotal").value), count = parseInt($("#plCount").value, 10), startDate = $("#plStart").value, endDate = $("#plEnd").value;
    if (!total || !count || !startDate || !endDate) { toast("Inserisci periodo, costo e numero di rate"); return; }
    if (endDate < startDate) { toast("La fine deve essere dopo l'inizio"); return; }
    store.mutate((d) => store.upsert(d, "plans", { id: el.dataset.id || store.uid(), number: +el.dataset.number, startDate, endDate, total, count }));
    closeModal(); render(); toast("Programma salvato"); runSync(`feat: update coaching program ${el.dataset.number}`, { quiet: true });
  },
  "pay-new": (el) => openPayment(null, el.dataset.plan),
  "pay-edit": (el) => openPayment(el.dataset.id),
  "pay-save": (el) => {
    const amount = L.parseNum($("#payAmount").value), date = $("#payDate").value;
    if (amount == null || !date) { toast("Inserisci data e importo"); return; }
    store.mutate((d) => store.upsert(d, "payments", { id: el.dataset.id || store.uid(), planId: el.dataset.plan, date, amount }));
    closeModal(); render(); toast("Rata salvata"); runSync(`feat: log coaching instalment (${date})`, { quiet: true });
  },
});

Object.assign(confirmed, {
  "delete-payment": (id) => deleteWithUndo("payments", id, "Rata eliminata", "fix: remove coaching instalment"),
  "delete-plan": (id) => deleteWithUndo("plans", id, "Programma eliminato", "fix: remove coaching program"),
});
