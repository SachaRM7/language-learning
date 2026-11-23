// worker/index.js — Point d'entrée du Worker HelloArabic.
// Sert le frontend embarqué (public/) et l'API /api/*.

import { authenticate } from './auth.js';
import { handleSync } from './sync.js';
import { handleTutor } from './tutor.js';
import { handleQuranFr, handleQuranSurah } from './quran.js';
import { handleLemmasFr, translatePendingLemmas } from './lexicon.js';
import { processKazimirski, handleKazimirskiRoots } from './kazimirski.js';
import { json } from './http.js';
import { serveStatic } from './static.js';
import {
  handleRegister, handleLogin, handleLogout, handleInviteCheck, handleChangePassword,
  handleAdminInvites, handleAdminUsers, handleAdminResetPassword, accountInfo,
} from './accounts.js';

export default {
  // Tâche planifiée : traduit en français le lexique coranique restant (no-op une fois terminé)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(translatePendingLemmas(env)
      .then(r => console.log('lexique', JSON.stringify(r)))
      .catch(err => console.error('lexique : échec, nouvel essai au prochain passage', err?.message)));
    // Lecture du Kazimirski par lots (ne fait rien tant qu'aucun lot n'est en attente)
    ctx.waitUntil(processKazimirski(env)
      .then(r => { if (r.state !== 'idle') console.log('kazimirski', JSON.stringify(r)); })
      .catch(async err => {
        console.error('kazimirski : échec, nouvel essai au prochain passage', err?.message);
        // Garder la dernière erreur visible dans la table (les journaux en direct ne sont pas toujours là)
        await env.DB?.prepare("UPDATE kz_job SET error = ?1, updated_at = ?2 WHERE status IN ('queued', 'submitted')")
          .bind(String(err?.message || err).slice(0, 500), Date.now()).run().catch(() => {});
      }));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return serveStatic(request);

    try {
      // Anti-CSRF : une requête qui modifie quelque chose doit venir de l'app elle-même
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        const origin = request.headers.get('origin');
        if (origin && origin !== url.origin) return json({ error: 'forbidden_origin' }, 403);
      }

      const route = `${request.method} ${url.pathname}`;
      // Lecture publique (contenu, rien de personnel) : utilisable sans compte
      switch (route) {
        case 'GET /api/quran/surah':
          return await handleQuranSurah(request, env);
        case 'GET /api/quran/lemmas':
          return await handleLemmasFr(request, env);
        case 'GET /api/kazimirski/roots':
          return await handleKazimirskiRoots(request, env);
        case 'GET /api/quran/fr':
          return await handleQuranFr(request, env);
        case 'POST /api/auth/register':
          return await handleRegister(request, env);
        case 'POST /api/auth/login':
          return await handleLogin(request, env);
        case 'GET /api/auth/invite':
          return await handleInviteCheck(request, env);
      }

      const user = await authenticate(request, env);
      if (route === 'POST /api/auth/logout') return await handleLogout(request, env, user);
      if (!user) return json({ error: 'unauthorized' }, 401);

      switch (route) {
        case 'GET /api/me':
          return json({
            email: user.email,
            ai: Boolean(env.ANTHROPIC_API_KEY),
            sync: Boolean(env.DB),
            via: user.via,
            ...(env.DB ? await accountInfo(env, user) : {}),
          });
        case 'POST /api/sync':
          return await handleSync(request, env, user);
        case 'POST /api/tutor':
          return await handleTutor(request, env, user);
        case 'POST /api/quran/fr':
          return await handleQuranFr(request, env);
        case 'POST /api/auth/password':
          return await handleChangePassword(request, env, user);
        case 'GET /api/admin/invites':
        case 'POST /api/admin/invites':
        case 'DELETE /api/admin/invites':
          return await handleAdminInvites(request, env, user);
        case 'GET /api/admin/users':
          return await handleAdminUsers(request, env, user);
        case 'POST /api/admin/reset-password':
          return await handleAdminResetPassword(request, env, user);
        default:
          return json({ error: 'not_found' }, 404);
      }
    } catch (err) {
      if (err?.status && err.expose) return json({ error: err.code || 'bad_request', message: err.message }, err.status);
      console.error('API error', err);
      return json({ error: 'server_error' }, 500);
    }
  },
};
