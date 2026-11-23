// js/pages/coran-hifz.js — Mémorisation verset par verset : écouter → masquer → reconstituer.
// Valider un verset l'envoie en murājaʿa ET ajoute ses mots au vocabulaire en révision.

import '../quran/hifz-microphone.js';
import { store } from '../store.js';
import { navigate } from '../router.js';
import { escapeHtml, shuffle } from '../utils.js';
import { icon } from '../icons.js';
import { progressBar, haptic, confetti, toast } from '../ui.js';
import { recordActivity } from '../activity.js';
import { openWordSheet } from '../components/quran-sheets.js';
import { playUrl, stopAudio } from '../components/quran-audio.js';
import { loadSurah, memorizedVerses, markVerseMemorized } from '../quran.js';
import { preferredVerseUrl, getPlayerPrefs } from '../quran/player-prefs.js';

// Récitateur et vitesse choisis dans le lecteur de sourate
const recite = async (surah, v, btn = null) => playUrl(await preferredVerseUrl(surah.id, v), btn, { rate: getPlayerPrefs().rate });

const $app = () => document.getElementById('app');
const LISTEN_TARGET = 3;
let H = null;

export async function renderCoranHifz({ n, v }) {
  const id = Number(n);
  let surah;
  try { surah = await loadSurah(id); } catch { navigate('/coran'); return; }
  const memorized = await memorizedVerses();
  const start = v ? Number(v) : (surah.verses.find(x => !memorized.has(`${id}:${x.n}`)) || surah.verses[0]).n;
  H = { surah, memorized, verseN: start, step: 1, listens: 0, hidden: 0, built: [], pool: [], mistakes: 0, sessionCount: 0 };
  renderStep();
}

const verse = () => H.surah.verses.find(x => x.n === H.verseN);
const maskFrom = () => { try { return localStorage.getItem('ha-hifz-mask') || 'start'; } catch { return 'start'; } };

function shell(content) {
  const total = H.surah.verses.length;
  const mem = H.surah.verses.filter(x => H.memorized.has(`${H.surah.id}:${x.n}`)).length;
  return `
    <div class="hz">
      <div class="pl-top">
        <button class="back-btn icon-btn--ghost" id="hz-close" aria-label="Fermer">${icon('x')}</button>
        <div class="pl-top__mid">${progressBar((mem / total) * 100)}</div>
        <div class="session-bar__count">${mem}/${total}</div>
      </div>
      <div class="hz-head">
        <div class="hz-head__surah"><span lang="ar">${escapeHtml(H.surah.nameAr)}</span> ${escapeHtml(H.surah.name)} · verset ${H.verseN}</div>
        <ol class="hz-steps">
          ${['Écouter', 'Masquer', 'Reconstituer'].map((s, i) => `<li class="${H.step === i + 1 ? 'is-active' : H.step > i + 1 ? 'is-done' : ''}"><span>${H.step > i + 1 ? icon('check') : i + 1}</span>${s}</li>`).join('')}
        </ol>
      </div>
      <main class="hz-body">${content}</main>
    </div>`;
}

function bindShell() {
  document.getElementById('hz-close').addEventListener('click', () => { stopAudio(); navigate(`/coran/${H.surah.id}`); });
}

/** @param {(j:number)=>boolean} [isHidden] */
function verseWords(v, { isHidden = () => false, tappable = true } = {}) {
  return v.w.map((w, j) => {
    const hidden = isHidden(j);
    return `<button class="qw hz-w ${hidden ? 'is-hidden' : ''}" data-j="${j}" ${tappable ? '' : 'tabindex="-1"'}>${hidden ? '<span class="hz-w__mask"></span>' : ''}<span class="hz-w__t">${escapeHtml(w.t)}</span></button>`;
  }).join(' ');
}

function renderStep() {
  if (H.step === 1) stepListen();
  else if (H.step === 2) stepMask();
  else stepBuild();
}

// ── 1. Écouter ───────────────────────────────────────────────────────

