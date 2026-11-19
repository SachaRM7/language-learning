// js/components/quran-sheets.js — Fiches « mot » et « racine » du Coran (bottom sheets).
// Le lien central de l'app : un mot du verset → son lemme → sa racine → sa famille de mots.

import { store } from '../store.js';
import { navigate } from '../router.js';
import { db } from '../db.js';
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { haptic, toast } from '../ui.js';
import { createSRSEntry } from '../srs.js';
import { showModal, hideModal } from './modal.js';
import { loadLexicon, lemmaMeaning, lemmaCardId, knownLemmas, translitAr, AUDIO_WORD, cachedFr, kazimirskiMap } from '../quran.js';
import { playUrl } from './quran-audio.js';
import { kazimirskiButton, bindKazimirskiButtons } from './dictionary.js';

const courseId = () => store.get('currentCourse')?.id || 'arabic';
const rootLetters = root => [...(root || '')];
const BOX_LABEL = { 1: 'découverte', 2: 'en cours', 3: 'presque su', 4: 'acquis', 5: 'maîtrisé' };

function rootChips(root, cls = '') {
  return `<span class="q-root ${cls}" lang="ar" dir="rtl">${rootLetters(root).map(l => `<b>${escapeHtml(l)}</b>`).join('')}</span>`;
}

function familyList(root, lexicon, known, current) {
  const lemmas = lexicon.roots[root] || [];
  return lemmas.slice(0, 24).map(l => {
    const [, count, pos] = lexicon.lemmas[l] || [];
    const m = lemmaMeaning(l, lexicon);
    return `
      <li class="q-fam__item ${l === current ? 'is-current' : ''} ${known.has(l) ? 'is-known' : ''}">
        <span class="q-fam__ar" lang="ar">${escapeHtml(l)}</span>
        <span class="q-fam__body">
          <span class="q-fam__mean">${escapeHtml(m.text || '—')}${m.lang === 'en' ? ' <i class="q-en">EN</i>' : ''}${m.source === 'kazimirski' ? ' <i class="q-kz" title="Sens corrigé d’après Kazimirski">K</i>' : ''}</span>
          <span class="q-fam__meta">${escapeHtml(translitAr(l))} · ${escapeHtml(pos || '')} · ${count}×</span>
        </span>
        ${known.has(l) ? `<span class="q-fam__ok" title="Connu">${icon('check')}</span>` : ''}
      </li>`;
  }).join('');
}

/**
 * Fiche d'un mot du Coran.
 * @param {{surahId:number, verse:object, j:number}} o
 */
