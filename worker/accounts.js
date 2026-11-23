// worker/accounts.js — Comptes HelloArabic : inscription sur invitation, e-mail + mot de passe,
// sessions par cookie (HttpOnly), administration (invitations, utilisateurs).
//
// Identifiant d'un compte = e-mail en minuscules, comme les données synchronisées (records.user_id).
// Mots de passe : PBKDF2-SHA256 (WebCrypto), sel aléatoire, nombre d'itérations stocké par compte
// (réglable avec la variable PASSWORD_ITERATIONS ; un compte est re-haché à la connexion suivante).
// Sessions : jeton aléatoire de 256 bits dans le cookie, seule son empreinte SHA-256 est en base.

import { json, readJson, httpError } from './http.js';

export const SESSION_COOKIE = 'ha_session';
const SESSION_DAYS = 365;
const DAY = 24 * 3600e3;
const DEFAULT_ITERATIONS = 100_000; // plafond de PBKDF2 dans les Workers
const MIN_PASSWORD = 8;
const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // sans 0/O, 1/I/L

const enc = new TextEncoder();
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes)));
const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));
const now = () => Date.now();

export const normalizeEmail = email => String(email || '').trim().toLowerCase();
const validEmail = email => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);

function iterations(env) {
  const n = Number(env.PASSWORD_ITERATIONS);
  return Number.isInteger(n) && n >= 10_000 && n <= 100_000 ? n : DEFAULT_ITERATIONS;
}

async function derive(password, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256);
}

export async function hashPassword(password, env) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iter = iterations(env);
  return { pass_hash: b64(await derive(password, salt, iter)), pass_salt: b64(salt), pass_iter: iter };
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function verifyPassword(password, user) {
  const bits = new Uint8Array(await derive(password, unb64(user.pass_salt), user.pass_iter));
  return sameBytes(bits, unb64(user.pass_hash));
}

