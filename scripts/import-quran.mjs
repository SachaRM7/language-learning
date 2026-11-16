// Génère des fichiers SQL réexécutables, puis importe avec --local ou --remote.
// Usage : node scripts/import-quran.mjs [--local|--remote]
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const source = new URL('../public/data/quran/', import.meta.url);
const out = new URL('../.wrangler/quran-import/', import.meta.url);
const mode = process.argv[2];
if (mode && !['--local', '--remote'].includes(mode)) throw new Error('Expected --local or --remote');
const index = JSON.parse(readFileSync(new URL('index.json', source)));
mkdirSync(out, { recursive: true });
let batch = '', batchNumber = 0;
function flush() {
  if (!batch) return;
  const file = new URL(`batch-${String(++batchNumber).padStart(3, '0')}.sql`, out);
  writeFileSync(file, batch);
  if (mode) {
    const result = spawnSync('npx', ['wrangler', 'd1', 'execute', 'helloarabic', mode, '--file', file.pathname], { stdio: 'inherit' });
    if (result.status !== 0) process.exit(result.status || 1);
  }
  batch = '';
}
for (const { id } of index.surahs) {
  const data = readFileSync(new URL(`surah-${id}.json`, source), 'utf8');
  const parsed = JSON.parse(data);
  if (parsed.id !== id || !parsed.verses.length) throw new Error(`Invalid surah ${id}`);
  // 8000 caractères Unicode : < 64 Ko après échappement, sous la limite SQL D1.
  const chars = Array.from(data);
  const statements = [`INSERT INTO quran_surah(id, data) VALUES (${id}, '') ON CONFLICT(id) DO UPDATE SET data = '';`];
  for (let i = 0; i < chars.length; i += 8000) {
    const part = chars.slice(i, i + 8000).join('').replaceAll("'", "''");
    statements.push(`UPDATE quran_surah SET data = data || '${part}' WHERE id = ${id};`);
  }
  const sql = statements.join('\n') + '\n';
  if (batch && Buffer.byteLength(batch + sql) > 2_000_000) flush();
  batch += sql;
}
flush();
console.log(`${index.surahs.length} sourates : ${out.pathname}`);
