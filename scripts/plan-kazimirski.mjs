// Planifie la lecture du Kazimirski : pour chaque racine du lexique coranique, la page où elle commence
// (index public/data/kazimirski.json), puis les pages à lire avec leurs racines attendues.
// Écrit un fichier SQL qui crée les lots (kz_job) :
//   node scripts/plan-kazimirski.mjs <pilot|full> <sortie.sql> [max_pages] [pages_déjà_lues.json]
// En mode full, les racines les plus fréquentes du Coran passent en premier.
import { readFileSync, writeFileSync } from 'node:fs';

const [mode = 'pilot', out = 'kz-jobs.sql', maxPages = 'Infinity', donePath] = process.argv.slice(2);
const DONE = new Set(donePath ? JSON.parse(readFileSync(donePath, 'utf8')).map(([v, n]) => `${v}:${n}`) : []);
const KZ = JSON.parse(readFileSync(new URL('../public/data/kazimirski.json', import.meta.url)));
const LX = JSON.parse(readFileSync(new URL('../public/data/quran/lexicon.json', import.meta.url)));
const HAMZA = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ء': 'ا', 'ؤ': 'ا', 'ئ': 'ا', 'ى': 'ي', 'ٱ': 'ا' };
const RANK = Object.fromEntries([...KZ.alphabet].map((c, i) => [c, i]));
const ANCHORS = KZ.anchors.map(([v, n, lo, hi]) => ({ v, n, lo, hi }));
const norm = r => [...r].map(c => HAMZA[c] || c).join('');
const cmp = (a, b) => {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = RANK[a[i]] ?? -1, y = RANK[b[i]] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
};
function startPage(root) {
  const r = norm(root);
  const at = ANCHORS.find(a => cmp(a.hi, r) >= 0) || ANCHORS.at(-1);
  return { v: at.v, n: cmp(at.lo, r) > 0 && at.n > 0 ? at.n - 1 : at.n };
}

const PILOT = ['كتب', 'قرأ', 'عبد', 'رحم', 'سلم', 'علم', 'قول', 'أمن', 'خوف', 'بيت'];
const roots = Object.keys(LX.roots).filter(r => r && [...norm(r)].every(c => RANK[c] !== undefined));
const freq = r => LX.roots[r].reduce((sum, l) => sum + (LX.lemmas[l]?.[1] || 0), 0);
const chosen = mode === 'pilot' ? roots.filter(r => PILOT.includes(r)) : [...roots].sort((a, b) => freq(b) - freq(a));

// Une racine est attendue sur sa page de départ et sur la suivante (l'article peut s'y poursuivre).
// On ajoute les racines par fréquence jusqu'à la limite de pages (pages déjà lues exclues).
const pages = new Map();
for (const r of chosen) {
  const p = startPage(r);
  const keys = [p.n, p.n + 1].map(n => [`${p.v}:${n}`, n]).filter(([key]) => !DONE.has(key));
  const fresh = keys.filter(([key]) => !pages.has(key)).length;
  if (pages.size + fresh > Number(maxPages)) continue;
  for (const [key, n] of keys) {
    if (!pages.has(key)) pages.set(key, [p.v, n, []]);
    pages.get(key)[2].push(r);
  }
}
const list = [...pages.values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
const SIZE = 25;
const jobs = [];
for (let k = 0; k < list.length; k += SIZE) jobs.push(list.slice(k, k + SIZE));
const esc = s => s.replace(/'/g, "''");
writeFileSync(out, jobs.map(j =>
  `INSERT INTO kz_job (kind, status, pages, created_at, updated_at) VALUES ('${mode}', 'queued', '${esc(JSON.stringify(j))}', unixepoch()*1000, unixepoch()*1000);`).join('\n') + '\n');
console.log(`${chosen.length} racines, ${list.length} pages, ${jobs.length} lot(s) → ${out}`);
