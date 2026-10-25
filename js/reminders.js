// Reminders: every recurring task has a due date. It shows as "soon" a few days before (counting down)
// and as overdue after (counting up): chips in Home, a dot on the section, and a coloured countdown on the line
// that already shows the date inside the section.
import * as gh from "./github.js";
import * as L from "./logic.js";
import { esc, lastDate } from "./core.js";
import { planStatus } from "./views/payments.js";

/** Due date rules: weight every 3 days, circumferences every 7, instalment 30 days after the previous one, token on expiry. */
export function reminders(d) {
  const out = [];
  const add = (key, icon, name, ending, due, window, act, where) => {
    const dl = L.deadline(due, window);
    if (dl.state !== "ok") out.push({ key, icon, name, ending, due, act, where, ...dl });
  };
  const lw = lastDate(d.weights), lm = lastDate(d.measurements);
  add("weight", "⚖︎", "Peso", "o", lw && L.addDays(lw, 3), 1, "go-weight", "measures");
  add("circ", "📏", "Circonferenze", "e", lm && L.addDays(lm, 7), 3, "go-circ", "measures");
  const pay = planStatus(d);
  if (pay?.left) add("payment", "💶", `Rata ${pay.next} coaching`, "a", pay.dueBy, 3, "go-settings", "settings");
  const cfg = gh.getConfig();
  if (cfg.expiry && gh.isConfigured()) add("token", "🔑", "Token GitHub", "o", cfg.expiry, 15, "go-settings", "settings");
  return out;
}

/** "over" if anything in `list` is overdue, "soon" if something is coming up, otherwise "". */
export const worst = (list) => (list.some((r) => r.state === "over") ? "over" : list.length ? "soon" : "");
/** Reminders shown in one section. */
export const remindersFor = (d, where) => reminders(d).filter((r) => r.where === where);

/** Countdown appended to a line that already shows the date: orange while coming up, red once overdue. */
export const dueTag = (r) => (r && r.state !== "ok" ? ` · <span class="due ${r.state}">${esc(L.dueText(r, r.ending))}</span>` : "");
