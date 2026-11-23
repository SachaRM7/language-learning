// js/sync.js — Synchronisation « local-first » avec le Worker (Cloudflare D1).
// L'app fonctionne entièrement hors-ligne sur IndexedDB ; les modifications sont envoyées
// en arrière-plan et celles des autres appareils sont récupérées. Désactivée si /api absent.

import { db } from './db.js';
import { store } from './store.js';

const OUTBOX_KEY = 'ha-sync-outbox';     // { "store\u0001key": { at, deleted } }
const CURSOR_KEY = 'ha-sync-cursor';
const LAST_KEY = 'ha-sync-last';
const OWNER_KEY = 'ha-sync-owner';     // compte auquel appartiennent les données de cet appareil
const ADOPT_KEY = 'ha-sync-adopt';     // progression faite sans compte, à fusionner (le serveur l'emporte)
const SEP = '\u0001';
const DEBOUNCE_MS = 2500;
const PERIOD_MS = 5 * 60 * 1000;

let _enabled = false;
let _resolveAccount;
/** Résolue dès que l'on sait si un compte est connecté (réponse de /api/me, ou échec). */
export const accountReady = new Promise(r => { _resolveAccount = r; });
let _timer = null;
let _running = null;

const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } };

function emit(state, extra = {}) {
  const status = { state, enabled: _enabled, last: read(LAST_KEY, null), pending: Object.keys(read(OUTBOX_KEY, {})).length, ...extra };
  store.set('syncStatus', status);
  window.dispatchEvent(new CustomEvent('ha:sync', { detail: status }));
}

/** Démarre la synchro si le Worker répond. Renvoie le compte connecté (ou null). */
export async function initSync() {
  // Toute écriture locale part dans la boîte d'envoi, même avant connexion
  db.onChange((storeName, key, deleted) => {
    if (key === undefined || key === null) return;
    const outbox = read(OUTBOX_KEY, {});
    outbox[`${storeName}${SEP}${key}`] = { at: Date.now(), deleted };
    write(OUTBOX_KEY, outbox);
    if (_enabled) schedule();
  });

  let me = null;
  try {
    const res = await fetch('api/me', { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) me = await res.json();
  } catch { /* hors-ligne ou serveur statique */ }

  if (me?.email) await claimLocalData(me.email);
  store.set('account', me);
  _resolveAccount(me);
  _enabled = Boolean(me?.sync);
  emit(_enabled ? 'idle' : 'disabled');
  if (!_enabled) return me;

  syncNow();
  setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, PERIOD_MS);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') syncNow({ keepalive: true }); });
  window.addEventListener('online', () => syncNow());
  return me;
}

function schedule() {
  clearTimeout(_timer);
  _timer = setTimeout(() => syncNow(), DEBOUNCE_MS);
}

export function syncNow(opts = {}) {
  if (!_enabled) return Promise.resolve({ applied: 0 });
  if (_running) return _running;
  _running = _doSync(opts).finally(() => { _running = null; });
  return _running;
}

