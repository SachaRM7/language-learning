// worker/sync.js — Synchronisation « local-first » entre IndexedDB (navigateur) et D1.
//
// Requête  : { since: <curseur serveur>, changes: [{ store, key, data, updated_at, deleted }] }
// Réponse  : { cursor, changes: [...] } — tout ce qui a changé côté serveur depuis `since`.
// Conflits : la dernière écriture gagne (updated_at client). Le curseur utilise l'heure serveur
//            (synced_at) pour ne jamais manquer une modification à cause d'horloges décalées.

import { json, readJson, httpError } from './http.js';

const STORES = new Set(['preferences', 'srs', 'favorites', 'lessonProgress', 'stats', 'lessonDecks', 'evidence']);
const MAX_CHANGES = 3000;
const MAX_RECORD_BYTES = 200_000;
const PULL_LIMIT = 10_000;

const UPSERT = `
  INSERT INTO records (user_id, store, key, data, updated_at, synced_at, deleted)
  VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
  ON CONFLICT (user_id, store, key) DO UPDATE SET
    data = excluded.data,
    updated_at = excluded.updated_at,
    synced_at = excluded.synced_at,
    deleted = excluded.deleted
  WHERE excluded.updated_at > records.updated_at`;

export async function handleSync(request, env, user) {
  if (!env.DB) throw httpError(503, 'sync_unavailable');
  const body = await readJson(request, 8 * 1024 * 1024);
  const since = Number.isFinite(body.since) ? body.since : 0;
  const incoming = Array.isArray(body.changes) ? body.changes : [];
  if (incoming.length > MAX_CHANGES) throw httpError(413, 'too_many_changes');

  const now = Date.now();
  const stmt = env.DB.prepare(UPSERT);
  const writes = [];
  for (const c of incoming) {
    if (!c || !STORES.has(c.store) || typeof c.key !== 'string' || !c.key || c.key.length > 300) continue;
    const data = JSON.stringify(c.deleted ? null : (c.data ?? null));
    if (data.length > MAX_RECORD_BYTES) continue;
    const updatedAt = Number.isFinite(c.updated_at) ? Math.min(c.updated_at, now + 60_000) : now;
    writes.push(stmt.bind(user.id, c.store, c.key, data, updatedAt, now, c.deleted ? 1 : 0));
  }
  for (let i = 0; i < writes.length; i += 100) {
    await env.DB.batch(writes.slice(i, i + 100));
  }

  const { results } = await env.DB
    .prepare('SELECT store, key, data, updated_at, synced_at, deleted FROM records WHERE user_id = ?1 AND synced_at > ?2 ORDER BY synced_at LIMIT ?3')
    .bind(user.id, since, PULL_LIMIT)
    .all();

  const cursor = results.length ? results[results.length - 1].synced_at : since;
  return json({
    cursor,
    accepted: writes.length,
    changes: results.map(r => ({
      store: r.store,
      key: r.key,
      data: r.deleted ? null : JSON.parse(r.data),
      updated_at: r.updated_at,
      deleted: Boolean(r.deleted),
    })),
  });
}
