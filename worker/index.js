// worker/index.js — Point d'entrée du Worker HelloArabic.
// Les fichiers statiques (public/) sont servis par Cloudflare sans passer ici ; seules les routes /api/* arrivent.

import { authenticate } from './auth.js';
import { handleSync } from './sync.js';
import { handleTutor } from './tutor.js';
import { json } from './http.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

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