async function _doSync({ keepalive = false } = {}) {
  emit('syncing');
  if (read(ADOPT_KEY, false)) {
    try { await adoptAnonymous(); } catch (err) { emit('error', { error: err.message }); return { applied: 0 }; }
  }
  const outbox = read(OUTBOX_KEY, {});
  const entries = Object.entries(outbox);
  const changes = [];
  for (const [id, meta] of entries) {
    const [storeName, key] = id.split(SEP);
    if (meta.deleted) { changes.push({ store: storeName, key, deleted: true, updated_at: meta.at }); continue; }
    const rec = await db._get(storeName, key);
    if (rec) changes.push({ store: storeName, key, data: rec, updated_at: rec._updatedAt || meta.at });
    else changes.push({ store: storeName, key, deleted: true, updated_at: meta.at });
  }

  let body;
  try {
    const res = await fetch('api/sync', {
      method: 'POST',
      credentials: 'same-origin',
      keepalive: keepalive && JSON.stringify(changes).length < 60_000,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ since: read(CURSOR_KEY, 0), changes }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    body = await res.json();
  } catch (err) {
    emit('error', { error: err.message });
    return { applied: 0 };
  }

  // Retire de la boîte d'envoi ce qui est parti (sauf si modifié entre-temps)
  const current = read(OUTBOX_KEY, {});
  for (const [id, meta] of entries) {
    if (current[id] && current[id].at === meta.at) delete current[id];
  }
  write(OUTBOX_KEY, current);

  const applied = await applyRemote(body.changes || []);
  write(CURSOR_KEY, body.cursor ?? read(CURSOR_KEY, 0));
  write(LAST_KEY, Date.now());
  emit('idle', { applied });
  if (applied > 0) window.dispatchEvent(new CustomEvent('ha:remote-changes', { detail: { applied } }));
  return { applied };
}

async function applyRemote(changes) {
  let applied = 0;
  let prefsChanged = false;
  const pending = read(OUTBOX_KEY, {});
  for (const c of changes) {
    if (pending[`${c.store}${SEP}${c.key}`]) continue; // une modification locale plus récente attend son envoi
    const local = await db._get(c.store, c.key);
    const localAt = local?._updatedAt || 0;
    if (c.deleted) {
      if (local && localAt <= c.updated_at) { await db._deleteRaw(c.store, c.key); applied++; }
    } else if (!local || localAt < c.updated_at) {
      await db._putRaw(c.store, { ...c.data, _updatedAt: c.updated_at });
      applied++;
      if (c.store === 'preferences') prefsChanged = true;
    }
  }
  if (prefsChanged) store.set('preferences', await db.getPreferences());
  return applied;
}

/**
 * Les données locales appartiennent au dernier compte connecté sur cet appareil. Si un autre compte
 * se connecte, elles sont effacées d'ici (elles restent dans le compte d'origine, déjà synchronisé).
 * Une progression faite sans compte est conservée et rejoint le compte qui se connecte.
 */
async function claimLocalData(email) {
  const id = email.toLowerCase();
  const owner = read(OWNER_KEY, null);
  if (owner === id) return;
  if (owner) {
    await wipeLocal();                    // données d'un autre compte : on repart du serveur
  } else if (!read(LAST_KEY, null) && !read(CURSOR_KEY, 0)) {
    write(ADOPT_KEY, true);               // progression faite sans compte : fusion prudente
    write(CURSOR_KEY, 0);
  }
  // Sinon : appareil déjà synchronisé avec cette adresse (connexion Cloudflare Access) — rien à changer
  write(OWNER_KEY, id);
}

/**
 * Première synchro d'une progression faite sans compte : on récupère d'abord tout le compte,
 * qui l'emporte en cas de doublon ; seuls les éléments absents du compte y sont ensuite ajoutés.
 */
async function adoptAnonymous() {
  const res = await fetch('api/sync', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ since: 0, changes: [] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = await res.json();
  const outbox = read(OUTBOX_KEY, {});
  let prefsChanged = false;
  for (const c of body.changes || []) {
    delete outbox[`${c.store}${SEP}${c.key}`];
    if (c.deleted) await db._deleteRaw(c.store, c.key);
    else {
      await db._putRaw(c.store, { ...c.data, _updatedAt: c.updated_at });
      if (c.store === 'preferences') prefsChanged = true;
    }
  }
  write(OUTBOX_KEY, outbox);
  write(CURSOR_KEY, body.cursor ?? 0);
  if (prefsChanged) store.set('preferences', await db.getPreferences());
  try { localStorage.removeItem(ADOPT_KEY); } catch { /* ignore */ }
  if ((body.changes || []).length) window.dispatchEvent(new CustomEvent('ha:remote-changes', { detail: { applied: body.changes.length } }));
}

async function wipeLocal() {
  await db.resetProgress();
  for (const k of [OUTBOX_KEY, CURSOR_KEY, LAST_KEY, ADOPT_KEY]) { try { localStorage.removeItem(k); } catch { /* ignore */ } }
}

/** Déconnexion : envoie d'abord ce qui reste, puis efface éventuellement la progression de l'appareil. */
export async function logout({ wipe = false } = {}) {
  try { await syncNow(); } catch { /* hors-ligne : la boîte d'envoi part à la prochaine connexion */ }
  try { await fetch('api/auth/logout', { method: 'POST', credentials: 'same-origin' }); } catch { /* ignore */ }
  if (wipe) {
    await wipeLocal();
    try { localStorage.removeItem(OWNER_KEY); } catch { /* ignore */ }
  }
}

export function syncStatus() {
  return store.get('syncStatus') || { state: 'disabled', enabled: false };
}
