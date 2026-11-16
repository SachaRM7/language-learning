// scripts/build-quran.mjs — Construit les données du module Coran (public/data/quran/).
//
// Sources (libres, avec attribution) :
//  - Texte, découpage mot à mot, glose anglaise, translittération, audio : API quran.com (v4)
//  - Traduction française des versets : Muhammad Hamidullah (via quran.com, ressource 31)
//  - Racines et lemmes : Quranic Arabic Corpus v0.4 (corpus.quran.com), version corrigée
//    github.com/mustafa0x/quran-morphology
//
// Usage : node scripts/build-quran.mjs            (sourates par défaut : 1 + 78…114)
//         node scripts/build-quran.mjs 1 2 36     (liste explicite)

import { mkdirSync, writeFileSync } from 'node:fs';

const OUT = new URL('../public/data/quran/', import.meta.url).pathname;
const API = 'https://api.quran.com/api/v4';
const MORPHO = 'https://raw.githubusercontent.com/mustafa0x/quran-morphology/master/quran-morphology.txt';
const TRANSLATION_FR = 31; // Hamidullah
const RECITER = 7;         // Mishary Rashid Alafasy

const args = process.argv.slice(2).map(Number).filter(Boolean);
const SURAHS = args.length ? args : [1, ...Array.from({ length: 37 }, (_, i) => 78 + i)];

