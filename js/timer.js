// Rest timer (survives closing the app: it stores the end time) and the screen wake lock used while training.
import { $ } from "./core.js";

const TIMER_KEY = "gymlog.timer";
let tick = null, audioCtx = null, beeped = false;

export function timerState() { try { return JSON.parse(localStorage.getItem(TIMER_KEY) || "null"); } catch { return null; } }
export function saveTimer(t) { t ? localStorage.setItem(TIMER_KEY, JSON.stringify(t)) : localStorage.removeItem(TIMER_KEY); }

export function unlockAudio() {
  try {
    audioCtx ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  } catch { /* no audio */ }
}
function beep() {
  try {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime;
    [0, 0.25, 0.5].forEach((dt) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.4, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
      o.start(t0 + dt); o.stop(t0 + dt + 0.2);
    });
  } catch { /* ignore */ }
  navigator.vibrate?.([200, 100, 200]);
}

export function startTimer(seconds, label) {
  if (!seconds) return;
  unlockAudio();
  beeped = false;
  saveTimer({ endAt: Date.now() + seconds * 1000, total: seconds, label });
  drawTimer();
}
export const stopTimer = () => { saveTimer(null); drawTimer(); };

export function drawTimer() {
  const t = timerState(), el = $("#timer");
  clearInterval(tick);
  if (!t) { el.hidden = true; return; }
  el.hidden = false;
  const paint = () => {
    const left = Math.max(0, Math.round((t.endAt - Date.now()) / 1000));
    $("#tVal").textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    $("#tBar").style.width = `${Math.min(100, 100 - (left / t.total) * 100)}%`;
    const over = left === 0;
    el.classList.toggle("over", over);
    $("#tInfo").textContent = over ? "Recupero finito · vai con la prossima serie" : `Recupero · ${t.label}`;
    if (over) {
      clearInterval(tick);
      if (!beeped && Date.now() - t.endAt < 5000) beep();
      beeped = true;
    }
  };
  paint();
  tick = setInterval(paint, 250);
}

export function initTimer() {
  $("#tPlus").addEventListener("click", () => { const t = timerState(); if (!t) return; t.endAt = Math.max(t.endAt, Date.now()) + 15000; t.total += 15; beeped = false; saveTimer(t); drawTimer(); });
  $("#tMinus").addEventListener("click", () => { const t = timerState(); if (!t) return; t.endAt = Math.max(Date.now(), t.endAt - 15000); saveTimer(t); drawTimer(); });
  $("#tStop").addEventListener("click", stopTimer);
  drawTimer();
}

let lock = null;
export async function wakeLock(on) {
  try {
    if (on && !lock && "wakeLock" in navigator && document.visibilityState === "visible") {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener("release", () => { lock = null; });
    } else if (!on && lock) { await lock.release(); lock = null; }
  } catch { lock = null; }
}
