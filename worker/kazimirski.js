// worker/kazimirski.js — Corriger et enrichir le lexique coranique avec le dictionnaire de Kazimirski (1860).
//
// L'OCR d'archive.org ne lit pas l'arabe : Claude lit directement les pages scannées (4 vues
// agrandies par page, servies par le IIIF d'archive.org). Pour chaque racine attendue sur la page,
// il donne le sens de base selon Kazimirski, vérifie la traduction française de nos lemmes et propose
// des dérivés importants. Le travail passe par l'API Message Batches (moitié prix) :
//   1. une ligne « queued » dans kz_job (pages à lire) ;
//   2. la tâche planifiée soumet le lot, puis relève les résultats quand il est terminé ;
//   3. les résultats par page sont fusionnés par racine dans kz_root.

import Anthropic from '@anthropic-ai/sdk';
import KZ from '../public/data/kazimirski.json' with { type: 'json' };
import { json } from './http.js';

const MODEL = 'claude-opus-5-5';
const HAMZA = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ء': 'ا', 'ؤ': 'ا', 'ئ': 'ا', 'ى': 'ي', 'ٱ': 'ا' };
const RANK = Object.fromEntries([...KZ.alphabet].map((c, i) => [c, i]));
const ANCHORS = KZ.anchors.map(([v, n, lo, hi]) => ({ v, n, lo, hi }));

const norm = r => [...String(r)].map(c => HAMZA[c] || c).join('');
const valid = r => r && [...norm(r)].every(c => RANK[c] !== undefined);
function cmp(a, b) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = RANK[a[i]] ?? -1, y = RANK[b[i]] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

/** Page (volume, vue) où commence la racine selon l'index. */
export function startPage(root) {
  const r = norm(root);
  const at = ANCHORS.find(a => cmp(a.hi, r) >= 0) || ANCHORS[ANCHORS.length - 1];
  return { v: at.v, n: cmp(at.lo, r) > 0 && at.n > 0 ? at.n - 1 : at.n };
}

/** Racines attendues sur une page : celles qui commencent sur cette page ou la précédente. */
function targetsFor(roots, v, n) {
  return roots.filter(r => {
    const p = startPage(r);
    return p.v === v && (p.n === n || p.n === n - 1);
  });
}

function iiif(v, n, region) {
  const ident = KZ.volumes[String(v)];
  const jp2 = String(n + 1).padStart(4, '0'); // la vue n d'archive.org est l'image _{n+1}.jp2
  return `https://iiif.archive.org/image/iiif/3/${ident}%2f${ident}_jp2.zip%2f${ident}_jp2%2f${ident}_${jp2}.jp2/${region}/max/0/default.jpg`;
}

const REGIONS = [
  ['pct:0,0,53,53', 'colonne de gauche, haut'],
  ['pct:0,47,53,53', 'colonne de gauche, bas'],
  ['pct:47,0,53,53', 'colonne de droite, haut'],
  ['pct:47,47,53,53', 'colonne de droite, bas'],
];

const SYSTEM = `Tu es lexicographe, spécialiste de l'arabe classique et coranique, et pédagogue pour des francophones.
Tu lis une page scannée du « Dictionnaire arabe-français » de A. de Biberstein Kazimirski (Paris, 1860), classé par racines.
La page est fournie en 4 vues agrandies qui se chevauchent légèrement : colonne de gauche (haut, bas) puis colonne de droite (haut, bas). Lis-les dans cet ordre ; un article peut commencer sur la page précédente ou continuer sur la suivante.

On te donne des racines susceptibles d'apparaître sur cette page, avec les lemmes de notre lexique coranique et leur traduction française actuelle (souvent traduite de l'anglais, parfois fausse ou approximative).
Pour chaque racine fournie :
- found : true seulement si l'article de cette racine (ou une partie) est réellement sur la page ;
- sense : le sens de base de la racine selon Kazimirski, en français moderne et simple (5 à 15 mots) ;
- lemmas : pour chaque lemme fourni dont le mot (ou sa forme verbale) est traité sur la page, fr = le sens le plus utile pour comprendre le Coran, court (1 à 5 mots, infinitif pour un verbe, sans article pour un nom), d'après Kazimirski ; ok = true si notre traduction actuelle est juste ; note = précision brève si utile (sinon chaîne vide) ;
- extra : jusqu'à 4 dérivés importants de la page qui ne sont pas dans la liste (arabe vocalisé tel qu'imprimé + sens court).
Modernise l'orthographe et le vocabulaire du XIXᵉ siècle ; n'invente rien qui ne soit pas sur la page ; si un mot est illisible, ignore-le. Respecte la sensibilité religieuse du texte. Écris « Allah » pour اللَّه.`;

