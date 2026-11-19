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
import { json } from './http.js';

const MODEL = 'claude-opus-5-5';
const VOLUMES = { 1: 'dictionnairearab01bibeuoft', 2: 'dictionnairearab02bibeuoft' };
const SUBMIT_PER_RUN = 1;   // lots soumis par passage (limite de calcul des tâches planifiées)

function iiif(v, n, region) {
  const ident = VOLUMES[v];
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
- lemmas : seulement les lemmes fournis dont le sens est réellement traité sur CETTE page (si l'article n'en montre qu'une partie, ou si le sens utile pour le Coran n'y figure pas, omets le lemme) ; fr = le sens qu'a ce mot DANS LE CORAN, court (1 à 5 mots, infinitif pour un verbe, sans article pour un nom), appuyé sur Kazimirski ; ok = true si notre traduction actuelle est juste ou acceptable pour le Coran, false seulement si elle est fausse, trompeuse ou nettement moins précise ; note = précision brève si utile (sinon chaîne vide) ;
- extra : jusqu'à 4 dérivés de la page, utiles pour lire le Coran ou l'arabe courant, absents de la liste (arabe vocalisé tel qu'imprimé + sens court) ; évite les sens techniques rares.
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

/** Lemmes du lexique pour un ensemble de racines (requêtes par paquets : D1 limite les paramètres). */
const DEF_SYSTEM = `Tu es lexicographe, spécialiste de l'arabe classique et coranique, et pédagogue pour des francophones.
Tu lis une page scannée du « Dictionnaire arabe-français » de A. de Biberstein Kazimirski (Paris, 1860), classé par racines, en 4 vues agrandies : colonne de gauche (haut, bas) puis colonne de droite (haut, bas).

On te donne des racines présentes sur la page et, pour chacune, la liste des mots à définir. Pour chaque mot de la liste qui est réellement traité sur CETTE page (sinon, omets-le) :
- ar : le mot tel qu'il est donné dans la liste ;
- definition : ses sens principaux selon Kazimirski, numérotés (1 à 4 sens, les plus importants d'abord), en français moderne et clair, 25 mots au plus ;
- nuance : en une phrase courte (20 mots au plus), ce qui distingue ce mot des autres mots de la liste au sens proche (forme, emploi, registre), pour qu'un apprenant ne les confonde pas ; chaîne vide si rien d'utile ;
- citation : un extrait EXACT du texte français de Kazimirski pour ce mot, recopié tel qu'imprimé (orthographe de 1860 comprise), 30 mots au plus, coupé avec « … » si besoin.
N'invente rien qui ne soit pas sur la page. Respecte la sensibilité religieuse du texte. Écris « Allah » pour اللَّه.`;

const DEF_SCHEMA = {
  type: 'object',
  properties: {
    roots: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          root: { type: 'string' },
          words: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                ar: { type: 'string' },
                definition: { type: 'string' },
                nuance: { type: 'string' },
                citation: { type: 'string' },
              },
              required: ['ar', 'definition', 'nuance', 'citation'],
              additionalProperties: false,
            },
          },
        },
        required: ['root', 'words'],
        additionalProperties: false,
      },
    },
  },
  required: ['roots'],
  additionalProperties: false,
};

const isDefs = kind => String(kind).startsWith('defs');

/** Mots à définir pour chaque racine : nos lemmes et les dérivés déjà relevés. */
async function wordsFor(env, roots) {
  const byRoot = await lemmasFor(env, roots);
  const words = new Map(roots.map(r => [r, (byRoot.get(r) || []).sort((a, b) => b.count - a.count).slice(0, 14).map(l => l.lemma)]));
  for (let k = 0; k < roots.length; k += 80) {
    const part = roots.slice(k, k + 80);
    const { results } = await env.DB
      .prepare(`SELECT root, data FROM kz_root WHERE root IN (${part.map((_, i) => `?${i + 1}`).join(',')})`)
      .bind(...part).all();
    for (const r of results) {
      try { for (const e of JSON.parse(r.data).extra || []) words.get(r.root)?.push(e.ar); } catch { /* ignore */ }
    }
  }
  return words;
}