function stepListen() {
  const v = verse();
  $app().innerHTML = shell(`
    <div class="hz-card">
      <p class="hz-ar" lang="ar">${verseWords(v)}</p>
      <p class="hz-tr">${escapeHtml(v.w.map(w => w.tr).join(' '))}</p>
      <p class="hz-fr">${escapeHtml(v.fr)}</p>
    </div>
    <div class="hz-listen">
      <button class="hz-play" id="hz-play" aria-label="Écouter le verset">${icon('play')}</button>
      <div class="hz-listen__count">
        ${Array.from({ length: LISTEN_TARGET }, (_, i) => `<i class="${i < H.listens ? 'on' : ''}"></i>`).join('')}
        <span>Écoute ${Math.min(H.listens, LISTEN_TARGET)}/${LISTEN_TARGET} en suivant le texte</span>
      </div>
    </div>
    <div class="hz-cta">
      ${H.surah.id === 1 && v.n === 2 ? '<a class="btn btn--secondary" href="#/coran/1/reciter/2/2">Essayer la prononciation du verset</a>' : ''}
      <button class="btn btn--primary btn--block btn--lg" id="hz-next">${H.listens >= LISTEN_TARGET ? 'Je l\'ai en tête' : 'Passer à la suite'} ${icon('arrow-right')}</button>
    </div>`);
  bindShell();
  bindWordTaps();
  document.getElementById('hz-play').addEventListener('click', async e => {
    const btn = e.currentTarget;
    await recite(H.surah, v, btn);
    H.listens++;
    stepListen();
  });
  document.getElementById('hz-next').addEventListener('click', () => { stopAudio(); H.step = 2; H.hidden = 0; renderStep(); });
}

// ── 2. Masquer ───────────────────────────────────────────────────────

function stepMask() {
  const v = verse();
  const n = v.w.length;
  const fromStart = maskFrom() === 'start';
  // Ordre de lecture : le 1er mot est à droite. « Début » masque d'abord les premiers mots.
  const isHidden = j => (fromStart ? j < H.hidden : j >= n - H.hidden);
  const all = H.hidden >= n;
  $app().innerHTML = shell(`
    <div class="segmented hz-maskdir" role="radiogroup" aria-label="Masquer depuis">
      <button class="${fromStart ? 'is-active' : ''}" data-maskdir="start" role="radio" aria-checked="${fromStart}">Masquer depuis le début</button>
      <button class="${fromStart ? '' : 'is-active'}" data-maskdir="end" role="radio" aria-checked="${!fromStart}">depuis la fin</button>
    </div>
    <p class="hz-help">Récite le verset de mémoire. ${fromStart
      ? 'Les mots disparaissent un par un à partir du <b>premier mot</b> (à droite, l\'arabe se lit de droite à gauche).'
      : 'Les mots disparaissent un par un à partir du <b>dernier mot</b> (à gauche) : le début du verset te sert d\'appui.'} Touche un mot masqué pour le revoir un instant.</p>
    <div class="hz-card">
      <p class="hz-ar" lang="ar">${verseWords(v, { isHidden })}</p>
    </div>
    <div class="hz-mask-actions">
      <button class="btn btn--secondary" id="hz-unhide" ${H.hidden ? '' : 'disabled'}>${icon('eye')} Moins</button>
      <button class="btn btn--tonal" id="hz-hide" ${all ? 'disabled' : ''}>${icon('eye-off')} Masquer</button>
      <button class="btn btn--secondary" id="hz-all" ${all ? 'disabled' : ''}>Tout</button>
    </div>
    <div class="hz-cta">
      <button class="btn btn--primary btn--block btn--lg" id="hz-next" ${all ? '' : 'disabled'}>Reconstituer le verset ${icon('arrow-right')}</button>
      <button class="btn btn--ghost btn--block" id="hz-back">${icon('volume-2')} Réécouter</button>
    </div>`);
  bindShell();
  document.querySelectorAll('[data-maskdir]').forEach(b => b.addEventListener('click', () => {
    try { localStorage.setItem('ha-hifz-mask', b.dataset.maskdir); } catch { /* stockage indisponible */ }
    haptic();
    stepMask();
  }));
  document.querySelectorAll('.hz-w.is-hidden').forEach(b => b.addEventListener('click', () => {
    b.classList.add('is-peek');
    setTimeout(() => b.classList.remove('is-peek'), 1200);
  }));
  document.getElementById('hz-hide').addEventListener('click', () => { H.hidden = Math.min(n, H.hidden + 1); haptic(); stepMask(); });
  document.getElementById('hz-unhide').addEventListener('click', () => { H.hidden = Math.max(0, H.hidden - 1); stepMask(); });
  document.getElementById('hz-all').addEventListener('click', () => { H.hidden = n; stepMask(); });
  document.getElementById('hz-back').addEventListener('click', () => recite(H.surah, v));
  document.getElementById('hz-next').addEventListener('click', () => {
    H.step = 3; H.built = []; H.mistakes = 0;
    H.pool = shuffle(v.w.map((w, j) => ({ t: w.t, j })));
    renderStep();
  });
}