const getJSON = async url => {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(url, { headers: { accept: 'application/json' } });
    if (res.ok) return res.json();
    if (attempt === 4) throw new Error(`${res.status} ${url}`);
    await new Promise(r => setTimeout(r, 800 * attempt));
  }
};
const stripTags = s => (s || '').replace(/<sup[^>]*>.*?<\/sup>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// ── Morphologie : racine + lemme + catégorie par mot ─────────────────
const POS_LABEL = { V: 'verbe', N: 'nom', PN: 'nom propre', ADJ: 'adjectif', PRON: 'pronom', DEM: 'démonstratif', REL: 'relatif', P: 'préposition', CONJ: 'conjonction', NEG: 'négation', T: 'temps', LOC: 'lieu', INTG: 'interrogatif', COND: 'condition', ACC: 'particule', EMPH: 'particule', VOC: 'vocatif' };

function parseMorphology(text) {
  const words = new Map();   // "s:v:w" -> { root, lemma, pos }
  const lemmaCount = new Map();
  for (const line of text.split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const [loc, , coarse, feats = ''] = line.split('\t');
    const [s, v, w] = loc.split(':');
    const key = `${s}:${v}:${w}`;
    const f = feats.split('|');
    const get = p => (f.find(x => x.startsWith(p)) || '').slice(p.length) || null;
    const isAffix = f.includes('PREF') || f.includes('SUFF');
    const entry = words.get(key) || { root: null, lemma: null, pos: null };
    const root = get('ROOT:');
    if (root && !entry.root) entry.root = root;
    if (!isAffix && !entry.lemma) {
      entry.lemma = get('LEM:');
      const fine = f.find(x => POS_LABEL[x]) || coarse;
      entry.pos = POS_LABEL[fine] || POS_LABEL[coarse] || 'mot';
    }
    words.set(key, entry);
  }
  // fallback : mot composé uniquement d'affixes (rare)
  for (const e of words.values()) if (!e.lemma) e.pos = e.pos || 'particule';
  for (const e of words.values()) if (e.lemma) lemmaCount.set(e.lemma, (lemmaCount.get(e.lemma) || 0) + 1);
  return { words, lemmaCount };
}

// ── Construction ─────────────────────────────────────────────────────
async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log('Morphologie…');
  const { words: morpho, lemmaCount } = parseMorphology(await fetch(MORPHO).then(r => r.text()));

  // Lexique global (tout le Coran) : lemme → [racine, occurrences, catégorie] ; racine → lemmes triés
  const lemmas = {};
  const roots = {};
  for (const e of morpho.values()) {
    if (!e.lemma || lemmas[e.lemma]) continue;
    lemmas[e.lemma] = [e.root, lemmaCount.get(e.lemma), e.pos];
    if (e.root) (roots[e.root] ||= []).push(e.lemma);
  }
  for (const r of Object.keys(roots)) roots[r].sort((a, b) => lemmas[b][1] - lemmas[a][1]);

  console.log('Sourates…');
  const chapters = (await getJSON(`${API}/chapters?language=fr`)).chapters;
  const index = [];
  const glossEn = {}; // lemme → glose anglaise la plus fréquente dans le périmètre
  const glossVotes = {};
  let mismatches = 0;

  for (const n of SURAHS) {
    const ch = chapters.find(c => c.id === n);
    const verses = [];
    for (let page = 1; ; page++) {
      const d = await getJSON(`${API}/verses/by_chapter/${n}?words=true&word_fields=text_uthmani,location&fields=text_uthmani&translations=${TRANSLATION_FR}&per_page=50&page=${page}`);
      verses.push(...d.verses);
      if (!d.pagination?.next_page) break;
    }
    const audio = {};
    for (let page = 1; ; page++) {
      const d = await getJSON(`${API}/recitations/${RECITER}/by_chapter/${n}?per_page=50&page=${page}`);
      d.audio_files.forEach(a => { audio[a.verse_key] = a.url; });
      if (!d.pagination?.next_page) break;
    }

    const out = verses.map(v => {
      const words = v.words.filter(w => w.char_type_name === 'word').map(w => {
        const m = morpho.get(w.location) || {};
        if (!morpho.has(w.location)) mismatches++;
        {
          const lemmaKey = m.lemma || w.text_uthmani;
          const g = (w.translation?.text || '').trim();
          const votes = (glossVotes[lemmaKey] ||= {});
          votes[g] = (votes[g] || 0) + 1;
        }
        return {
          t: w.text_uthmani,                 // texte du mot
          en: w.translation?.text || '',      // glose anglaise (contextuelle)
          tr: w.transliteration?.text || '',  // translittération
          l: m.lemma || w.text_uthmani,       // lemme (à défaut : la forme elle-même, ex. pronoms)
          r: m.root || null,                  // racine
          p: m.pos || null,                   // catégorie
          a: w.audio_url || null,             // audio du mot (audio.qurancdn.com)
        };
      });
      return {
        n: v.verse_number,
        k: v.verse_key,
        fr: stripTags(v.translations?.[0]?.text),
        audio: audio[v.verse_key] || null,  // verses.quran.com
        w: words,
      };
    });

    const surah = {
      id: n,
      name: ch.name_simple,
      nameAr: ch.name_arabic,
      nameFr: ch.translated_name?.name || '',
      place: ch.revelation_place,
      verses: out,
    };
    writeFileSync(`${OUT}surah-${n}.json`, JSON.stringify(surah));
    const lemmaSet = new Set(out.flatMap(v => v.w.map(w => w.l)).filter(Boolean));
    index.push({ id: n, name: surah.name, nameAr: surah.nameAr, nameFr: surah.nameFr, place: surah.place, verses: out.length, words: out.reduce((s, v) => s + v.w.length, 0), lemmas: lemmaSet.size });
    process.stdout.write(`${n} `);
  }

  for (const [lemma, votes] of Object.entries(glossVotes)) {
    glossEn[lemma] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
  }

  writeFileSync(`${OUT}index.json`, JSON.stringify({
    sources: {
      text: 'Texte et découpage mot à mot : quran.com (API v4)',
      translation: 'Traduction des versets : Muhammad Hamidullah',
      morphology: 'Racines et lemmes : Quranic Arabic Corpus v0.4 (corpus.quran.com), GNU GPL — corrections mustafa0x/quran-morphology',
      audio: 'Récitation : Mishary Rashid Alafasy (quran.com)',
    },
    surahs: index,
  }, null, 1));
  writeFileSync(`${OUT}lexicon.json`, JSON.stringify({ lemmas, roots, glossEn }));
  console.log(`\nOK — ${index.length} sourates, ${Object.keys(lemmas).length} lemmes, ${Object.keys(roots).length} racines, ${mismatches} mots sans morphologie`);
}

main().catch(err => { console.error(err); process.exit(1); });
