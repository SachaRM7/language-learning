// scripts/embed-assets.mjs — Embarque le frontend (public/) dans le Worker.
//
// Pourquoi : le déploiement se fait aussi depuis des environnements où l'upload des « static assets »
// de Cloudflare n'est pas possible. Le frontend étant léger (~1,5 Mo), on le sert directement
// depuis le Worker, avec ETag et cache. Lancé automatiquement par `wrangler deploy` / `wrangler dev`
// (voir "build" dans wrangler.jsonc). Sortie : worker/assets.generated.js (ignoré par git).

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';

const ROOT = new URL('../public/', import.meta.url).pathname;
const OUT = new URL('../worker/assets.generated.js', import.meta.url).pathname;

// Sources de données non utilisées à l'exécution (servent aux scripts de génération)
const EXCLUDE = [/^data\/quran\/surah-\d+\.json$/, /^data\/vocabulary\//, /^data\/[^/]+\.js$/, /^data\/(arabic|french)\//, /^data\/translations_cache\.json$/, /\.gitkeep$/, /\.DS_Store$/];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.woff2': 'font/woff2',
};
const TEXT = new Set(['.html', '.css', '.js', '.json', '.svg', '.webmanifest']);

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const assets = {};
let bytes = 0;
for (const file of walk(ROOT).sort()) {
  const rel = relative(ROOT, file).split('\\').join('/');
  if (EXCLUDE.some(re => re.test(rel))) continue;
  const ext = extname(rel).toLowerCase();
  const type = TYPES[ext];
  if (!type) continue;
  const buf = readFileSync(file);
  bytes += buf.length;
  assets[`/${rel}`] = {
    t: type,
    e: createHash('sha1').update(buf).digest('hex').slice(0, 16),
    ...(TEXT.has(ext) ? { s: buf.toString('utf8') } : { b: buf.toString('base64') }),
  };
}

// app.js importe les écrans au démarrage, même si le premier écran ouvert est le hifz.
const shellFiles = Object.keys(assets).filter(path => /^\/(js|css)\//.test(path)).map(path => path.slice(1));
const sw = assets['/sw.js'];
sw.s = sw.s.replace('const BUILD_ASSETS = [];', `const BUILD_ASSETS = ${JSON.stringify(shellFiles)};`);
sw.e = createHash('sha1').update(sw.s).digest('hex').slice(0, 16);

// Le SDK est chargé à la demande. Les poids et le runtime WASM restent hors du Worker.
const sdk = await build({
  stdin: {
    contents: "export { createTilawa, prepareMicrophone } from '@tilawa/core/web';",
    resolveDir: new URL('../', import.meta.url).pathname,
  },
  conditions: ['onnxruntime-web-use-extern-wasm'],
  platform: 'browser', format: 'esm', bundle: true, minify: true, write: false,
  banner: { js: '/*! Tilawa and ONNX Runtime (Copyright Microsoft Corporation), MIT.\n' +
    readFileSync(new URL('../node_modules/@tilawa/core/LICENSE', import.meta.url), 'utf8') + ' */' },
});
const bundle = sdk.outputFiles[0];
assets['/js/vendor/tilawa.js'] = {
  t: TYPES['.js'], e: createHash('sha1').update(bundle.contents).digest('hex').slice(0, 16),
  s: bundle.text,
};
bytes += bundle.contents.length;

writeFileSync(OUT, `// Généré par scripts/embed-assets.mjs — ne pas modifier.\nexport const ASSETS = ${JSON.stringify(assets)};\n`);
console.log(`[embed-assets] ${Object.keys(assets).length} fichiers, ${(bytes / 1024).toFixed(0)} Ko → worker/assets.generated.js`);
