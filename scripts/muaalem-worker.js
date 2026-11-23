import * as ort from 'onnxruntime-web/wasm';
import { Fbank } from '../node_modules/@tilawa/core/dist/runtime/fbank.js';
import { assessFatiha, decodePhonemes } from '../public/js/quran/pronunciation.js';

const modelUrl = 'https://huggingface.co/Abddar/muaalem-v3-2-int8-android-onnx/resolve/5d5a3510728b3d02e4a84897c311a5d404505ee9/muaalem_tajweed_int8.onnx';
const size = 876466434;
ort.env.wasm.numThreads = 1;
const wasmUrl = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.30.0/dist/ort-wasm-simd-threaded.wasm';
ort.env.wasm.wasmPaths = { mjs: new URL('/js/vendor/muaalem-ort.js', self.location.origin).href };

async function cachedBytes(url) {
  const cache = await caches.open('muaalem-v3_2');
  let response = await cache.match(url);
  if (!response) {
    if (url === modelUrl) self.postMessage({ status: 'Téléchargement du modèle de prononciation (876 Mo)…' });
    response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error('Téléchargement impossible.');
    // La réponse n’entre en cache qu’après réception complète.
    await cache.put(url, response);
    response = await cache.match(url);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (url === modelUrl && bytes.length !== size) {
    await cache.delete(url);
    throw new Error('Téléchargement incomplet.');
  }
  return bytes;
}

function features(samples) {
  const frames = new Fbank({ highFrequency: 8000 }).push(samples.map(x => x * 32768));
  if (frames.length < 2) throw new Error('Prise trop courte.');
  const time = Math.ceil(frames.length / 2);
  const data = new Float32Array(time * 160).fill(1);
  // Normalisation par bande avant de grouper les trames deux à deux (SeamlessM4T).
  for (let band = 0; band < 80; band++) {
    const mean = frames.reduce((sum, frame) => sum + frame[band], 0) / frames.length;
    const variance = frames.reduce((sum, frame) => sum + (frame[band] - mean) ** 2, 0) / (frames.length - 1);
    const scale = Math.sqrt(variance + 1e-7);
    for (let i = 0; i < frames.length; i++) data[i * 80 + band] = (frames[i][band] - mean) / scale;
  }
  const mask = new Float32Array(time).fill(1);
  if (frames.length % 2) mask[time - 1] = 0;
  return {
    input_features: new ort.Tensor('float32', data, [1, time, 160]),
    attention_mask: new ort.Tensor('float32', mask, [1, time]),
  };
}

self.onmessage = async ({ data: samples }) => {
  try {
    const feeds = features(samples);
    ort.env.wasm.wasmBinary = await cachedBytes(wasmUrl);
    const bytes = await cachedBytes(modelUrl);
    self.postMessage({ status: 'Analyse du verset sur cet appareil…' });
    const session = await ort.InferenceSession.create(bytes, { executionProviders: ['wasm'], graphOptimizationLevel: 'basic' });
    const { phonemes } = await session.run(feeds, ['phonemes']);
    const result = assessFatiha(decodePhonemes(phonemes.data));
    await session.release();
    self.postMessage({ result });
  } catch (error) {
    console.warn('HelloArabic — Muaalem', error);
    self.postMessage({ error: 'Analyse indisponible. Vérifie la connexion, le stockage et la mémoire de cet appareil.' });
  }
};
