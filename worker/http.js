// worker/http.js — Petits utilitaires HTTP.

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

/** Erreur exposée telle quelle au client (validation, quota…). */
export function httpError(status, code, message) {
  const err = new Error(message || code);
  err.status = status;
  err.code = code;
  err.expose = true;
  return err;
}

export async function readJson(request, maxBytes = 512 * 1024) {
  const len = Number(request.headers.get('content-length') || 0);
  if (len > maxBytes) throw httpError(413, 'payload_too_large');
  const text = await request.text();
  if (text.length > maxBytes) throw httpError(413, 'payload_too_large');
  try { return JSON.parse(text || '{}'); } catch { throw httpError(400, 'invalid_json'); }
}
