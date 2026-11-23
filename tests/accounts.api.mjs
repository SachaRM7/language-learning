// Test d'intégration des comptes, contre `wrangler dev` avec une base D1 LOCALE :
//   npx wrangler d1 migrations apply helloarabic --local
//   npx wrangler d1 execute helloarabic --local --command "INSERT INTO records (user_id, store, key, data, updated_at, synced_at) VALUES ('proprio@exemple.fr','stats','arabic','{\"totalXP\":42}',1,1)"
//   npx wrangler dev   (sans DEV_USER)   puis : npm run test:accounts
// À lancer sur une base locale vierge de comptes (le premier compte devient administrateur).
const B = process.env.BASE_URL || 'http://127.0.0.1:8787/api/';
const jar = {};
async function call(who, path, { method = 'GET', body, origin } = {}) {
  const headers = { accept: 'application/json' };
  if (body) headers['content-type'] = 'application/json';
  if (jar[who]) headers.cookie = jar[who];
  if (origin) headers.origin = origin;
  const res = await fetch(B + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const sc = res.headers.get('set-cookie');
  if (sc) jar[who] = sc.split(';')[0];
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data, cookie: sc };
}
const ok = (label, cond, extra = '') => { console.log(cond ? '✅' : '❌', label, extra); if (!cond) process.exitCode = 1; };

let r = await call('anon', 'me'); ok('sans compte : /me = 401', r.status === 401);
r = await call('anon', 'quran/lemmas'); ok('lecture publique : lemmas', r.status === 200);
r = await call('anon', 'kazimirski/roots'); ok('lecture publique : kazimirski', r.status === 200);
r = await call('anon', 'sync', { method: 'POST', body: { since: 0, changes: [] } }); ok('synchro sans compte refusée', r.status === 401);
r = await call('anon', 'tutor', { method: 'POST', body: {} }); ok('Karim sans compte refusé', r.status === 401);

r = await call('x', 'auth/register', { method: 'POST', body: { email: 'intrus@exemple.fr', password: 'motdepasse123' } });
ok('inscription sans invitation refusée', r.status === 403, r.data?.error);
r = await call('owner', 'auth/register', { method: 'POST', body: { email: 'Proprio@Exemple.fr', password: 'court' } });
ok('mot de passe trop court refusé', r.status === 400, r.data?.error);
r = await call('owner', 'auth/register', { method: 'POST', body: { email: 'Proprio@Exemple.fr', password: 'motdepasse-proprio' } });
ok('premier compte = adresse qui a déjà des données → admin', r.status === 201 && r.data.admin === true, JSON.stringify(r.data));
ok('cookie HttpOnly Secure SameSite', /HttpOnly/.test(r.cookie) && /Secure/.test(r.cookie) && /SameSite=Lax/.test(r.cookie));
r = await call('owner', 'me'); ok('/me connecté (session, admin)', r.status === 200 && r.data.via === 'session' && r.data.admin, JSON.stringify(r.data));
r = await call('owner', 'sync', { method: 'POST', body: { since: 0, changes: [] } });
ok('synchro : retrouve les données existantes de l’adresse', r.status === 200 && r.data.changes.some(c => c.data?.totalXP === 42));

r = await call('y', 'auth/register', { method: 'POST', body: { email: 'autre@exemple.fr', password: 'motdepasse123' } });
ok('second compte sans invitation refusé (plus de bootstrap)', r.status === 403);

r = await call('owner', 'admin/invites', { method: 'POST', body: { note: 'Yasmine', maxUses: 1, days: 30 } });
const code = r.data?.code; ok('admin crée une invitation', r.status === 201 && /^[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code), code);
r = await call('anon', `auth/invite?code=${code}`); ok('vérification du code', r.data?.valid === true);
r = await call('yasmine', 'auth/register', { method: 'POST', body: { email: 'yasmine@exemple.fr', password: 'motdepasse-yasmine', invite: code.toLowerCase() } });
ok('inscription avec invitation', r.status === 201 && r.data.admin === false);
r = await call('z', 'auth/register', { method: 'POST', body: { email: 'z@exemple.fr', password: 'motdepasse123', invite: code } });
ok('invitation déjà utilisée refusée', r.status === 403, r.data?.error);
r = await call('yasmine', 'admin/invites'); ok('non-admin : administration refusée', r.status === 403);
r = await call('yasmine', 'sync', { method: 'POST', body: { since: 0, changes: [] } });
ok('données séparées entre comptes', r.status === 200 && r.data.changes.length === 0);

r = await call('owner', 'admin/invites', { method: 'POST', body: {}, origin: 'https://site-malveillant.example' });
ok('requête venant d’un autre site refusée', r.status === 403, r.data?.error);

r = await call('fresh', 'auth/login', { method: 'POST', body: { email: 'yasmine@exemple.fr', password: 'mauvais' } });
ok('mauvais mot de passe : message générique', r.status === 401 && /incorrect/.test(r.data.message));
let last;
for (let i = 0; i < 11; i++) last = await call('fresh', 'auth/login', { method: 'POST', body: { email: 'yasmine@exemple.fr', password: 'mauvais' } });
ok('trop de tentatives : blocage 15 min', last.status === 429, last.data?.message);

r = await call('owner', 'admin/reset-password', { method: 'POST', body: { email: 'yasmine@exemple.fr' } });
const temp = r.data?.temporary; ok('admin : mot de passe provisoire (et débloque)', r.status === 200 && temp?.length > 10);
r = await call('yasmine', 'me'); ok('ancienne session de Yasmine fermée', r.status === 401);
r = await call('yasmine', 'auth/login', { method: 'POST', body: { email: 'YASMINE@exemple.fr', password: temp } });
ok('connexion avec le provisoire → doit changer', r.status === 200 && r.data.mustChange === true);
r = await call('yasmine', 'auth/password', { method: 'POST', body: { current: temp, next: 'nouveau-mdp-2026' } });
ok('changement de mot de passe', r.status === 200);
r = await call('yasmine', 'me'); ok('plus de changement obligatoire', r.data?.mustChange === false);
r = await call('yasmine', 'auth/logout', { method: 'POST' }); ok('déconnexion', r.status === 200 && /Max-Age=0/.test(r.cookie));
r = await call('yasmine', 'me'); ok('session supprimée après déconnexion', r.status === 401);
r = await call('owner', 'admin/users'); ok('liste des comptes', r.data?.users?.length === 2, r.data?.users?.map(u => u.email).join(', '));
if (process.exitCode) console.error('Des vérifications ont échoué.');
