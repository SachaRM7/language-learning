import '../quran/hifz-microphone.js';
import { navigate, route } from '../router.js';
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { loadSurah, memorizedVerses } from '../quran.js';
import { playUrl, stopAudio } from '../components/quran-audio.js';
import { preferredVerseUrl, getPlayerPrefs } from '../quran/player-prefs.js';

export function passagePath(surah, from, to) {
  return `/coran/${surah}/reciter/${from}/${to}`;
}

// Charger un écran qui propose la récitation enregistre aussi sa destination.
route(passagePath(':n', ':from', ':to'), renderPassage);

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
  const passage = verses.map(v => {
    const words = v.w.flatMap(w => w.t.split(/\s+(?=\p{Letter})/u));
    return `<section class="practice-verse" aria-label="Verset ${v.n}">
      ${verses.length > 1 ? `<div class="practice-verse__head"><span>Verset ${v.n}</span>
        <button data-listen-verse="${v.n}" aria-label="Écouter le verset ${v.n}">${icon('volume-2')}</button></div>` : ''}
      <p class="practice-words" lang="ar" dir="rtl">${words.map((word, i) =>
        `<span class="practice-word"><bdi id="hz-word-${v.n}-${i + 1}">${escapeHtml(word)}</bdi></span>`).join(' ')}</p>
      <p class="practice-translation">${escapeHtml(v.fr)}</p>
    </section>`;
  }).join('');
  stopAudio();
  const app = document.getElementById('app');
  app.innerHTML = `<main class="practice">
    <header class="practice-head">
      <button data-navigate="${back}" aria-label="Retour à la sourate">${icon('arrow-left')}</button>
      <span>Récitation</span>
    </header>
    <div class="practice-title"><div><p>Sourate ${id}</p><h1>${escapeHtml(surah.name)}</h1></div>
      <span lang="ar" dir="rtl">${escapeHtml(surah.nameAr)}</span></div>
    <div class="hz-passage">
      <div class="practice-toolbar"><span>${icon('book-open')} ${range}</span>
        <button aria-expanded="true" aria-controls="practice-text">${icon('eye-off')} Masquer</button></div>
      <div id="practice-text" ${verses.length > 1 ? 'class="practice-scroll" tabindex="0" role="region" aria-label="Versets à réciter"' : ''}>${passage}</div>
    </div>
    <hifz-microphone ${pilot ? 'data-pronunciation' : ''} data-surah="${id}" data-from="${first}" data-to="${last}"></hifz-microphone>
    ${!pilot && id === 1 && first <= 2 && last >= 2 ? `<a class="practice-pilot" href="#${passagePath(1, 2, 2)}">Essayer la prononciation du verset 2</a>` : ''}
    <button class="practice-next" data-navigate="${next ? `${back}/hifz/${next.n}` : back}">${next ? (pilot && next.n <= last ? 'Reprendre la mémorisation' : `Continuer au verset ${next.n}`) : 'Retour à la sourate'} ${icon('arrow-right')}</button>
  </main>`;
  const screen = app.querySelector('.practice');
  const text = screen.querySelector('#practice-text');
  const toggle = screen.querySelector('[aria-controls="practice-text"]');
  toggle.onclick = () => {
    text.hidden = !text.hidden;
    toggle.setAttribute('aria-expanded', String(!text.hidden));
    toggle.innerHTML = text.hidden ? `${icon('eye')} Afficher` : `${icon('eye-off')} Masquer`;
  };
  const microphone = screen.querySelector('hifz-microphone');
  microphone.playReference = async (button, signal) => {
    const selected = button.dataset.listenVerse;
    const playlist = selected ? verses.filter(v => v.n === Number(selected)) : verses;
    // Une suite longue n’attend pas la résolution de toutes les URL avant de démarrer.
    for (const verse of playlist) {
      const url = await preferredVerseUrl(id, verse);
      if (signal.aborted) return;
      const ended = await playUrl(url, button, { rate: getPlayerPrefs().rate });
      if (signal.aborted) return;
      if (!ended) throw new Error('Lecture interrompue');
    }
  };
  screen.querySelectorAll('[data-listen-verse]').forEach(button => {
    button.onclick = () => microphone.listen(button);
  });
}