// ── 3. Reconstituer ──────────────────────────────────────────────────

function stepBuild() {
  const v = verse();
  const done = H.built.length === v.w.length;
  $app().innerHTML = shell(`
    <p class="hz-help">${done ? 'Bravo, le verset est complet !' : 'Touche les mots dans l\'ordre du verset.'}</p>
    <div class="hz-card hz-target ${done ? 'is-done' : ''}">
      <p class="hz-ar" lang="ar">
        ${H.built.map(j => `<span class="hz-built">${escapeHtml(v.w[j].t)}</span>`).join(' ')}
        ${done ? '' : `<span class="hz-slot">${'·'.repeat(3)}</span>`}
      </p>
    </div>
    <div class="hz-pool" lang="ar">
      ${H.pool.map((p, i) => `<button class="hz-chip ${p.used ? 'is-used' : ''}" data-i="${i}" ${p.used ? 'disabled' : ''}>${escapeHtml(p.t)}</button>`).join('')}
    </div>
    <div class="hz-cta">
      ${done
        ? `<button class="btn btn--primary btn--block btn--lg" id="hz-validate">${icon('check')} Verset mémorisé</button>`
        : `<button class="btn btn--ghost btn--block" id="hz-hint">${icon('lightbulb')} Indice</button>`}
    </div>`);
  bindShell();
  document.querySelectorAll('.hz-chip:not([disabled])').forEach(b => b.addEventListener('click', () => {
    const p = H.pool[Number(b.dataset.i)];
    const expected = v.w[H.built.length];
    if (p.t === expected.t) {
      p.used = true;
      H.built.push(H.built.length);
      haptic(6);
      stepBuild();
    } else {
      H.mistakes++;
      haptic([20, 30, 20]);
      b.classList.remove('is-wrong'); void b.offsetWidth; b.classList.add('is-wrong');
    }
  }));
  document.getElementById('hz-hint')?.addEventListener('click', () => {
    const expected = v.w[H.built.length];
    const i = H.pool.findIndex(p => !p.used && p.t === expected.t);
    const b = document.querySelector(`.hz-chip[data-i="${i}"]`);
    b?.classList.add('is-hint');
    H.mistakes++;
  });
  document.getElementById('hz-validate')?.addEventListener('click', validate);
}

async function validate() {
  const v = verse();
  const course = store.get('currentCourse');
  const added = await markVerseMemorized(course?.id || 'arabic', H.surah, v);
  H.memorized.add(`${H.surah.id}:${v.n}`);
  H.sessionCount++;
  await recordActivity(course?.id || 'arabic', { correct: 3, wrong: H.mistakes, words: added });
  confetti({ count: 70 });

  const next = H.surah.verses.find(x => !H.memorized.has(`${H.surah.id}:${x.n}`));
  const surahDone = !next;
  const from = surahDone ? 1 : 1 + 3 * Math.floor((v.n - 1) / 3);
  const to = surahDone ? H.surah.verses.length : from + 2;
  const ready = surahDone || [from, from + 1, to].every(n => H.memorized.has(`${H.surah.id}:${n}`));
  $app().innerHTML = shell(`
    <div class="result hz-result">
      <div class="result__emoji">${surahDone ? '🏆' : '✨'}</div>
      <h1 class="result__title">${surahDone ? 'Sourate mémorisée !' : 'Verset mémorisé'}</h1>
      <p class="result__subtitle">${surahDone ? `Mā shāʾ Allāh, ${escapeHtml(H.surah.name)} est complète.` : 'Il reviendra en murājaʿa demain pour bien l\'ancrer.'}</p>
      <div class="hz-added">
        ${icon('layers')}
        <span>${added ? `<b>${added} nouveau${added > 1 ? 'x' : ''} mot${added > 1 ? 's' : ''}</b> ajouté${added > 1 ? 's' : ''} à tes révisions` : 'Tous les mots de ce verset sont déjà dans tes révisions'}</span>
      </div>
      <div class="hz-card hz-recap">
        <p class="hz-ar" lang="ar">${verseWords(v)}</p>
        <p class="hz-fr">${escapeHtml(v.fr)}</p>
      </div>
      <div class="result__actions">
        ${ready ? `<button class="btn btn--primary btn--block" data-navigate="/coran/${H.surah.id}/reciter/${from}/${to}">${surahDone ? 'Réciter toute la sourate' : `Réciter les versets ${from} à ${to}`}</button>` : ''}
        ${next ? `<button class="btn btn--primary btn--block btn--lg" id="hz-continue">Verset ${next.n} ${icon('arrow-right')}</button>` : ''}
        <button class="btn ${next ? 'btn--ghost' : 'btn--primary'} btn--block" data-navigate="/coran/${H.surah.id}">${next ? 'Faire une pause' : 'Retour à la sourate'}</button>
      </div>
    </div>`);
  bindShell();
  bindWordTaps();
  document.getElementById('hz-continue')?.addEventListener('click', () => {
    Object.assign(H, { verseN: next.n, step: 1, listens: 0, hidden: 0, built: [], pool: [], mistakes: 0 });
    renderStep();
  });
  if (surahDone) { confetti(); toast('Sourate complète ajoutée à ta murājaʿa', { icon: 'trophy' }); }
}