export async function openWordSheet({ surahId, verse, j }) {
  const w = verse.w[j];
  const [lexicon, known, srs] = await Promise.all([loadLexicon(), knownLemmas(courseId()), db.getSRS(courseId())]);
  const fr = cachedFr(surahId)?.words?.[`${verse.n}:${j}`];
  const [, count, pos] = lexicon.lemmas[w.l] || [null, null, w.p];
  const lm = lemmaMeaning(w.l, lexicon);
  const entry = srs.find(e => e.cardId === lemmaCardId(w.l));
  const familySize = (lexicon.roots[w.r] || []).length;

  showModal(`
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal q-sheet" role="dialog" aria-label="Mot du Coran">
        <div class="q-sheet__word">
          <div class="q-sheet__ar" lang="ar">${escapeHtml(w.t)}</div>
          <button class="audio-btn" id="qs-audio" aria-label="Écouter le mot">${icon('volume-2')}</button>
        </div>
        <div class="q-sheet__tr">${escapeHtml(w.tr || '')}</div>
        <div class="q-sheet__mean">${escapeHtml(fr || (lm.lang === 'fr' ? lm.text : w.en))}${fr || lm.lang === 'fr' ? '' : ' <i class="q-en">EN</i>'}</div>
        <div class="q-sheet__ref">Sourate ${surahId}, verset ${verse.n}</div>
        ${lm.source === 'kazimirski' || lm.note ? `<p class="q-kz-note">${icon('book-open')} <span>${lm.source === 'kazimirski' ? `<b>${escapeHtml(lm.text)}</b> — sens corrigé d’après Kazimirski. ` : ''}${escapeHtml(lm.note || '')}</span></p>` : ''}

        <div class="q-sheet__grid">
          <div class="q-info">
            <span class="q-info__label">Forme de base</span>
            <span class="q-info__ar" lang="ar">${escapeHtml(w.l || '—')}</span>
            <span class="q-info__sub">${escapeHtml(translitAr(w.l))}${lm.text ? ` · ${escapeHtml(lm.text)}` : ''}</span>
          </div>
          <div class="q-info">
            <span class="q-info__label">Dans le Coran</span>
            <span class="q-info__big">${count ? `${count}×` : '—'}</span>
            <span class="q-info__sub">${escapeHtml(pos || w.p || '')}</span>
          </div>
        </div>

        ${w.r ? `
          <section class="q-sheet__root">
            <div class="q-sheet__root-head">
              ${rootChips(w.r)}
              <div>
                <div class="q-sheet__root-title">Racine</div>
                <div class="q-sheet__root-meta">${familySize} mot${familySize > 1 ? 's' : ''} de la même famille dans le Coran</div>
              </div>
            </div>
            <ul class="q-fam">${familyList(w.r, lexicon, known, w.l)}</ul>
            <button class="btn btn--tonal btn--block" id="qs-root">${icon('sprout')} Explorer la racine</button>
          </section>` : ''}

        <div class="q-sheet__srs">
          ${entry
            ? `<div class="q-srs-status">${icon('refresh-cw')} Dans tes révisions · <b>${BOX_LABEL[entry.box] || ''}</b></div>`
            : `<button class="btn btn--primary btn--block" id="qs-add">${icon('plus')} Ajouter à mes révisions</button>`}
        </div>
      </div>
    </div>`);

  const overlay = document.getElementById('modal-overlay');
  overlay.addEventListener('click', e => { if (e.target === overlay) hideModal(); });
  document.getElementById('qs-audio')?.addEventListener('click', e => {
    if (w.a) playUrl(AUDIO_WORD + w.a, e.currentTarget);
  });
  document.getElementById('qs-root')?.addEventListener('click', () => { hideModal(); navigate(`/racines/${encodeURIComponent(w.r)}`); });
  document.getElementById('qs-add')?.addEventListener('click', async e => {
    const id = lemmaCardId(w.l);
    await db.updateSRS(courseId(), id, createSRSEntry(courseId(), id));
    haptic();
    toast('Ajouté à tes révisions');
    e.currentTarget.outerHTML = `<div class="q-srs-status">${icon('refresh-cw')} Dans tes révisions · <b>découverte</b></div>`;
  });
}

/** Fiche d'une racine : tous ses mots dans le Coran, avec ce que tu connais déjà. */
export async function openRootSheet(root) {
  const [lexicon, known] = await Promise.all([loadLexicon(), knownLemmas(courseId())]);
  const lemmas = lexicon.roots[root];
  if (!lemmas) { toast('Racine introuvable', { icon: 'info' }); return; }
  const occurrences = lemmas.reduce((n, l) => n + (lexicon.lemmas[l]?.[1] || 0), 0);
  const knownCount = lemmas.filter(l => known.has(l)).length;
  const kz = kazimirskiMap()[root];
  showModal(`
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal q-sheet" role="dialog" aria-label="Racine">
        <div class="q-sheet__root-hero">
          ${rootChips(root, 'q-root--lg')}
          <div class="q-sheet__root-stats">
            <span><b>${lemmas.length}</b> mots</span>
            <span><b>${occurrences}</b> occurrences dans le Coran</span>
            <span><b>${knownCount}</b> déjà connus</span>
          </div>
        </div>
        ${kz?.sense ? `<p class="q-kz-sense"><b>Sens de la racine</b> ${escapeHtml(kz.sense)} <span>· d’après Kazimirski</span></p>` : ''}
        <ul class="q-fam">${familyList(root, lexicon, known, null)}</ul>
        ${lemmas.length > 24 ? `<p class="q-sheet__more">+ ${lemmas.length - 24} autres mots, plus rares</p>` : ''}
        ${kz?.extra?.length ? `
          <div class="q-kz-extra">
            <div class="modal-section__title">Autres mots de la famille (Kazimirski)</div>
            <ul>${kz.extra.map(e => `<li><span lang="ar">${escapeHtml(e.ar)}</span><span>${escapeHtml(e.fr)}</span></li>`).join('')}</ul>
          </div>` : ''}
        ${kazimirskiButton(root)}
      </div>
    </div>`);
  const overlay = document.getElementById('modal-overlay');
  overlay.addEventListener('click', e => { if (e.target === overlay) hideModal(); });
  bindKazimirskiButtons(overlay);
}