function defRequest(v, n, targets, words) {
  const lines = targets.map(root => `• Racine ${[...root].join('-')} (${root}) : ${words.get(root).join(' ، ')}`);
  return {
    custom_id: `v${v}-n${n}`,
    params: {
      model: MODEL,
      max_tokens: 16000,
      system: DEF_SYSTEM,
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: DEF_SCHEMA } },
      messages: [{
        role: 'user',
        content: [
          ...REGIONS.flatMap(([region, label]) => [
            { type: 'text', text: `Vue : ${label}` },
            { type: 'image', source: { type: 'url', url: iiif(v, n, region) } },
          ]),
          { type: 'text', text: `Racines et mots à définir (volume ${v}) :\n${lines.join('\n')}\n\nPour root, recopie la racine écrite entre parenthèses ci-dessus.` },
        ],
      }],
    },
  };
}

async function lemmasFor(env, roots) {
  const byRoot = new Map(roots.map(r => [r, []]));
  for (let k = 0; k < roots.length; k += 80) {
    const part = roots.slice(k, k + 80);
    const { results } = await env.DB
      .prepare(`SELECT lemma, root, en, fr, count FROM quran_lemma WHERE root IN (${part.map((_, i) => `?${i + 1}`).join(',')})`)
      .bind(...part).all();
    for (const r of results) byRoot.get(r.root)?.push(r);
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

/** Requêtes d'un lot : pages [[volume, vue, [racines attendues]], …], cibles calculées hors ligne. */
export async function buildRequests(env, pages, kind = 'full') {
  const roots = [...new Set(pages.flatMap(p => p[2] || []))];
  if (isDefs(kind)) {
    const words = await wordsFor(env, roots);
    return pages
      .map(([v, n, targets = []]) => ({ v, n, targets: targets.filter(r => words.get(r)?.length) }))
      .filter(p => p.targets.length)
      .map(p => defRequest(p.v, p.n, p.targets, words));
  }
  const byRoot = await lemmasFor(env, roots);
  return pages
    .map(([v, n, targets = []]) => ({ v, n, targets: targets.filter(r => byRoot.get(r)?.length) }))
    .filter(p => p.targets.length)
    .map(p => pageRequest(p.v, p.n, p.targets, byRoot));
}

/**
 * Tâche planifiée, conçue pour rester sous la limite de calcul d'un passage :
 * soumet quelques lots en attente, puis relève au plus un lot terminé.
 */
export async function processKazimirski(env) {
  if (!env.DB || !env.ANTHROPIC_API_KEY) return { state: 'not_configured' };
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const report = { submitted: 0, waiting: 0, ingested: null };

  const { results: queued } = await env.DB
    .prepare("SELECT id, kind, pages FROM kz_job WHERE status = 'queued' ORDER BY id LIMIT ?1").bind(SUBMIT_PER_RUN).all();
  for (const job of queued) {
    const requests = await buildRequests(env, JSON.parse(job.pages), job.kind);
    if (!requests.length) {
      await env.DB.prepare("UPDATE kz_job SET status = 'ingested', updated_at = ?1 WHERE id = ?2").bind(Date.now(), job.id).run();
      continue;
    }
    const batch = await client.messages.batches.create({ requests });
    await env.DB.prepare("UPDATE kz_job SET status = 'submitted', batch_id = ?1, error = NULL, updated_at = ?2 WHERE id = ?3")
      .bind(batch.id, Date.now(), job.id).run();
    report.submitted++;
  }

  const { results: submitted } = await env.DB
    .prepare("SELECT id, kind, pages, batch_id FROM kz_job WHERE status = 'submitted' ORDER BY id LIMIT 6").all();
  for (const job of submitted) {
    const batch = await client.messages.batches.retrieve(job.batch_id);
    if (batch.processing_status !== 'ended') { report.waiting++; continue; }
    report.ingested = await ingest(env, client, job);
    break; // une seule ingestion par passage
  }
  if (!queued.length && !submitted.length) return { state: 'idle' };
  return report;
}

async function ingest(env, client, job) {
  const now = Date.now();
  let input = 0, output = 0, ok = 0, failed = 0;
  const pages = [];
  const retry = new Set();
  let firstError = '';
  for await (const item of await client.messages.batches.results(job.batch_id)) {
    const [, v, n] = item.custom_id.match(/^v(\d+)-n(\d+)$/) || [];
    if (item.result.type !== 'succeeded') {
      failed++;
      retry.add(item.custom_id);
      if (!firstError) firstError = `${item.result.type}: ${item.result.error?.error?.message || item.result.error?.message || JSON.stringify(item.result.error || {}).slice(0, 200)}`;
      continue;
    }
    const msg = item.result.message;
    input += (msg.usage.input_tokens || 0) + (msg.usage.cache_read_input_tokens || 0) + (msg.usage.cache_creation_input_tokens || 0);
    output += msg.usage.output_tokens || 0;
    if (msg.stop_reason !== 'end_turn') { failed++; continue; }
    const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('');
    let data;
    try { data = JSON.parse(text); } catch { failed++; continue; }
    ok++;
    pages.push({ v: Number(v), n: Number(n), text, data });
  }
  const table = isDefs(job.kind) ? 'kz_def_page' : 'kz_page';
  const stmt = env.DB.prepare(`INSERT INTO ${table} (volume, view, job_id, result, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT (volume, view) DO UPDATE SET job_id = excluded.job_id, result = excluded.result, updated_at = excluded.updated_at`);
  const writes = pages.map(p => stmt.bind(p.v, p.n, job.id, p.text, now));
  for (let k = 0; k < writes.length; k += 50) await env.DB.batch(writes.slice(k, k + 50));
  if (isDefs(job.kind)) await mergeDefs(env, pages); else await mergeRoots(env, pages);
  // Les pages en échec (image indisponible, surcharge…) repartent dans un nouveau lot, deux fois au plus
  const next = { full: 'retry', pilot: 'retry', retry: 'retry2', defs: 'defs-retry', 'defs-pilot': 'defs-retry', 'defs-retry': 'defs-retry2' }[job.kind];
  if (retry.size && next) {
    const again = JSON.parse(job.pages).filter(([v, n]) => retry.has(`v${v}-n${n}`));
    if (again.length) {
      await env.DB.prepare("INSERT INTO kz_job (kind, status, pages, created_at, updated_at) VALUES (?1, 'queued', ?2, ?3, ?3)")
        .bind(next, JSON.stringify(again), now).run();
    }
  }
  await env.DB.prepare("UPDATE kz_job SET status = 'ingested', input_tokens = ?1, output_tokens = ?2, error = ?3, updated_at = ?4 WHERE id = ?5")
    .bind(input, output, failed ? `${failed} page(s) en échec — ${firstError}`.slice(0, 500) : null, now, job.id).run();
  return { job: job.id, ok, failed, input, output };
}

/** Fusionne les pages lues dans la synthèse par racine (seulement les racines concernées). */
async function mergeRoots(env, pages) {
  // Racine renvoyée parfois entourée de parenthèses ou d'espaces : on la nettoie
  const clean = r => {
    const s = String(r || '');
    const inner = s.match(/\(([^)]+)\)/);   // « ب-أ-ر (بأر) » → « بأر »
    return (inner ? inner[1] : s).replace(/[()\s\-‐]/g, '');
  };
  const found = pages.flatMap(p => (p.data.roots || [])
    .filter(r => r.found && clean(r.root))
    .map(r => ({ ...r, root: clean(r.root), page: [p.v, p.n] })));
  const roots = [...new Set(found.map(r => r.root))];
  if (!roots.length) return;
  const merged = new Map();
  for (let k = 0; k < roots.length; k += 80) {
    const part = roots.slice(k, k + 80);
    const { results } = await env.DB
      .prepare(`SELECT root, data FROM kz_root WHERE root IN (${part.map((_, i) => `?${i + 1}`).join(',')})`)
      .bind(...part).all();
    for (const r of results) { try { merged.set(r.root, JSON.parse(r.data)); } catch { /* ignore */ } }
  }
  for (const r of found.sort((a, b) => a.page[0] - b.page[0] || a.page[1] - b.page[1])) {
    const m = merged.get(r.root) || { sense: '', lemmas: {}, extra: [], pages: [] };
    if (!m.sense && r.sense) m.sense = r.sense;
    for (const l of r.lemmas || []) {
      if (!l.lemma || !l.fr) continue;
      const prev = m.lemmas[l.lemma];
      // Prudence : si une page juge notre traduction correcte, on la garde
      if (!prev) m.lemmas[l.lemma] = { fr: l.fr, ok: l.ok, note: l.note || '' };
      else if (l.ok && !prev.ok) m.lemmas[l.lemma] = { ...prev, ok: true };
    }
    for (const e of r.extra || []) if (e.ar && e.fr && m.extra.length < 8 && !m.extra.some(x => x.ar === e.ar)) m.extra.push(e);
    if (!m.pages.some(p => p[0] === r.page[0] && p[1] === r.page[1])) m.pages.push(r.page);
    merged.set(r.root, m);
  }
  const now = Date.now();
  const stmt = env.DB.prepare(`INSERT INTO kz_root (root, sense, data, updated_at) VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT (root) DO UPDATE SET sense = excluded.sense, data = excluded.data, updated_at = excluded.updated_at`);
  const writes = roots.map(root => stmt.bind(root, merged.get(root).sense, JSON.stringify(merged.get(root)), now));
  for (let k = 0; k < writes.length; k += 50) await env.DB.batch(writes.slice(k, k + 50));
}

const cleanRoot = r => {
  const s = String(r || '');
  const inner = s.match(/\(([^)]+)\)/);
  return (inner ? inner[1] : s).replace(/[()\s\-‐]/g, '');
};

