// worker/index.js — Point d'entrée du Worker HelloArabic.
// Sert le frontend embarqué (public/) et l'API /api/*.

import { authenticate } from './auth.js';
import { handleSync } from './sync.js';
import { handleTutor } from './tutor.js';
import { handleQuranFr, handleQuranSurah } from './quran.js';
import { handleLemmasFr, translatePendingLemmas } from './lexicon.js';
import { json } from './http.js';
import { serveStatic } from './static.js';

export default {
  // Tâche planifiée : traduit en français le lexique coranique restant (no-op une fois terminé)
  async scheduled(event, env, ctx) {
    ctx.waitUntil(translatePendingLemmas(env)
      .then(r => console.log('lexique', JSON.stringify(r)))
      .catch(err => console.error('lexique : échec, nouvel essai au prochain passage', err?.message)));
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return serveStatic(request);

    try {
      const user = await authenticate(request, env);
      if (!user) return json({ error: 'unauthorized' }, 401);

      const route = `${request.method} ${url.pathname}`;
      switch (route) {
        case 'GET /api/me':
          return json({ email: user.email, ai: Boolean(env.ANTHROPIC_API_KEY), sync: Boolean(env.DB) });
        case 'POST /api/sync':
          return await handleSync(request, env, user);
        case 'POST /api/tutor':
          return await handleTutor(request, env, user);
        case 'GET /api/quran/lemmas':
          return await handleLemmasFr(request, env);
        case 'GET /api/quran/surah':
          return await handleQuranSurah(request, env);
        case 'GET /api/quran/fr':
        case 'POST /api/quran/fr':
          return await handleQuranFr(request, env);
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
