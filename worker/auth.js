// worker/auth.js — Identification : comptes HelloArabic (cookie de session, voir accounts.js) et,
// pendant la transition, Cloudflare Access (code e-mail, JWT signé ajouté à chaque requête).
// Le JWT Access est revérifié (signature RS256 + audience + émetteur + expiration).

import { sessionUser } from './accounts.js';

let _certs = { keys: null, fetchedAt: 0, team: '' };

/**
 * Utilisateur de la requête : session HelloArabic (cookie) d'abord, sinon Cloudflare Access
 * (tant qu'Access protège le domaine). Renvoie null si personne n'est connecté.
 */
export async function authenticate(request, env) {
  // Développement local uniquement : `wrangler dev --var DEV_USER:moi@local`
  const host = new URL(request.url).hostname;
  if (env.DEV_USER && (host === 'localhost' || host === '127.0.0.1')) {
    return { id: env.DEV_USER.toLowerCase(), email: env.DEV_USER, via: 'dev' };
  }
  const session = await sessionUser(request, env);
  if (session) return session;
  return accessUser(request, env);
}

async function accessUser(request, env) {

  const team = (env.ACCESS_TEAM_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!team || !env.ACCESS_AUD) return null;

  const token = request.headers.get('cf-access-jwt-assertion') || readCookie(request, 'CF_Authorization');
  if (!token) return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  let header, payload;
  try {
    header = JSON.parse(b64urlToString(h));
    payload = JSON.parse(b64urlToString(p));
  } catch { return null; }

  if (header.alg !== 'RS256') return null;
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;
  if (payload.iss !== `https://${team}`) return null;
  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now - 30) return null;
  if (payload.nbf && payload.nbf > now + 30) return null;

  const jwk = await findKey(team, header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlToBytes(s), new TextEncoder().encode(`${h}.${p}`));
  if (!valid || !payload.email) return null;

  return { id: String(payload.email).toLowerCase(), email: payload.email, via: 'access' };
}

async function findKey(team, kid) {
  const fresh = _certs.keys && _certs.team === team && Date.now() - _certs.fetchedAt < 60 * 60 * 1000;
  if (!fresh || !_certs.keys.some(k => k.kid === kid)) {
    const res = await fetch(`https://${team}/cdn-cgi/access/certs`);
    if (!res.ok) return null;
    const body = await res.json();
    _certs = { keys: body.keys || [], fetchedAt: Date.now(), team };
  }
  return _certs.keys.find(k => k.kid === kid) || null;
}

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  const m = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function b64urlToBytes(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(str.length / 4) * 4, '=');
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

function b64urlToString(str) {
  return new TextDecoder().decode(b64urlToBytes(str));
}
