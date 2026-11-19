// worker/lexicon.js — Traduction française de tout le lexique coranique (≈ 4 800 lemmes).
//
// Une tâche planifiée (cron) traduit les lemmes encore sans français, par lots, des plus fréquents
// aux plus rares, jusqu'à ce que tout soit fait (ensuite elle ne fait plus rien et ne coûte rien).
// L'app récupère le résultat via GET /api/quran/lemmas.

import Anthropic from '@anthropic-ai/sdk';
import { json } from './http.js';

const BATCH = 200;          // lemmes par appel
const BATCHES_PER_RUN = 4;  // appels par déclenchement

const SYSTEM_PROMPT = `Tu es un traducteur spécialiste de l'arabe coranique et un pédagogue pour des francophones qui apprennent le vocabulaire du Coran.

On te donne une liste de lemmes (forme de base) avec leur racine, leur nature et une glose anglaise. Pour chacun, donne son sens de base en français, court (1 à 4 mots) :
- infinitif pour un verbe (ex. « dire », « être miséricordieux ») ;
- nom ou adjectif au singulier, sans article (ex. « miséricorde », « louable ») ;
- pour un nom propre, son nom français usuel (ex. « Muhammad », « Moïse », « Égypte ») ;
- pour une particule ou un pronom, son sens grammatical simple (ex. « de, depuis », « il, lui »).
Écris « Allah » pour اللَّه. Reste sobre et respecte la sensibilité religieuse du texte. Couvre tous les lemmes fournis, sans en inventer.`;

const SCHEMA = {
  type: 'object',
  properties: {
    lemmas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { i: { type: 'integer' }, fr: { type: 'string' } },
        required: ['i', 'fr'],
        additionalProperties: false,
      },
    },
  },
  required: ['lemmas'],
  additionalProperties: false,
};

/** GET /api/quran/lemmas → { total, done, fr: { lemme: sens } } */
export async function handleLemmasFr(request, env) {
  const { results } = await env.DB.prepare('SELECT lemma, fr FROM quran_lemma WHERE fr IS NOT NULL').all();
  const total = await env.DB.prepare('SELECT count(*) AS n FROM quran_lemma').first('n');
  const fr = Object.fromEntries(results.map(r => [r.lemma, r.fr]));
  return json({ total, done: results.length, fr }, 200, { 'cache-control': 'private, max-age=300' });
}

/** Tâche planifiée : traduit quelques lots de lemmes restants. */
export async function translatePendingLemmas(env) {
  if (!env.DB || !env.ANTHROPIC_API_KEY) return { translated: 0, reason: 'not_configured' };
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let translated = 0;
  for (let i = 0; i < BATCHES_PER_RUN; i++) {
    const { results } = await env.DB
      .prepare('SELECT lemma, root, pos, en FROM quran_lemma WHERE fr IS NULL ORDER BY count DESC LIMIT ?1')
      .bind(BATCH).all();
    if (!results.length) break;
    const fr = await translateBatch(client, env, results);
    const now = Date.now();
    const stmt = env.DB.prepare('UPDATE quran_lemma SET fr = ?1, updated_at = ?2 WHERE lemma = ?3 AND fr IS NULL');
    // Un lemme oublié par le modèle garde sa glose anglaise pour ne pas boucler indéfiniment dessus
    const writes = results.map(r => stmt.bind((fr[r.lemma] || r.en || '—').slice(0, 60), now, r.lemma));
    for (let k = 0; k < writes.length; k += 100) await env.DB.batch(writes.slice(k, k + 100));
    translated += results.length;
  }
  return { translated };
}

async function translateBatch(client, env, rows) {
  // Chaque lemme est identifié par son numéro : le modèle peut renvoyer l'arabe avec une graphie
  // légèrement différente (ordre des voyelles, caractères invisibles), le numéro, lui, est fiable.
  const lines = rows.map((r, i) => `${i} | ${r.lemma} | ${r.root || '—'} | ${r.pos || ''} | ${r.en || ''}`);
  let response;
  try {
    response = await client.beta.messages.create({
      model: env.TUTOR_MODEL || 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `LEMMES (i | lemme | racine | nature | anglais) — réponds avec le numéro i de chaque lemme :\n${lines.join('\n')}` }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) console.error('Anthropic API error (lexique)', err.status, err.message);
    throw err;
  }
  if (response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens') {
    throw new Error(`lexique : arrêt ${response.stop_reason}`);
  }
  const parsed = JSON.parse(response.content.filter(b => b.type === 'text').map(b => b.text).join(''));
  const out = {};
  for (const { i, fr } of parsed.lemmas || []) {
    if (Number.isInteger(i) && rows[i] && typeof fr === 'string' && fr.trim()) out[rows[i].lemma] = fr.trim();
  }
  return out;
}