const SCHEMA = {
  type: 'object',
  properties: {
    roots: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          root: { type: 'string' },
          found: { type: 'boolean' },
          sense: { type: 'string' },
          lemmas: {
            type: 'array',
            items: {
              type: 'object',
              properties: { lemma: { type: 'string' }, fr: { type: 'string' }, ok: { type: 'boolean' }, note: { type: 'string' } },
              required: ['lemma', 'fr', 'ok', 'note'],
              additionalProperties: false,
            },
          },
          extra: {
            type: 'array',
            items: {
              type: 'object',
              properties: { ar: { type: 'string' }, fr: { type: 'string' } },
              required: ['ar', 'fr'],
              additionalProperties: false,
            },
          },
        },
        required: ['root', 'found', 'sense', 'lemmas', 'extra'],
        additionalProperties: false,
      },
    },
  },
  required: ['roots'],
  additionalProperties: false,
};

async function lexiconRoots(env) {
  const { results } = await env.DB.prepare('SELECT lemma, root, pos, en, fr, count FROM quran_lemma WHERE root IS NOT NULL').all();
  const byRoot = new Map();
  for (const r of results) {
    if (!valid(r.root)) continue;
    if (!byRoot.has(r.root)) byRoot.set(r.root, []);
    byRoot.get(r.root).push(r);
  }
  return byRoot;
}

function pageRequest(v, n, targets, byRoot) {
  const lines = targets.map(root => {
    const lemmas = byRoot.get(root).sort((a, b) => b.count - a.count).slice(0, 14)
      .map(l => `   - ${l.lemma} : « ${l.fr || '—'} » [en : ${l.en || '—'}]`).join('\n');
    return `• Racine ${[...root].join('-')} (${root})\n${lemmas}`;
  });
  return {
    custom_id: `v${v}-n${n}`,
    params: {
      model: MODEL,
      max_tokens: 12000,
      system: SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          ...REGIONS.flatMap(([region, label]) => [
            { type: 'text', text: `Vue : ${label}` },
            { type: 'image', source: { type: 'url', url: iiif(v, n, region) } },
          ]),
          { type: 'text', text: `Racines attendues sur cette page (volume ${v}) :\n${lines.join('\n')}\n\nRéponds pour chacune de ces racines, avec la racine écrite exactement comme ci-dessus entre parenthèses.` },
        ],
      }],
    },
  };
}

/** Requêtes du lot pour une liste de pages [[volume, vue], …] (les pages sans racine attendue sont ignorées). */
export async function buildRequests(env, pages) {
  const byRoot = await lexiconRoots(env);
  const roots = [...byRoot.keys()];
  return pages
    .map(([v, n]) => ({ v, n, targets: targetsFor(roots, v, n) }))
    .filter(p => p.targets.length)
    .map(p => pageRequest(p.v, p.n, p.targets, byRoot));
}