async function sha256(text) {
  return b64(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

function randomToken(bytes = 32) {
  return b64(crypto.getRandomValues(new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function inviteCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map(b => INVITE_ALPHABET[b % INVITE_ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

function checkPassword(password) {
  if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
    throw httpError(400, 'weak_password', `Le mot de passe doit contenir au moins ${MIN_PASSWORD} caractères.`);
  }
  if (password.length > 200) throw httpError(400, 'weak_password', 'Mot de passe trop long.');
}

// ── Cookies & sessions ────────────────────────────────────────────────

function readCookie(request, name) {
  const raw = request.headers.get('cookie') || '';
  const m = raw.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? decodeURIComponent(m[1]) : null;
}

function sessionCookie(token, maxAgeSeconds) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
}

async function createSession(env, userId, request) {
  const token = randomToken();
  const t = now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_seen, agent) VALUES (?1, ?2, ?3, ?4, ?3, ?5)')
    .bind(await sha256(token), userId, t, t + SESSION_DAYS * DAY, (request.headers.get('user-agent') || '').slice(0, 160))
    .run();
  return sessionCookie(token, SESSION_DAYS * 24 * 3600);
}

/** Compte de la session (cookie), ou null. Prolonge la session au plus une fois par jour. */
export async function sessionUser(request, env) {
  if (!env.DB) return null;
  const token = readCookie(request, SESSION_COOKIE);
  if (!token || token.length > 100) return null;
  const hash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT s.token_hash, s.expires_at, s.last_seen, u.id, u.email, u.is_admin, u.must_change
       FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?1`,
  ).bind(hash).first().catch(() => null); // table absente avant la migration : pas de session
  if (!row) return null;
  const t = now();
  if (row.expires_at < t) {
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(hash).run();
    return null;
  }
  if (t - row.last_seen > DAY) {
    await env.DB.prepare('UPDATE sessions SET last_seen = ?1, expires_at = ?2 WHERE token_hash = ?3')
      .bind(t, t + SESSION_DAYS * DAY, hash).run();
  }
  return { id: row.id, email: row.email, admin: Boolean(row.is_admin), mustChange: Boolean(row.must_change), via: 'session', tokenHash: hash };
}

// ── Limitation des tentatives ─────────────────────────────────────────

async function throttle(env, key, limit, windowMs) {
  const t = now();
  const row = await env.DB.prepare('SELECT count, reset_at FROM auth_attempts WHERE key = ?1').bind(key).first();
  if (row && row.reset_at > t && row.count >= limit) {
    const minutes = Math.ceil((row.reset_at - t) / 60e3);
    throw httpError(429, 'too_many_attempts', `Trop de tentatives. Réessaie dans ${minutes} minute${minutes > 1 ? 's' : ''}.`);
  }
  if (!row || row.reset_at <= t) {
    await env.DB.prepare('INSERT OR REPLACE INTO auth_attempts (key, count, reset_at) VALUES (?1, 1, ?2)').bind(key, t + windowMs).run();
  } else {
    await env.DB.prepare('UPDATE auth_attempts SET count = count + 1 WHERE key = ?1').bind(key).run();
  }
}

const clearThrottle = (env, key) => env.DB.prepare('DELETE FROM auth_attempts WHERE key = ?1').bind(key).run();
const clientIp = request => request.headers.get('cf-connecting-ip') || 'local';

// ── Routes publiques : inscription, connexion ─────────────────────────

/** Premier compte : une adresse qui possède déjà des données synchronisées (l'ancien compte Access). */
async function canBootstrap(env, id) {
  const anyUser = await env.DB.prepare('SELECT 1 FROM users LIMIT 1').first();
  if (anyUser) return false;
  if (env.ADMIN_EMAIL && normalizeEmail(env.ADMIN_EMAIL) === id) return true;
  return Boolean(await env.DB.prepare('SELECT 1 FROM records WHERE user_id = ?1 LIMIT 1').bind(id).first());
}

export async function handleRegister(request, env) {
  const body = await readJson(request, 8 * 1024);
  const email = String(body.email || '').trim();
  const id = normalizeEmail(email);
  if (!validEmail(id)) throw httpError(400, 'invalid_email', 'Adresse e-mail invalide.');
  checkPassword(body.password);
  await throttle(env, `register:${clientIp(request)}`, 10, 3600e3);

  if (await env.DB.prepare('SELECT 1 FROM users WHERE id = ?1').bind(id).first()) {
    throw httpError(409, 'email_taken', 'Un compte existe déjà avec cette adresse. Connecte-toi.');
  }

  const bootstrap = await canBootstrap(env, id);
  const code = String(body.invite || '').trim().toUpperCase();
  let invite = null;
  if (!bootstrap) {
    if (!code) throw httpError(403, 'invite_required', 'Il faut un code d’invitation pour créer un compte.');
    invite = await env.DB.prepare('SELECT * FROM invites WHERE code = ?1').bind(code).first();
    if (!invite || invite.revoked || invite.uses >= invite.max_uses || (invite.expires_at && invite.expires_at < now())) {
      throw httpError(403, 'invalid_invite', 'Ce code d’invitation n’est pas valide ou a déjà servi.');
    }
  }

  const pass = await hashPassword(body.password, env);
  const t = now();
  const statements = [
    env.DB.prepare(`INSERT INTO users (id, email, pass_hash, pass_salt, pass_iter, is_admin, invited_by, created_at, last_login_at)
                    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)`)
      .bind(id, email, pass.pass_hash, pass.pass_salt, pass.pass_iter, bootstrap ? 1 : 0, invite?.created_by || null, t),
  ];
  if (invite) {
    // Consomme l'invitation seulement si elle est encore disponible (deux inscriptions simultanées)
    statements.push(env.DB.prepare('UPDATE invites SET uses = uses + 1 WHERE code = ?1 AND uses < max_uses').bind(code));
  }
  const results = await env.DB.batch(statements);
  if (invite && !results[1].meta.changes) {
    await env.DB.prepare('DELETE FROM users WHERE id = ?1').bind(id).run();
    throw httpError(403, 'invalid_invite', 'Ce code d’invitation vient d’être utilisé.');
  }

  const cookie = await createSession(env, id, request);
  return json({ ok: true, email, admin: bootstrap }, 201, { 'set-cookie': cookie });
}

export async function handleLogin(request, env) {
  const body = await readJson(request, 8 * 1024);
  const id = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  await throttle(env, `login-ip:${clientIp(request)}`, 30, 15 * 60e3);
  await throttle(env, `login:${id}`, 10, 15 * 60e3);

  const user = id && password ? await env.DB.prepare('SELECT * FROM users WHERE id = ?1').bind(id).first() : null;
  if (!user || !(await verifyPassword(password, user))) {
    throw httpError(401, 'invalid_credentials', 'E-mail ou mot de passe incorrect.');
  }
  await clearThrottle(env, `login:${id}`);

  const t = now();
  const updates = [env.DB.prepare('UPDATE users SET last_login_at = ?1 WHERE id = ?2').bind(t, id)];
  if (user.pass_iter !== iterations(env)) {
    const pass = await hashPassword(password, env); // nouveau réglage d'itérations
    updates.push(env.DB.prepare('UPDATE users SET pass_hash = ?1, pass_salt = ?2, pass_iter = ?3 WHERE id = ?4')
      .bind(pass.pass_hash, pass.pass_salt, pass.pass_iter, id));
  }
  await env.DB.batch(updates);
  const cookie = await createSession(env, id, request);
  return json({ ok: true, email: user.email, admin: Boolean(user.is_admin), mustChange: Boolean(user.must_change) }, 200, { 'set-cookie': cookie });
}

export async function handleLogout(request, env, user) {
  if (user?.tokenHash) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?1').bind(user.tokenHash).run();
  return json({ ok: true }, 200, { 'set-cookie': sessionCookie('', 0) });
}

/** Vérifie un code d'invitation avant l'inscription (affiche « invitation de … »). */
export async function handleInviteCheck(request, env) {
  await throttle(env, `invite-check:${clientIp(request)}`, 30, 3600e3);
  const code = String(new URL(request.url).searchParams.get('code') || '').trim().toUpperCase();
  const invite = code ? await env.DB.prepare('SELECT * FROM invites WHERE code = ?1').bind(code).first() : null;
  const valid = Boolean(invite && !invite.revoked && invite.uses < invite.max_uses && !(invite.expires_at && invite.expires_at < now()));
  return json({ valid });
}

// ── Compte connecté ───────────────────────────────────────────────────

export async function handleChangePassword(request, env, user) {
  const body = await readJson(request, 8 * 1024);
  checkPassword(body.next);
  const row = await env.DB.prepare('SELECT * FROM users WHERE id = ?1').bind(user.id).first();
  if (!row) throw httpError(404, 'no_account', 'Aucun compte pour cette adresse.');
  await throttle(env, `password:${user.id}`, 10, 15 * 60e3);
  if (!(await verifyPassword(String(body.current || ''), row))) {
    throw httpError(401, 'invalid_credentials', 'Mot de passe actuel incorrect.');
  }
  const pass = await hashPassword(body.next, env);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pass_hash = ?1, pass_salt = ?2, pass_iter = ?3, must_change = 0 WHERE id = ?4')
      .bind(pass.pass_hash, pass.pass_salt, pass.pass_iter, user.id),
    // Les autres appareils sont déconnectés ; celui-ci garde sa session
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1 AND token_hash != ?2').bind(user.id, user.tokenHash || ''),
  ]);
  return json({ ok: true });
}

// ── Administration ────────────────────────────────────────────────────

function requireAdmin(user) {
  if (!user?.admin) throw httpError(403, 'forbidden', 'Réservé à l’administrateur.');
}

export async function handleAdminInvites(request, env, user) {
  requireAdmin(user);
  if (request.method === 'POST') {
    const body = await readJson(request, 8 * 1024);
    const maxUses = Math.min(Math.max(Number.parseInt(body.maxUses, 10) || 1, 1), 50);
    const days = Math.min(Math.max(Number.parseInt(body.days, 10) || 30, 1), 365);
    const note = String(body.note || '').trim().slice(0, 80) || null;
    const code = inviteCode();
    await env.DB.prepare('INSERT INTO invites (code, created_by, note, max_uses, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(code, user.id, note, maxUses, now(), now() + days * DAY).run();
    return json({ code }, 201);
  }
  if (request.method === 'DELETE') {
    const code = String(new URL(request.url).searchParams.get('code') || '').toUpperCase();
    await env.DB.prepare('UPDATE invites SET revoked = 1 WHERE code = ?1').bind(code).run();
    return json({ ok: true });
  }
  const { results } = await env.DB.prepare('SELECT code, note, max_uses, uses, created_at, expires_at, revoked FROM invites ORDER BY created_at DESC LIMIT 100').all();
  return json({ invites: results });
}

export async function handleAdminUsers(request, env, user) {
  requireAdmin(user);
  const { results } = await env.DB.prepare(
    `SELECT id, email, is_admin, invited_by, created_at, last_login_at,
            (SELECT count(*) FROM sessions s WHERE s.user_id = users.id AND s.expires_at > ?1) AS sessions
       FROM users ORDER BY created_at`,
  ).bind(now()).all();
  return json({ users: results });
}

/** L'administrateur génère un mot de passe provisoire (aucun e-mail n'est envoyé). */
export async function handleAdminResetPassword(request, env, user) {
  requireAdmin(user);
  const body = await readJson(request, 8 * 1024);
  const id = normalizeEmail(body.email);
  if (!(await env.DB.prepare('SELECT 1 FROM users WHERE id = ?1').bind(id).first())) throw httpError(404, 'no_account', 'Compte introuvable.');
  const temporary = `${inviteCode()}-${inviteCode()}`.toLowerCase();
  const pass = await hashPassword(temporary, env);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET pass_hash = ?1, pass_salt = ?2, pass_iter = ?3, must_change = 1 WHERE id = ?4')
      .bind(pass.pass_hash, pass.pass_salt, pass.pass_iter, id),
    env.DB.prepare('DELETE FROM sessions WHERE user_id = ?1').bind(id),
    env.DB.prepare('DELETE FROM auth_attempts WHERE key = ?1').bind(`login:${id}`),
  ]);
  return json({ email: id, temporary });
}

/** État du compte pour /api/me (compte existant, administrateur, mot de passe à changer). */
export async function accountInfo(env, user) {
  if (user.via === 'session') return { account: true, admin: user.admin, mustChange: user.mustChange };
  // Connexion par Cloudflare Access (avant la bascule) : propose de créer le compte
  const row = await env.DB.prepare('SELECT is_admin FROM users WHERE id = ?1').bind(user.id).first().catch(() => null);
  return { account: Boolean(row), admin: Boolean(row?.is_admin), mustChange: false, canBootstrap: !row && await canBootstrap(env, user.id).catch(() => false) };
}
