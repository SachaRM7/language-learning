// worker/tutor.js — Karim, tuteur de conversation en arabe propulsé par Claude.
// La clé API reste côté Worker (secret ANTHROPIC_API_KEY) ; le navigateur n'y a jamais accès.

import Anthropic from '@anthropic-ai/sdk';
import { json, readJson, httpError } from './http.js';

// Prompt système figé (aucune donnée variable) → mis en cache entre les tours.
const SYSTEM_PROMPT = `Tu es Karim (كَرِيم), un ami arabophone chaleureux qui aide un francophone à apprendre l'arabe standard moderne (فُصْحَى) en discutant avec lui, comme sur une messagerie.

Ta façon d'écrire :
- Réponds en arabe standard simple, avec TOUS les signes voyelles (tashkīl complet) sur chaque mot, pour que l'apprenant puisse lire.
- Adapte la difficulté au niveau indiqué dans le contexte. En A1 : une ou deux phrases très courtes (environ 12 mots maximum), vocabulaire du quotidien, présent de l'indicatif. Monte doucement en A2/B1.
- Termine presque toujours par une question simple pour relancer la conversation et faire parler l'apprenant.
- Reste dans le scénario indiqué dans le contexte, avec naturel et bonne humeur.
- Reste en arabe standard ; si une expression dialectale très courante est utile, signale-le dans la traduction.

Quand l'apprenant t'écrit :
- S'il écrit en arabe avec des erreurs (grammaire, accord, vocabulaire, orthographe), remplis "correction" : la phrase corrigée avec tashkīl, et une explication courte et bienveillante en français (une ou deux phrases).
- S'il écrit en français ou en translittération, mets dans "correction" la façon de le dire en arabe (avec tashkīl) et explique brièvement. Puis réponds-lui normalement en arabe.
- Si sa phrase est correcte, "has_error" vaut false, "corrected_ar" et "explanation_fr" sont des chaînes vides. Ne corrige pas l'absence de voyelles : il n'est pas obligé de les écrire.
- Le tout premier message de l'apprenant peut être une simple consigne pour démarrer : ouvre alors la conversation toi-même, sans correction.

Champs à remplir :
- "reply_translit" : translittération simple et lisible pour un francophone (ex. : marḥaban, kayfa ḥāluka).
- "reply_fr" : traduction française naturelle de ta réponse.
- "vocab" : 0 à 3 mots ou expressions de ta réponse qui méritent d'être retenus (arabe avec tashkīl + français).
- "suggestions" : 2 ou 3 réponses courtes et correctes que l'apprenant pourrait t'envoyer, du niveau indiqué, avec tashkīl, translittération et français.`;

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    correction: {
      type: 'object',
      properties: {
        has_error: { type: 'boolean' },
        corrected_ar: { type: 'string' },
        explanation_fr: { type: 'string' },
      },
      required: ['has_error', 'corrected_ar', 'explanation_fr'],
      additionalProperties: false,
    },
    reply_ar: { type: 'string' },
    reply_translit: { type: 'string' },
    reply_fr: { type: 'string' },
    vocab: {
      type: 'array',
      items: {
        type: 'object',
        properties: { ar: { type: 'string' }, fr: { type: 'string' } },
        required: ['ar', 'fr'],
        additionalProperties: false,
      },
    },
    suggestions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { ar: { type: 'string' }, translit: { type: 'string' }, fr: { type: 'string' } },
        required: ['ar', 'translit', 'fr'],
        additionalProperties: false,
      },
    },
  },
  required: ['correction', 'reply_ar', 'reply_translit', 'reply_fr', 'vocab', 'suggestions'],
  additionalProperties: false,
};

