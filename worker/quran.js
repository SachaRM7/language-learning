// worker/quran.js — Gloses françaises du Coran, générées par Claude une fois par sourate puis mises en cache dans D1.
//
// Les données de base (texte, glose anglaise, lemmes, racines) sont embarquées (public/data/quran).
// Seul le sens en français mot à mot manque dans les sources libres : on le produit ici, en contexte.

import Anthropic from '@anthropic-ai/sdk';
import { ASSETS } from './assets.generated.js';
import { json, httpError } from './http.js';

const SYSTEM_PROMPT = `Tu es un traducteur spécialiste de l'arabe coranique et un pédagogue pour des francophones qui apprennent le vocabulaire du Coran.

On te donne une sourate mot à mot : pour chaque mot, sa forme arabe, une glose anglaise contextuelle, et la traduction française du verset (Hamidullah) pour le contexte. On te donne aussi la liste des lemmes (forme de base) de la sourate avec leur racine et une glose anglaise.

Produis :
- "words" : pour chaque mot (identifié par son numéro "i"), une glose française courte (1 à 5 mots) fidèle au sens du mot dans ce verset, cohérente avec la traduction du verset. Garde les parenthèses de l'anglais quand elles signalent un mot implicite. Écris « Allah » pour اللَّه.
- "lemmas" : pour chaque lemme, son sens de base en français, court (1 à 4 mots) : infinitif pour un verbe (ex. « dire »), nom ou adjectif au singulier sans article pour un nom (ex. « miséricorde », « miséricordieux »), sens grammatical simple pour une particule ou un pronom (ex. « il, lui », « de, depuis »).

Respecte la sensibilité religieuse du texte et reste sobre. Couvre tous les numéros et tous les lemmes fournis.`;

const SCHEMA = {
  type: 'object',
  properties: {
    words: {
      type: 'array',
      items: {
        type: 'object',
        properties: { i: { type: 'integer' }, fr: { type: 'string' } },
        required: ['i', 'fr'],
        additionalProperties: false,
      },
    },
    lemmas: {
      type: 'array',
      items: {
        type: 'object',
        properties: { lemma: { type: 'string' }, fr: { type: 'string' } },
        required: ['lemma', 'fr'],
        additionalProperties: false,
      },
    },
  },
  required: ['words', 'lemmas'],
  additionalProperties: false,
};

function loadSurah(n) {
  const asset = ASSETS[`/data/quran/surah-${n}.json`];
  return asset ? JSON.parse(asset.s) : null;
}

let _lexicon = null;
function lexicon() {
  if (!_lexicon) {
    const asset = ASSETS['/data/quran/lexicon.json'];
    _lexicon = asset ? JSON.parse(asset.s) : { lemmas: {}, glossEn: {} };
  }
  return _lexicon;
}

export async function handleQuranFr(request, env) {
  if (!env.DB) throw httpError(503, 'sync_unavailable');
  const url = new URL(request.url);
  const n = Number(url.searchParams.get('surah'));
  if (!Number.isInteger(n) || n < 1 || n > 114) throw httpError(400, 'invalid_surah');

  const cached = await env.DB.prepare('SELECT data FROM quran_fr WHERE surah = ?1').bind(n).first();
  if (cached) return json({ surah: n, ...JSON.parse(cached.data) }, 200, { 'cache-control': 'private, max-age=86400' });
  if (request.method === 'GET') return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } }); // pas encore généré

  const surah = loadSurah(n);
  if (!surah) throw httpError(404, 'surah_not_bundled');
  if (!env.ANTHROPIC_API_KEY) throw httpError(503, 'ai_not_configured');

  // Prépare l'entrée : mots numérotés + lemmes uniques
  const flat = [];
  const lines = [];
  for (const v of surah.verses) {
    lines.push(`\nVerset ${v.n} — « ${v.fr} »`);
    v.w.forEach((w, j) => {
      flat.push(`${v.n}:${j}`);
      lines.push(`${flat.length - 1} | ${w.t} | ${w.en}`);
    });
  }
  const lx = lexicon();
  const lemmaList = [...new Set(surah.verses.flatMap(v => v.w.map(w => w.l)).filter(Boolean))];
  const lemmaLines = lemmaList.map(l => `${l} | ${lx.lemmas[l]?.[0] || '—'} | ${lx.glossEn[l] || ''}`);

  const prompt = `Sourate ${surah.id} — ${surah.name} (${surah.nameAr}, « ${surah.nameFr} »)\n\nMOTS (i | arabe | anglais) :${lines.join('\n')}\n\nLEMMES (lemme | racine | anglais) :\n${lemmaLines.join('\n')}`;

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let response;
  try {
    response = await client.beta.messages.create({
      model: env.TUTOR_MODEL || 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw httpError(429, 'rate_limited');
    if (err instanceof Anthropic.APIError) {
      console.error('Anthropic API error', err.status, err.message);
      throw httpError(502, 'ai_error');
    }
    throw err;
  }
  if (response.stop_reason === 'refusal') throw httpError(422, 'refused');
  if (response.stop_reason === 'max_tokens') throw httpError(502, 'ai_truncated');

  let parsed;
  try {
    parsed = JSON.parse(response.content.filter(b => b.type === 'text').map(b => b.text).join(''));
  } catch { throw httpError(502, 'ai_bad_output'); }

  const words = {};
  for (const { i, fr } of parsed.words || []) {
    if (Number.isInteger(i) && flat[i] && typeof fr === 'string' && fr.trim()) words[flat[i]] = fr.trim().slice(0, 80);
  }
  const lemmas = {};
  const known = new Set(lemmaList);
  for (const { lemma, fr } of parsed.lemmas || []) {
    if (known.has(lemma) && typeof fr === 'string' && fr.trim()) lemmas[lemma] = fr.trim().slice(0, 60);
  }
  const data = { words, lemmas };
  await env.DB.prepare('INSERT OR REPLACE INTO quran_fr (surah, data, model, created_at) VALUES (?1, ?2, ?3, ?4)')
    .bind(n, JSON.stringify(data), response.model || '', Date.now()).run();
  return json({ surah: n, ...data, coverage: { words: Object.keys(words).length / flat.length, lemmas: Object.keys(lemmas).length / lemmaList.length } });
}