/** Ajoute définition, nuance et citation aux mots de la synthèse (lemmes et dérivés). */
async function mergeDefs(env, pages) {
  const found = pages.flatMap(p => (p.data.roots || []).map(r => ({ root: cleanRoot(r.root), words: r.words || [] })))
    .filter(r => r.root && r.words.length);
  const roots = [...new Set(found.map(r => r.root))];
  if (!roots.length) return;
  const merged = new Map();
  for (let k = 0; k < roots.length; k += 80) {
    const part = roots.slice(k, k + 80);
    const { results } = await env.DB
      .prepare(`SELECT root, data FROM kz_root WHERE root IN (${part.map((_, i) => `?${i + 1}`).join(',')})`)
      .bind(...part).all();
    for (const r of results) { try { merged.set(r.root, JSON.parse(r.data)); } catch { /* ignore */ } }
  }
  const strip = w => String(w || '').replace(/[ً-ٰٟـ]/g, '');
  for (const { root, words } of found) {
    const m = merged.get(root) || { sense: '', lemmas: {}, extra: [], pages: [] };
    m.defs = m.defs || {};
    for (const w of words) {
      if (!w.ar || !w.definition) continue;
      // Clé = le mot tel que fourni ; on garde la première définition trouvée (page où commence l'article)
      const key = Object.keys(m.lemmas).find(l => l === w.ar || strip(l) === strip(w.ar))
        || (m.extra || []).find(e => e.ar === w.ar || strip(e.ar) === strip(w.ar))?.ar
        || w.ar;
      if (!m.defs[key]) m.defs[key] = { definition: w.definition, nuance: w.nuance || '', citation: w.citation || '' };
    }
    merged.set(root, m);
  }
  const now = Date.now();
  const stmt = env.DB.prepare(`INSERT INTO kz_root (root, sense, data, updated_at) VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT (root) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`);
  const writes = roots.map(root => stmt.bind(root, merged.get(root).sense || '', JSON.stringify(merged.get(root)), now));
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
