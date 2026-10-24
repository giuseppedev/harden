// GitHub sync through the REST "contents" API, called straight from the browser.
// The token never leaves this device except in requests to api.github.com.
import * as store from "./data.js";

const CFG_KEY = "gymlog.github.cfg";
const TOKEN_KEY = "gymlog.github.token";
const META_KEY = "gymlog.github.meta";

export function getConfig() {
  try { return { branch: "main", path: "harden-data.json", ...JSON.parse(localStorage.getItem(CFG_KEY) || "{}") }; }
  catch { return { branch: "main", path: "harden-data.json" }; }
}
export function setConfig(cfg) { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); }
export const getToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; } };
export function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }
export function getMeta() { try { return JSON.parse(localStorage.getItem(META_KEY) || "{}"); } catch { return {}; } }
function setMeta(m) { localStorage.setItem(META_KEY, JSON.stringify({ ...getMeta(), ...m })); }

export function isConfigured() {
  const c = getConfig();
  return !!(c.owner && c.repo && c.path && getToken());
}

// UTF-8 safe base64
const toB64 = (str) => {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromB64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), (c) => c.charCodeAt(0)));

class SyncError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${getToken()}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (res.status === 404) return { status: 404 };
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = {
      401: "Il token non è valido o è scaduto. Creane uno nuovo e inseriscilo nelle impostazioni.",
      403: "Il token non ha il permesso di scrivere sul repository. Controlla che abbia Contents: Read and write.",
      409: "Il file è cambiato su GitHub mentre sincronizzavi.",
      422: "Il file è cambiato su GitHub mentre sincronizzavi.",
    }[res.status] || `GitHub ha risposto con un errore (${res.status}). ${json.message || ""}`;
    throw new SyncError(msg, res.status);
  }
  return { status: res.status, json };
}

const fileUrl = (c) => `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}/contents/${c.path.split("/").map(encodeURIComponent).join("/")}`;

export async function fetchRemote() {
  const c = getConfig();
  const r = await api("GET", `${fileUrl(c)}?ref=${encodeURIComponent(c.branch)}`);
  if (r.status === 404) return null;
  let text;
  if (r.json.content) text = fromB64(r.json.content);
  else {
    // Files over 1 MB come without inline content: fetch the blob instead.
    const blob = await api("GET", r.json.git_url);
    text = fromB64(blob.json.content);
  }
  return { sha: r.json.sha, data: JSON.parse(text) };
}

async function putRemote(data, sha, message) {
  const c = getConfig();
  const body = { message, content: toB64(JSON.stringify(data, null, 1)), branch: c.branch };
  if (sha) body.sha = sha;
  const r = await api("PUT", fileUrl(c), body);
  return r.json.content.sha;
}

/** Check that repository and token work, without writing anything. */
export async function testConnection() {
  const c = getConfig();
  const r = await api("GET", `https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}`);
  if (r.status === 404) throw new SyncError("Repository non trovato. Controlla proprietario e nome, e che il token possa accedervi.", 404);
  const file = await fetchRemote();
  return { private: r.json.private, fileExists: !!file };
}

let running = null;

/**
 * Pull, merge, push. Local and remote changes are merged record by record,
 * so editing from two devices never loses a session.
 */
export function sync(message = "Aggiornamento Harden") {
  if (running) return running;
  running = (async () => {
    if (!isConfigured()) throw new SyncError("Collega prima il repository GitHub nelle impostazioni.", 0);
    if (!navigator.onLine) throw new SyncError("Sei offline: sincronizzo appena torna la connessione.", 0);
    for (let attempt = 0; attempt < 3; attempt++) {
      const remote = await fetchRemote();
      const local = store.get();
      const merged = remote ? store.merge(local || store.emptyData(), remote.data) : local;
      const needsPush = !remote || !store.sameContent(merged, remote.data);
      try {
        let sha = remote?.sha;
        if (needsPush) sha = await putRemote(merged, remote?.sha, message);
        // Keep anything edited on this device while the request was running.
        const latest = store.get();
        const final = latest ? store.merge(latest, merged) : merged;
        store.replace(final, { dirty: !store.sameContent(final, merged) });
        setMeta({ lastSync: new Date().toISOString(), sha });
        return { pushed: needsPush };
      } catch (e) {
        if (e.status === 409 || e.status === 422) continue; // someone wrote in between: pull again
        throw e;
      }
    }
    throw new SyncError("Il file su GitHub continua a cambiare. Riprova tra poco.", 409);
  })().finally(() => { running = null; });
  return running;
}

/** First setup on a device: take the GitHub copy as the starting point. */
export async function downloadReplace() {
  const remote = await fetchRemote();
  if (!remote) throw new SyncError(`Nel repository non c'è ancora il file ${getConfig().path}.`, 404);
  store.replace(remote.data, { dirty: false });
  setMeta({ lastSync: new Date().toISOString(), sha: remote.sha });
}
