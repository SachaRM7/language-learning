// js/sync.js — Synchronisation « local-first » avec le Worker (Cloudflare D1).
// L'app fonctionne entièrement hors-ligne sur IndexedDB ; les modifications sont envoyées
// en arrière-plan et celles des autres appareils sont récupérées. Désactivée si /api absent.

import { db } from './db.js';
import { store } from './store.js';

const OUTBOX_KEY = 'ha-sync-outbox';     // { "store\u0001key": { at, deleted } }
const CURSOR_KEY = 'ha-sync-cursor';
const LAST_KEY = 'ha-sync-last';
const SEP = '\u0001';
const DEBOUNCE_MS = 2500;
const PERIOD_MS = 5 * 60 * 1000;

let _enabled = false;
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

  store.set('account', me);
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

export function syncStatus() {
  return store.get('syncStatus') || { state: 'disabled', enabled: false };
}