/** Tâche planifiée : soumet le prochain lot en attente, ou relève les résultats d'un lot terminé. */
export async function processKazimirski(env) {
  if (!env.DB || !env.ANTHROPIC_API_KEY) return { state: 'not_configured' };
  const job = await env.DB.prepare("SELECT * FROM kz_job WHERE status IN ('queued', 'submitted') ORDER BY id LIMIT 1").first();
  if (!job) return { state: 'idle' };
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const now = Date.now();

  if (job.status === 'queued') {
    const requests = await buildRequests(env, JSON.parse(job.pages));
    if (!requests.length) {
      await env.DB.prepare("UPDATE kz_job SET status = 'ingested', updated_at = ?1 WHERE id = ?2").bind(now, job.id).run();
      return { state: 'empty', job: job.id };
    }
    const batch = await client.messages.batches.create({ requests });
    await env.DB.prepare("UPDATE kz_job SET status = 'submitted', batch_id = ?1, updated_at = ?2 WHERE id = ?3")
      .bind(batch.id, now, job.id).run();
    return { state: 'submitted', job: job.id, requests: requests.length };
  }

  const batch = await client.messages.batches.retrieve(job.batch_id);
  if (batch.processing_status !== 'ended') return { state: 'waiting', job: job.id, counts: batch.request_counts };

  let input = 0, output = 0, ok = 0, failed = 0;
  const writes = [];
  const stmt = env.DB.prepare(`INSERT INTO kz_page (volume, view, job_id, result, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT (volume, view) DO UPDATE SET job_id = excluded.job_id, result = excluded.result, updated_at = excluded.updated_at`);
  for await (const item of await client.messages.batches.results(job.batch_id)) {
    const [, v, n] = item.custom_id.match(/^v(\d+)-n(\d+)$/) || [];
    if (item.result.type !== 'succeeded') { failed++; continue; }
    const msg = item.result.message;
    input += (msg.usage.input_tokens || 0) + (msg.usage.cache_read_input_tokens || 0) + (msg.usage.cache_creation_input_tokens || 0);
    output += msg.usage.output_tokens || 0;
    if (msg.stop_reason !== 'end_turn') { failed++; continue; }
    const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
    try { JSON.parse(text); } catch { failed++; continue; }
    ok++;
    writes.push(stmt.bind(Number(v), Number(n), job.id, text, now));
  }
  for (let k = 0; k < writes.length; k += 50) await env.DB.batch(writes.slice(k, k + 50));
  await rebuildRoots(env);
  await env.DB.prepare("UPDATE kz_job SET status = 'ingested', input_tokens = ?1, output_tokens = ?2, error = ?3, updated_at = ?4 WHERE id = ?5")
    .bind(input, output, failed ? `${failed} page(s) en échec` : null, now, job.id).run();
  return { state: 'ingested', job: job.id, ok, failed, input, output };
}

/** Fusionne les résultats de toutes les pages lues, racine par racine. */
async function rebuildRoots(env) {
  const { results } = await env.DB.prepare('SELECT volume, view, result FROM kz_page ORDER BY volume, view').all();
  const merged = new Map();
  for (const row of results) {
    let data;
    try { data = JSON.parse(row.result); } catch { continue; }
    for (const r of data.roots || []) {
      if (!r.found || !r.root) continue;
      const m = merged.get(r.root) || { sense: '', lemmas: {}, extra: [], pages: [] };
      if (!m.sense && r.sense) m.sense = r.sense;
      for (const l of r.lemmas || []) if (l.lemma && l.fr && !m.lemmas[l.lemma]) m.lemmas[l.lemma] = { fr: l.fr, ok: l.ok, note: l.note || '' };
      for (const e of r.extra || []) if (e.ar && e.fr && m.extra.length < 8 && !m.extra.some(x => x.ar === e.ar)) m.extra.push(e);
      m.pages.push([row.volume, row.view]);
      merged.set(r.root, m);
    }
  }
  const now = Date.now();
  const stmt = env.DB.prepare(`INSERT INTO kz_root (root, sense, data, updated_at) VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT (root) DO UPDATE SET sense = excluded.sense, data = excluded.data, updated_at = excluded.updated_at`);
  const writes = [...merged].map(([root, m]) => stmt.bind(root, m.sense, JSON.stringify(m), now));
  for (let k = 0; k < writes.length; k += 50) await env.DB.batch(writes.slice(k, k + 50));
}

/** GET /api/kazimirski/roots → { racine: { sense, lemmas, extra, pages } } */
export async function handleKazimirskiRoots(request, env) {
  if (!env.DB) return json({ roots: {} });
  const { results } = await env.DB.prepare('SELECT root, data FROM kz_root').all();
  const roots = {};
  for (const r of results) { try { roots[r.root] = JSON.parse(r.data); } catch { /* ignore */ } }
  return json({ roots }, 200, { 'cache-control': 'private, max-age=300' });
}