function bindWordTaps() {
  const v = verse();
  document.querySelectorAll('.hz-w:not(.is-hidden)').forEach(b => b.addEventListener('click', () => {
    openWordSheet({ surahId: H.surah.id, verse: v, j: Number(b.dataset.j) });
  }));
}

export async function renderPassage({ n, from, to }) {
  const id = Number(n);
  const first = Number(from);
  const last = Number(to);
  const back = `/coran/${id}`;
  let surah;
  try { surah = await loadSurah(id); } catch { navigate('/coran'); return; }
  const memorized = await memorizedVerses();
  const verses = surah.verses.filter(v => v.n >= first && v.n <= last);
  const pilot = id === 1 && first === 2 && last === 2;
  if (!verses.length || verses[0].n !== first || verses.at(-1).n !== last ||
      (!pilot && verses.some(v => !memorized.has(`${id}:${v.n}`)))) { navigate(back); return; }
  const next = surah.verses.find(v => !memorized.has(`${id}:${v.n}`));
  const range = first === last ? `verset ${first}` : `versets ${first} à ${last}`;
  const title = first === 1 && last === surah.verses.length ? 'Réciter toute la sourate' : `Réciter ${first === last ? 'le' : 'les'} ${range}`;
  stopAudio();
  $app().innerHTML = `<main class="hz hz-body">
    <button class="back-btn icon-btn--ghost" data-navigate="${back}" aria-label="Retour à la sourate">${icon('x')}</button>
    <h1>${title}</h1><p>${escapeHtml(surah.name)} · ${range}</p>
    <hifz-microphone ${pilot ? 'data-pronunciation' : ''} data-surah="${id}" data-from="${first}" data-to="${last}"></hifz-microphone>
    ${!pilot && id === 1 && first <= 2 && last >= 2 ? '<a href="#/coran/1/reciter/2/2">Essayer la prononciation du verset 2</a>' : ''}
    <details class="hz-passage" open><summary>Masquer le texte</summary>
      <p class="hz-key">● Mot repéré · ≋ À reprendre · ? À vérifier</p>
      ${verses.map(v => `<p class="hz-ar" lang="ar" dir="rtl">${v.w.flatMap(w => w.t.split(/\s+(?=\p{Letter})/u)).map((word, i) => `<span id="hz-word-${v.n}-${i + 1}">${escapeHtml(word)}</span>`).join(' ')} <small>${v.n}</small></p>`).join('')}
    </details>
    <button class="btn btn--secondary" data-navigate="${next ? `${back}/hifz/${next.n}` : back}">${next ? `Continuer au verset ${next.n}` : 'Retour à la sourate'}</button>
  </main>`;
  const details = $app().querySelector('details');
  details.ontoggle = () => { details.querySelector('summary').textContent = details.open ? 'Masquer le texte' : 'Afficher le texte'; };
}
