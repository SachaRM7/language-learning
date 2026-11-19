// worker/static.js — Sert le frontend embarqué (voir scripts/embed-assets.mjs).

import { ASSETS } from './assets.generated.js';

const _bytes = new Map();

function body(asset, path) {
  if (asset.s !== undefined) return asset.s;
  if (!_bytes.has(path)) _bytes.set(path, Uint8Array.from(atob(asset.b), c => c.charCodeAt(0)));
  return _bytes.get(path);
}

export function serveStatic(request) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
  }
  const url = new URL(request.url);
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { path = url.pathname; }
  if (path.endsWith('/')) path += 'index.html';

  let asset = ASSETS[path];
  // Application monopage : toute route sans extension renvoie le shell
  if (!asset && !/\.[a-z0-9]+$/i.test(path)) { path = '/index.html'; asset = ASSETS[path]; }
  if (!asset) return new Response('Not Found', { status: 404 });

  const etag = `"${asset.e}"`;
  const isMedia = /^(image|audio|font)\//.test(asset.t);
  const headers = {
    'content-type': asset.t,
    etag,
    // Code et données : toujours revalidés (mises à jour immédiates) ; médias : une semaine
    'cache-control': isMedia ? 'public, max-age=604800' : 'no-cache',
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'same-origin',
  };
  if (path === '/sw.js') headers['service-worker-allowed'] = '/';

  const inm = request.headers.get('if-none-match');
  if (inm && inm.split(',').map(s => s.trim()).includes(etag)) return new Response(null, { status: 304, headers });
  return new Response(request.method === 'HEAD' ? null : body(asset, path), { status: 200, headers });
}
