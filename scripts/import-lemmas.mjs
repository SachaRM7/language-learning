// scripts/import-lemmas.mjs — Remplit la table quran_lemma à partir de public/data/quran/lexicon.json.
// Usage : node scripts/import-lemmas.mjs [--local|--remote]   (réexécutable : INSERT OR IGNORE)
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const mode = process.argv[2];
if (mode && !['--local', '--remote'].includes(mode)) throw new Error('Attendu : --local ou --remote');
const lx = JSON.parse(readFileSync(new URL('../public/data/quran/lexicon.json', import.meta.url)));
const out = new URL('../.wrangler/lemma-import/', import.meta.url);
mkdirSync(out, { recursive: true });
const q = v => (v === null || v === undefined ? 'NULL' : `'${String(v).replaceAll("'", "''")}'`);
const rows = Object.entries(lx.lemmas).map(([lemma, [root, count, pos]]) =>
  `INSERT OR IGNORE INTO quran_lemma (lemma, root, pos, count, en) VALUES (${q(lemma)}, ${q(root)}, ${q(pos)}, ${Number(count) || 0}, ${q(lx.glossEn?.[lemma] || null)});`);
const file = new URL('lemmas.sql', out);
writeFileSync(file, rows.join('\n') + '\n');
console.log(`${rows.length} lemmes → ${file.pathname}`);
if (mode) {
  const r = spawnSync('npx', ['wrangler', 'd1', 'execute', 'helloarabic', mode, '--file', file.pathname], { stdio: 'inherit' });
  process.exit(r.status || 0);
}