const SCENARIOS = {
  libre: 'Discussion libre entre amis : prends des nouvelles, parle de la journée.',
  presentation: 'Première rencontre : vous vous présentez (prénom, pays, ville, âge, études ou travail).',
  cafe: 'Au café : Karim est le serveur ; l’apprenant commande une boisson et un gâteau, demande le prix.',
  famille: 'La famille : vous parlez de vos familles (parents, frères et sœurs, enfants).',
  loisirs: 'Les loisirs : ce que vous aimez faire le week-end, le sport, la musique, les films.',
  voyage: 'En voyage : l’apprenant arrive dans une ville arabe et demande son chemin, un hôtel, un taxi.',
  coran: 'Vocabulaire du Coran : l’apprenant mémorise des sourates. Discute de la vie quotidienne en réutilisant naturellement les mots listés (formes simples, sens courant), sans citer de versets ni commenter le texte sacré. Signale dans "vocab" les mots de la liste que tu as utilisés.',
};
const LEVELS = new Set(['A1', 'A2', 'B1']);
const MAX_TURNS = 40;
const MAX_CHARS = 1500;

export async function handleTutor(request, env) {
  if (!env.ANTHROPIC_API_KEY) throw httpError(503, 'ai_not_configured', 'Le tuteur IA n’est pas configuré.');
  const body = await readJson(request, 256 * 1024);

  const scenario = SCENARIOS[body.scenario] ? body.scenario : 'libre';
  const level = LEVELS.has(body.level) ? body.level : 'A1';
  const history = sanitizeHistory(body.messages);
  if (!history.length || history[history.length - 1].role !== 'user') throw httpError(400, 'invalid_messages');

  // Le contexte variable va dans le premier message utilisateur, pas dans le prompt système (cache).
  const focus = Array.isArray(body.focus)
    ? body.focus.filter(w => typeof w === 'string' && /^[\u0600-\u06FF\s]{1,30}$/.test(w)).slice(0, 15)
    : [];
  const context = `[Contexte] Niveau : ${level}. Scénario : ${SCENARIOS[scenario]}${focus.length ? `\nMots à réutiliser : ${focus.join('، ')}` : ''}`;
  history[0] = { role: 'user', content: `${context}\n\n${history[0].content}` };

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  let response;
  try {
    response = await client.beta.messages.create({
      model: env.TUTOR_MODEL || 'claude-opus-5-5',
      max_tokens: 4000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      cache_control: { type: 'ephemeral' },
      system: SYSTEM_PROMPT,
      messages: history,
      output_config: {
        effort: 'low',
        format: { type: 'json_schema', schema: RESPONSE_SCHEMA },
      },
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw httpError(429, 'rate_limited', 'Trop de messages, réessaie dans un instant.');
    if (err instanceof Anthropic.AuthenticationError) throw httpError(503, 'ai_auth', 'Clé API Anthropic invalide.');
    if (err instanceof Anthropic.APIError) {
      console.error('Anthropic API error', err.status, err.message);
      throw httpError(502, 'ai_error', 'Karim ne répond pas pour le moment.');
    }
    throw err;
  }

  if (response.stop_reason === 'refusal') {
    throw httpError(422, 'refused', 'Karim préfère parler d’autre chose. Essaie une autre phrase !');
  }
  const text = response.content.filter(b => b.type === 'text').map(b => b.text).join('');
  let turn;
  try { turn = JSON.parse(text); } catch {
    throw httpError(502, 'ai_bad_output', 'Réponse illisible, réessaie.');
  }
  return json({ turn, raw: text });
}

function sanitizeHistory(messages) {
  if (!Array.isArray(messages)) return [];
  const out = [];
  for (const m of messages.slice(-MAX_TURNS)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') continue;
    const content = m.content.trim().slice(0, m.role === 'user' ? MAX_CHARS : 8000);
    if (!content) continue;
    // Fusionne deux messages consécutifs du même rôle (l'API exige l'alternance)
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += `\n${content}`;
    else out.push({ role: m.role, content });
  }
  while (out.length && out[0].role !== 'user') out.shift();
  return out;
}
