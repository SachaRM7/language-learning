// js/pages/comprendre.js — « Comprendre » : lire de vrais textes avec un moteur qui repère ce qui bloque.
//
// /comprendre             bibliothèque de passages annotés + profil des notions
// /comprendre/:passageId  séance guidée : découvrir → repérer → s'entraîner → relire → réemployer
//
// Le plan de séance vient de l'ordonnanceur déterministe (pedagogy/scheduler.js) ; chaque réponse
// devient une preuve dans le journal (pedagogy/engine.js) qui recalcule le profil de maîtrise.
// Texte coranique : affiché tel quel (vocalisation d'origine verrouillée), jamais découpé dans les
// exercices — on s'entraîne sur des phrases pédagogiques distinctes.

import { store } from '../store.js';
import { navigate } from '../router.js';
import { renderHeader } from '../components/header.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { showModal, hideModal } from '../components/modal.js';
import { openRootSheet, openWordSheet } from '../components/quran-sheets.js';
import { playUrl, playSequence, stopAudio } from '../components/quran-audio.js';
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { progressBar, showFeedback, haptic, confetti, toast } from '../ui.js';
import { playWord } from '../audio.js';
import { recordActivity } from '../activity.js';
import { loadSurah, loadLexicon, lemmaMeaning, AUDIO_VERSE, AUDIO_WORD } from '../quran.js';
import { computeMasteryProfile, getEffectiveScore, getTrackedDimensions, defaultDimensionForNotion, maxScaffolding, DIMENSION_LABELS } from '../pedagogy/mastery.js';
import { buildSessionPlan, evaluatePassageReadiness, tokenNotionIds } from '../pedagogy/scheduler.js';
import { loadLibrary, loadProfile, recordEvidence, setOverride, evidence, levelOf, rootDisplay, suggestPassage } from '../pedagogy/engine.js';

const $app = () => document.getElementById('app');
const HARAKAT = /[ً-ٰٟۖ-ۭـ]/g;
const bare = s => s.replace(HARAKAT, '').replace(/ٱ/g, 'ا');
const esc = escapeHtml;

const CORPUS = {
  conversation: { label: 'Dialogue', icon: 'messages' },
  story: { label: 'Récit', icon: 'book-open' },
  quran: { label: 'Coran', icon: 'sparkles' },
};
const STATUS = {
  ready_now: { label: 'Prêt à lire', tone: 'ok' },
  syntax_to_discover: { label: 'Construction à découvrir', tone: 'mid' },
  prepare_first: { label: 'À préparer', tone: 'prep' },
};
const STEP_META = {
  discover: { icon: 'eye', title: 'Découvrir' },
  diagnose: { icon: 'search', title: 'Repérer' },
  practice: { icon: 'target', title: 'S’entraîner' },
  reread: { icon: 'rotate-ccw', title: 'Relire' },
  transfer: { icon: 'shuffle', title: 'Réemployer' },
};
const MODULE_LABEL = {
  flashcards: 'Phrases d’exemple', listening: 'Écoute', roots: 'Racines', conversation: 'Reconstruction',
};
const ROLE_LABEL = { proclitic: 'préfixe', stem: 'mot', enclitic: 'suffixe' };
const SCAFF_LABEL = { full_help: 'toutes les aides', light_help: 'aide légère', no_help: 'sans aide' };
const SOURCE_LABEL = {
  diagnostic: 'Repérage', flashcard: 'Exemple', listening: 'Écoute', dialogue: 'Reconstruction',
  reread: 'Relecture', transfer: 'Réemploi', roots: 'Racines',
};

const courseId = () => store.get('currentCourse')?.id || 'arabic';

// ═════════════════════════ Bibliothèque ═════════════════════════

export async function renderComprendre() {
  const prof = await loadProfile();
  const { library: lib, mastery } = prof;
  const passages = lib.passages;
  const texts = passages.filter(p => p.corpus !== 'quran');
  const quran = passages.filter(p => p.corpus === 'quran');
  const readiness = Object.fromEntries(passages.map(p => [p.id, evaluatePassageReadiness(p, mastery, lib.catalog)]));
  const suggestion = suggestPassage(prof).passage;

  const worked = Object.values(lib.catalog)
    .filter(n => mastery[n.id] && (prof.stored.some(e => e.notionId === n.id) || prof.overrides[n.id] || prof.vocabularyKnown.has(n.id)))
    .map(n => ({ n, score: getEffectiveScore(mastery[n.id], defaultDimensionForNotion(n), 'full') }))
    .sort((a, b) => a.score - b.score);

  $app().innerHTML = `
    ${renderHeader({ title: 'Comprendre', large: true, eyebrow: 'Lire de vrais textes', titleAr: 'الفَهْم' })}
    <main class="page-content page-content--nav cp-home">
      <div class="stagger">
        <section class="cp-hero">
          <div class="cp-hero__pattern" aria-hidden="true"></div>
          <div class="cp-hero__eyebrow">${icon('lightbulb')} ${suggestion ? 'Ta prochaine lecture' : 'Bibliothèque'}</div>
          ${suggestion ? `
            <div class="cp-hero__title">${esc(suggestion.title)}</div>
            <p class="cp-hero__ar" lang="ar" dir="rtl">${esc(previewText(suggestion))}</p>
            <p class="cp-hero__sub">${esc(readiness[suggestion.id].guidanceFr)}</p>
            <button class="btn btn--gold btn--lg" data-navigate="/comprendre/${encodeURIComponent(suggestion.id)}">${icon('play')} Lancer la séance</button>` : ''}
          <p class="cp-hero__how">Tu lis d’abord, tu touches ce qui te bloque ; l’app prépare ensuite une séance courte sur ces points, puis te fait relire et réemployer sur un autre texte.</p>
        </section>

        <section class="section">
          <div class="section__head"><h2 class="section__title">Dialogues & récits</h2></div>
          <div class="cp-grid">${texts.map(p => passageCard(p, readiness[p.id])).join('')}</div>
        </section>

        <section class="section">
          <div class="section__head"><h2 class="section__title">Extraits du Coran</h2></div>
          <p class="cp-note">${icon('lock')} Texte ʿuthmānī d’origine, vocalisation verrouillée. Les exercices se font sur des phrases d’exemple distinctes, jamais sur le texte coranique lui-même.</p>
          <div class="cp-grid">${quran.map(p => passageCard(p, readiness[p.id])).join('')}</div>
        </section>

        <section class="section">
          <div class="section__head"><h2 class="section__title">Tes notions</h2>${worked.length ? `<span class="cp-count">${worked.length}</span>` : ''}</div>
          ${worked.length ? `
            <ul class="cp-notions">${worked.map(({ n }) => notionRow(n, mastery[n.id], prof)).join('')}</ul>
            <p class="cp-note">${icon('info')} Chaque niveau s’appuie sur tes réponses (et sur les mots déjà sus dans « Mots »). Touche une notion pour voir pourquoi, ou corriger l’estimation.</p>` : `
            <div class="cp-empty">${icon('sprout')}<p>Tes notions apparaîtront ici après ta première lecture : mots, pronoms attachés, constructions…</p></div>`}
        </section>
      </div>
    </main>
    ${renderBottomNav('explore')}`;

  $app().querySelectorAll('[data-notion]').forEach(b => b.addEventListener('click', () => openNotionSheet(b.dataset.notion, renderComprendre)));
}

function previewText(p) {
  return p.tokens.map(t => (p.defaultVocalization === 'unvocalized' ? t.surfaceUnvocalized : t.surfaceVocalized)).join(' ');
}

function passageCard(p, r) {
  const c = CORPUS[p.corpus] || CORPUS.story;
  const st = STATUS[r.status];
  return `
    <button class="cp-card pressable" data-navigate="/comprendre/${encodeURIComponent(p.id)}">
      <span class="cp-card__top">
        <span class="cp-tag">${icon(c.icon)} ${c.label}</span>
        ${p.isImmutableSource ? `<span class="cp-tag cp-tag--lock">${icon('lock')} Texte figé</span>` : ''}
        ${p.defaultVocalization === 'unvocalized' ? '<span class="cp-tag cp-tag--bare">Sans voyelles</span>' : ''}
      </span>
      <span class="cp-card__title">${esc(p.title)}</span>
      <span class="cp-card__ar" lang="ar" dir="rtl">${esc(previewText(p))}</span>
      <span class="cp-card__foot">
        <span class="cp-status cp-status--${st.tone}">${st.label}</span>
        <span class="cp-card__meta">${r.knownLexemes}/${r.totalLexemes} mots clés reconnus</span>
      </span>
      <span class="cp-card__guide">${esc(r.guidanceFr)}</span>
    </button>`;
}

function notionRow(n, m, prof) {
  const dims = getTrackedDimensions(n.category);
  return `
    <li>
      <button class="cp-notion pressable" data-notion="${esc(n.id)}">
        <span class="cp-notion__body">
          <span class="cp-notion__label">${esc(n.labelFr)}</span>
          <span class="cp-notion__dims">
            ${dims.map(d => {
              const st = m?.dimensions?.[d];
              const lv = levelOf(getEffectiveScore(m, d, 'full'), st?.evidenceCount || (st?.userOverride ? 1 : 0));
              return `<span class="cp-dim cp-dim--${lv.id}" title="${DIMENSION_LABELS[d]} : ${lv.label}">${DIMENSION_LABELS[d]}</span>`;
            }).join('')}
          </span>
        </span>
        ${prof.vocabularyKnown.has(n.id) ? `<span class="cp-notion__vocab" title="Déjà su dans Mots">${icon('layers')}</span>` : ''}
        <span class="row__chev">${icon('chevron-right')}</span>
      </button>
    </li>`;
}

// ═════════════════════════ Fiche d'une notion ═════════════════════════

async function openNotionSheet(notionId, onChange = null) {
  const prof = await loadProfile();
  const { catalog, drills } = prof.library;
  const n = catalog[notionId];
  if (!n) return;
  const m = prof.mastery[notionId];
  const main = defaultDimensionForNotion(n);
  const override = prof.overrides[notionId]?.[main] || null;
  const history = prof.stored.filter(e => e.notionId === notionId).slice(-6).reverse();
  const examples = drills.filter(d => d.notionId === notionId).slice(0, 2);
  let rootOk = false;
  if (n.root) rootOk = Boolean((await loadLexicon().catch(() => null))?.roots?.[n.root]);

  showModal(`
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal cp-sheet" role="dialog" aria-label="Notion">
        ${n.wordAr ? `<div class="cp-sheet__ar" lang="ar">${esc(n.wordAr)}</div>` : ''}
        <div class="cp-sheet__label">${esc(n.labelFr)}</div>
        <p class="cp-sheet__expl">${esc(n.explanationFr)}</p>
        ${n.root ? `
          <button class="cp-root-link pressable" id="cp-root" ${rootOk ? '' : 'disabled'}>
            ${icon('sprout')} Racine <b lang="ar">${esc(rootDisplay(n.root))}</b>${rootOk ? ` <span>· voir la famille dans le Coran</span>${icon('chevron-right')}` : ''}
          </button>` : ''}
        ${examples.length ? `
          <div class="cp-sheet__ex">
            ${examples.map(d => `<div><p lang="ar" dir="rtl">${esc(d.arabicVocalized)}</p><span>${esc(d.frenchMeaning)}</span></div>`).join('')}
          </div>` : ''}
        <div class="cp-sheet__dims">
          ${getTrackedDimensions(n.category).map(d => {
            const st = m?.dimensions?.[d];
            const lv = levelOf(getEffectiveScore(m, d, 'full'), st?.evidenceCount || (st?.userOverride ? 1 : 0));
            return `<div class="cp-sheet__dim"><span>${DIMENSION_LABELS[d]}</span><span class="cp-dim cp-dim--${lv.id}">${lv.label}</span><small>${st?.evidenceCount ? `${st.evidenceCount} preuve${st.evidenceCount > 1 ? 's' : ''}` : st?.userOverride ? 'ta correction' : '—'}</small></div>`;
          }).join('')}
          ${m?.unvocalizedReadScore !== undefined ? `<div class="cp-sheet__dim"><span>Lecture sans voyelles</span><span class="cp-dim cp-dim--${levelOf(m.unvocalizedReadScore).id}">${levelOf(m.unvocalizedReadScore).label}</span><small>suivie à part</small></div>` : ''}
        </div>
        ${prof.vocabularyKnown.has(notionId) ? `<p class="cp-sheet__why">${icon('layers')} Ce mot est déjà su dans tes cartes : il compte comme lu.</p>` : ''}
        ${history.length ? `
          <div class="cp-sheet__hist">
            <div class="modal-section__title">Dernières preuves</div>
            ${history.map(e => `<div class="cp-ev ${e.isSuccess ? 'is-ok' : 'is-ko'}">${icon(e.isSuccess ? 'check' : 'x')}<span>${SOURCE_LABEL[e.sourceModule] || e.sourceModule} · ${DIMENSION_LABELS[e.dimension] || ''} · ${SCAFF_LABEL[e.scaffolding] || ''}${e.vocalization === 'unvocalized' ? ' · sans voyelles' : ''}</span></div>`).join('')}
          </div>` : ''}
        <div class="modal-section__title">Corriger l’estimation (${DIMENSION_LABELS[main].toLowerCase()})</div>
        <div class="segmented cp-override" role="group">
          ${[['known', 'Je connais'], [null, 'Automatique'], ['needs_work', 'À retravailler']].map(([v, l]) => `
            <button class="${override === v ? 'is-active' : ''}" data-ov="${v ?? ''}">${l}</button>`).join('')}
        </div>
      </div>
    </div>`);
  const overlay = document.getElementById('modal-overlay');
  overlay.addEventListener('click', e => { if (e.target === overlay) hideModal(); });
  document.getElementById('cp-root')?.addEventListener('click', () => { hideModal(); setTimeout(() => openRootSheet(n.root), 220); });
  overlay.querySelectorAll('[data-ov]').forEach(b => b.addEventListener('click', async () => {
    await setOverride(notionId, main, b.dataset.ov || null);
    haptic();
    hideModal();
    toast(b.dataset.ov === 'known' ? 'Noté : tu connais déjà' : b.dataset.ov ? 'Noté : à retravailler' : 'Estimation automatique', { icon: 'check' });
    onChange?.();
  }));
}

// ═════════════════════════ Séance ═════════════════════════

let C = null;

export async function renderComprendreSession({ passageId }) {
  const id = decodeURIComponent(passageId || '');
  const prof = await loadProfile();
  const passage = prof.library.passages.find(p => p.id === id);
  if (!passage) { navigate('/comprendre'); return; }
  const since = new Date(Date.now() - 2 * 86400e3).toISOString();
  C = {
    lib: prof.library,
    catalog: prof.library.catalog,
    passage,
    base: prof.evidences,                       // vocabulaire + journal enregistré
    recentStored: prof.stored.filter(e => e.timestamp >= since),
    overrides: prof.overrides,
    session: [],                                // preuves de cette séance
    startMastery: prof.mastery,
    stepIndex: -1,
    correct: 0, wrong: 0,
    surahs: {},
  };
  C.plan = computePlan();
  renderIntro();
}

function currentMastery() {
  return computeMasteryProfile([...C.base, ...C.session], C.catalog, C.overrides);
}

function computePlan() {
  return buildSessionPlan({
    planId: `session:${C.passage.id}:${Date.now()}`,
    passage: C.passage,
    library: C.lib.passages,
    catalog: C.catalog,
    mastery: currentMastery(),
    recentEvidences: [...C.recentStored, ...C.session],
  });
}

async function commit(list) {
  C.session.push(...list);
  await recordEvidence(list).catch(() => toast('Enregistrement local impossible', { icon: 'info' }));
}

/** « Je connais déjà » en pleine séance : on garde les étapes faites et on recalcule la suite. */
async function overrideNow(notionId, status) {
  const n = C.catalog[notionId];
  C.overrides = await setOverride(notionId, defaultDimensionForNotion(n), status);
  const kept = C.plan.steps.slice(0, C.stepIndex + 1);
  const keptTypes = new Set(kept.map(s => s.stepType));
  const fresh = computePlan();
  C.plan = { ...fresh, steps: [...kept, ...fresh.steps.filter(s => !keptTypes.has(s.stepType))] };
}

function topBar() {
  const total = C.plan.steps.length;
  const done = Math.max(0, C.stepIndex);
  return `
    <div class="pl-top cp-top">
      <button class="back-btn icon-btn--ghost" id="cp-close" aria-label="Fermer">${icon('x')}</button>
      <div class="pl-top__mid">${progressBar((done / total) * 100)}</div>
      <div class="session-bar__count">${Math.min(done + 1, total)}/${total}</div>
    </div>`;
}

function bindClose() {
  document.getElementById('cp-close')?.addEventListener('click', () => { stopAll(); navigate('/comprendre'); });
}

function stopAll() { stopAudio(); try { speechSynthesis.cancel(); } catch { /* ignore */ } }

function renderIntro() {
  const p = C.passage;
  const c = CORPUS[p.corpus];
  $app().innerHTML = `
    <div class="cp-session">
      <div class="pl-top cp-top">
        <button class="back-btn icon-btn--ghost" id="cp-close" aria-label="Fermer">${icon('x')}</button>
        <div class="pl-top__mid"></div>
      </div>
      <main class="cp-body cp-intro">
        <span class="cp-tag">${icon(c.icon)} ${c.label}${p.isImmutableSource ? ' · texte figé' : ''}</span>
        <h1 class="cp-intro__title">${esc(p.title)}</h1>
        <p class="cp-intro__ar" lang="ar" dir="rtl">${esc(previewText(p))}</p>
        <div class="cp-plan">
          <div class="cp-plan__head">${icon('compass')} Ta séance</div>
          <p class="cp-plan__why">${esc(C.plan.summaryReasonFr)}</p>
          <ol class="cp-plan__steps">
            ${C.plan.steps.map(s => `
              <li class="cp-plan__step">
                <span class="cp-plan__icon">${icon(STEP_META[s.stepType].icon)}</span>
                <span><b>${STEP_META[s.stepType].title}${s.stepType === 'practice' ? ` · ${MODULE_LABEL[s.targetModule] || ''}` : ''}</b><small>${esc(s.rationaleFr)}</small></span>
              </li>`).join('')}
          </ol>
          <p class="cp-plan__note">${icon('info')} Le plan s’ajuste après le repérage : si tu montres qu’un point est acquis, il disparaît.</p>
        </div>
        <div class="cp-cta"><button class="btn btn--primary btn--block btn--lg" id="cp-start">${icon('play')} Commencer</button></div>
      </main>
    </div>`;
  bindClose();
  document.getElementById('cp-start').addEventListener('click', () => { haptic(); nextStep(); });
}

function nextStep() {
  stopAll();
  C.stepIndex++;
  const step = C.plan.steps[C.stepIndex];
  if (!step) { finish(); return; }
  if (step.stepType === 'diagnose') return runDiagnose(step);
  if (step.stepType === 'practice') return runPractice(step);
  return runReader(step);
}

function stepHead(step, extra = '') {
  const meta = STEP_META[step.stepType];
  return `
    <div class="cp-step-head">
      <span class="cp-step-tag">${icon(meta.icon)} ${meta.title}${step.stepType === 'practice' ? ` · ${MODULE_LABEL[step.targetModule] || ''}` : ''}</span>
      <p class="cp-rationale">${esc(step.rationaleFr)}</p>
      ${extra}
    </div>`;
}

// ── Lecteur à aides escamotables ─────────────────────────────

let R = null;

function runReader(step) {
  const passage = C.lib.passages.find(p => p.id === step.passageId) || C.passage;
  const sc = step.recommendedScaffolding;
  R = {
    step, passage,
    mode: step.stepType,
    highlight: new Set(step.targetNotionIds),
    showVoc: passage.isImmutableSource ? true : (sc !== 'no_help' || passage.defaultVocalization === 'full'),
    showCues: sc === 'full_help',
    showTrans: sc === 'full_help',
    maxUsed: sc,
    selected: null,
    inspected: new Set(),
    flagged: new Set(),
    known: new Set(),
  };
  if (passage.corpus === 'quran') ensureSurah(passage.surah);
  drawReader();
}

const effectiveVoc = () => (R.passage.isImmutableSource || R.showVoc ? 'full' : R.passage.defaultVocalization);

function segText(seg, quranic) {
  const s = R.showVoc || R.passage.isImmutableSource ? seg.surface : bare(seg.surface);
  if (!R.showCues || quranic) return esc(s);
  if (seg.role === 'proclitic') return `${esc(s)}ـ`;
  if (seg.role === 'enclitic') return `ـ${esc(s)}`;
  return esc(s);
}

function tokenHtml(t) {
  const ids = tokenNotionIds(t);
  const quranic = R.passage.isImmutableSource;
  const punct = t.surfaceVocalized.slice(t.segments.map(s => s.surface).join('').length);
  const focus = R.mode !== 'discover' && ids.some(id => R.highlight.has(id));
  const flagged = ids.some(id => R.flagged.has(id));
  const cls = ['cp-tok', focus && 'cp-tok--focus', flagged && 'cp-tok--flag', R.selected === t.index && 'cp-tok--sel', R.showCues && 'cp-tok--cues'].filter(Boolean).join(' ');
  const inner = R.showCues && t.segments.length > 1
    ? t.segments.map(s => `<span class="cp-seg cp-seg--${s.role}">${segText(s, quranic)}</span>`).join(quranic ? '' : '<span class="cp-seg-gap"> </span>')
    : esc(R.showVoc || quranic ? t.segments.map(s => s.surface).join('') : t.surfaceUnvocalized.slice(0, t.surfaceUnvocalized.length - punct.length));
  return `<button class="${cls}" data-tok="${t.index}">${inner}</button>${punct ? `<span class="cp-punct">${esc(punct)}</span>` : ''}`;
}

const READER_TITLES = {
  discover: 'Lis le texte. Touche un mot seulement s’il te bloque.',
  reread: 'Relis avec moins d’aides : les mots surlignés sont ceux que tu viens de travailler.',
  transfer: 'Nouveau texte, mêmes notions : vérifie que tu les reconnais ici aussi.',
};

function drawReader() {
  const { passage, step } = R;
  const quranic = passage.isImmutableSource;
  $app().innerHTML = `
    <div class="cp-session">
      ${topBar()}
      <main class="cp-body">
        ${stepHead(step, step.stepType === 'transfer' ? `<div class="cp-transfer-title">${icon(CORPUS[passage.corpus].icon)} ${esc(passage.title)}</div>` : '')}
        <div class="cp-tools" role="toolbar" aria-label="Aides de lecture">
          <button class="cp-tool ${R.showVoc ? 'is-on' : ''}" id="t-voc" ${quranic ? 'disabled title="Vocalisation d’origine"' : ''} aria-pressed="${R.showVoc}">
            ${icon(quranic ? 'lock' : 'pen')} Voyelles</button>
          <button class="cp-tool ${R.showCues ? 'is-on' : ''}" id="t-cues" aria-pressed="${R.showCues}">${icon('grid')} Affixes</button>
          <button class="cp-tool ${R.showTrans ? 'is-on' : ''}" id="t-trans" aria-pressed="${R.showTrans}">${icon('languages')} Traduction</button>
          <button class="cp-tool" id="t-audio">${icon('volume-2')} Écouter</button>
        </div>
        <article class="cp-text ${quranic ? 'cp-text--quran' : ''}" lang="ar" dir="rtl">
          ${passage.tokens.map(tokenHtml).join(' ')}
        </article>
        ${R.showTrans ? `<p class="cp-trans">${esc(passage.translationFr)}${passage.translationSource ? ` <small>${esc(passage.translationSource)}</small>` : ''}</p>` : ''}
        <div id="cp-drawer">${R.selected !== null ? drawerHtml(passage.tokens[R.selected]) : `<p class="cp-hint">${icon('eye')} ${READER_TITLES[R.mode]}</p>`}</div>
        <div class="cp-cta">
          <div class="cp-help-meter">Aide utilisée : <b>${SCAFF_LABEL[R.maxUsed]}</b></div>
          <button class="btn btn--primary btn--block btn--lg" id="cp-done">${R.mode === 'discover' ? `${icon('check')} J’ai fini ma lecture` : `${icon('check')} Terminer`}</button>
        </div>
      </main>
    </div>`;
  bindClose();
  const $ = id => document.getElementById(id);
  $('t-voc').addEventListener('click', () => {
    if (quranic) return;
    R.showVoc = !R.showVoc;
    if (R.showVoc && passage.defaultVocalization === 'unvocalized') R.maxUsed = maxScaffolding(R.maxUsed, 'light_help');
    drawReader();
  });
  $('t-cues').addEventListener('click', () => {
    R.showCues = !R.showCues;
    if (R.showCues) R.maxUsed = maxScaffolding(R.maxUsed, 'light_help');
    drawReader();
  });
  $('t-trans').addEventListener('click', () => {
    R.showTrans = !R.showTrans;
    if (R.showTrans) R.maxUsed = maxScaffolding(R.maxUsed, 'full_help');
    drawReader();
  });
  $('t-audio').addEventListener('click', e => playPassage(passage, e.currentTarget));
  $app().querySelectorAll('[data-tok]').forEach(b => b.addEventListener('click', () => {
    const i = Number(b.dataset.tok);
    haptic(6);
    if (R.selected === i) { R.selected = null; drawReader(); return; }
    R.selected = i;
    R.inspected.add(i);
    R.maxUsed = maxScaffolding(R.maxUsed, 'light_help');
    drawReader();
    document.getElementById('cp-drawer')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }));
  bindDrawer();
  $('cp-done').addEventListener('click', finishReading);
}

function drawerHtml(t) {
  const quranic = R.passage.isImmutableSource;
  const ids = tokenNotionIds(t);
  return `
    <section class="cp-drawer" aria-live="polite">
      <div class="cp-drawer__head">
        <span class="cp-drawer__word" lang="ar">${esc(t.surfaceVocalized.replace(/[،.؟!:]$/, ''))}</span>
        <button class="audio-btn" id="d-audio" aria-label="Écouter le mot">${icon('volume-2')}</button>
        ${quranic && t.quranRef ? `<button class="btn btn--sm btn--tonal" id="d-qword">${icon('book-open')} Fiche Coran</button>` : ''}
      </div>
      <ul class="cp-segs">
        ${t.segments.map(s => `
          <li class="cp-segrow cp-segrow--${s.role}">
            <span class="cp-segrow__ar" lang="ar">${esc(s.role === 'proclitic' ? `${s.surface}ـ` : s.role === 'enclitic' ? `ـ${s.surface}` : s.surface)}</span>
            <span class="cp-segrow__role">${ROLE_LABEL[s.role]}</span>
            <span class="cp-segrow__gloss">${esc(s.glossFr)}</span>
          </li>`).join('')}
      </ul>
      <div class="cp-dnotions">
        ${ids.map(id => {
          const n = C.catalog[id];
          if (!n) return '';
          const flagged = R.flagged.has(id);
          const known = R.known.has(id);
          return `
            <div class="cp-dnotion ${flagged ? 'is-flagged' : ''} ${known ? 'is-known' : ''}">
              <button class="cp-dnotion__label" data-sheet="${esc(id)}">${esc(n.labelFr)} ${icon('info')}</button>
              <p>${esc(n.explanationFr)}</p>
              <div class="cp-dnotion__actions">
                <button class="btn btn--sm ${flagged ? 'btn--danger' : 'btn--secondary'}" data-flag="${esc(id)}">${icon('target')} ${flagged ? 'Point signalé' : 'Travailler ce point'}</button>
                <button class="btn btn--sm ${known ? 'btn--success' : 'btn--ghost'}" data-known="${esc(id)}">${icon('check')} ${known ? 'Connu' : 'Je connais déjà'}</button>
              </div>
            </div>`;
        }).join('')}
      </div>
    </section>`;
}

function bindDrawer() {
  if (R.selected === null) return;
  const t = R.passage.tokens[R.selected];
  document.getElementById('d-audio')?.addEventListener('click', async e => {
    if (R.passage.isImmutableSource && t.quranRef) {
      const w = await quranWord(t.quranRef);
      if (w?.a) { playUrl(AUDIO_WORD + w.a, e.currentTarget); return; }
    }
    playWord(t.surfaceVocalized, 'ar-SA');
  });
  document.getElementById('d-qword')?.addEventListener('click', async () => {
    const [s, v, j] = t.quranRef;
    const surah = await ensureSurah(s);
    const verse = surah?.verses.find(x => x.n === v);
    if (verse) openWordSheet({ surahId: s, verse, j });
  });
  $app().querySelectorAll('[data-sheet]').forEach(b => b.addEventListener('click', () => openNotionSheet(b.dataset.sheet)));
  $app().querySelectorAll('[data-flag]').forEach(b => b.addEventListener('click', () => {
    const id = b.dataset.flag;
    if (R.flagged.has(id)) R.flagged.delete(id); else { R.flagged.add(id); R.known.delete(id); }
    haptic();
    drawReader();
  }));
  $app().querySelectorAll('[data-known]').forEach(b => b.addEventListener('click', async () => {
    const id = b.dataset.known;
    const was = R.known.has(id);
    if (was) R.known.delete(id); else { R.known.add(id); R.flagged.delete(id); }
    haptic();
    await overrideNow(id, was ? null : 'known');
    drawReader();
  }));
}

async function ensureSurah(n) {
  if (!n) return null;
  if (!C.surahs[n]) C.surahs[n] = loadSurah(n).catch(() => null);
  return C.surahs[n];
}

async function quranWord([s, v, j]) {
  const surah = await ensureSurah(s);
  return surah?.verses.find(x => x.n === v)?.w[j] || null;
}

async function playPassage(passage, btn) {
  if (passage.corpus === 'quran') {
    const surah = await ensureSurah(passage.surah);
    const urls = (passage.verses || []).map(n => surah?.verses.find(v => v.n === n)?.audio).filter(Boolean).map(a => AUDIO_VERSE + a);
    if (urls.length) { playSequence(urls); return; }
  }
  btn?.classList.add('is-playing');
  await playWord(passage.tokens.map(t => t.surfaceVocalized).join(' '), 'ar-SA');
  btn?.classList.remove('is-playing');
}

async function finishReading() {
  stopAll();
  const { passage, mode } = R;
  const now = new Date().toISOString();
  const voc = effectiveVoc();
  const consulted = new Set(R.flagged);
  for (const i of R.inspected) tokenNotionIds(passage.tokens[i]).forEach(id => consulted.add(id));

  if (mode === 'discover') {
    // Seules les notions touchées ou signalées remontent comme points de blocage (sauf « Je connais déjà »)
    const blocked = [...consulted].filter(id => !R.known.has(id) && C.catalog[id]);
    const list = blocked.map(notionId => evidence({
      timestamp: now, notionId, dimension: defaultDimensionForNotion(C.catalog[notionId]),
      vocalization: voc, scaffolding: R.maxUsed, sourceModule: 'diagnostic', passageId: passage.id, isSuccess: false,
    }));
    await commit(list);
    C.plan = mergeFreshPlan();
    if (!blocked.length) toast('Aucun blocage signalé : on vérifie avec le repérage', { icon: 'check' });
    nextStep();
    return;
  }

  const targets = R.step.targetNotionIds.length
    ? R.step.targetNotionIds
    : [...new Set(passage.tokens.flatMap(t => tokenNotionIds(t)))];

  let gistOk = true;
  if (mode === 'transfer') gistOk = await gistCheck(passage);

  const list = targets.filter(id => C.catalog[id]).map(notionId => evidence({
    timestamp: now, notionId, dimension: defaultDimensionForNotion(C.catalog[notionId]),
    vocalization: voc,
    scaffolding: consulted.has(notionId) ? maxScaffolding(R.maxUsed, 'light_help') : R.maxUsed,
    sourceModule: mode === 'transfer' ? 'transfer' : 'reread',
    passageId: passage.id,
    isSuccess: gistOk && !R.flagged.has(notionId),
  }));
  list.forEach(e => (e.isSuccess ? C.correct++ : C.wrong++));
  await commit(list);
  nextStep();
}

/** Après la découverte, le plan est recalculé avec les blocages signalés ; on garde l'étape faite. */
function mergeFreshPlan() {
  const kept = C.plan.steps.slice(0, C.stepIndex + 1);
  const keptTypes = new Set(kept.map(s => s.stepType));
  const fresh = computePlan();
  return { ...fresh, steps: [...kept, ...fresh.steps.filter(s => !keptTypes.has(s.stepType))] };
}

/** Réemploi : une question de sens global avant de valider les notions. */
function gistCheck(passage) {
  const others = C.lib.passages.filter(p => p.id !== passage.id && p.corpus !== 'quran').map(p => p.translationFr);
  const opts = seededShuffle([passage.translationFr, ...seededShuffle(others, passage.id).slice(0, 2)], `${passage.id}:gist`);
  return new Promise(resolve => {
    $app().querySelector('.cp-cta').innerHTML = `
      <div class="cp-q">
        <div class="cp-q__title">${icon('help-circle')} Que dit ce texte ?</div>
        <div class="choice-grid">${opts.map((o, i) => `<button class="choice-btn" data-gist="${i}">${esc(o)}</button>`).join('')}</div>
      </div>`;
    $app().querySelectorAll('[data-gist]').forEach(b => b.addEventListener('click', async () => {
      const ok = opts[Number(b.dataset.gist)] === passage.translationFr;
      $app().querySelectorAll('[data-gist]').forEach(x => {
        x.disabled = true;
        if (opts[Number(x.dataset.gist)] === passage.translationFr) x.classList.add('is-correct');
      });
      if (!ok) b.classList.add('is-wrong');
      await showFeedback({ correct: ok, title: ok ? 'Bien compris' : 'Pas tout à fait', html: ok ? '' : `Sens : ${esc(passage.translationFr)}` });
      resolve(ok);
    }));
    $app().querySelector('.cp-cta').scrollIntoView({ behavior: 'smooth', block: 'end' });
  });
}

// ── Repérage (diagnostic) ─────────────────────────────

function runDiagnose(step) {
  const p = C.passage;
  const targeted = (p.diagnosticPrompts || []).filter(d => step.targetNotionIds.includes(d.targetNotionId));
  const prompts = (targeted.length ? targeted : p.diagnosticPrompts).slice(0, 2);
  let k = 0;
  const draw = () => {
    const d = prompts[k];
    const opts = seededShuffle([d.expectedAnswerFr, ...d.distractorsFr], d.id);
    const focus = new Set(d.targetTokenIndices);
    $app().innerHTML = `
      <div class="cp-session">
        ${topBar()}
        <main class="cp-body">
          ${stepHead(step, `<div class="cp-q-count">Question ${k + 1} / ${prompts.length}</div>`)}
          <article class="cp-text cp-text--compact ${p.isImmutableSource ? 'cp-text--quran' : ''}" lang="ar" dir="rtl">
            ${p.tokens.map(t => `<span class="cp-tok ${focus.has(t.index) ? 'cp-tok--focus' : 'cp-tok--dim'}">${esc(p.isImmutableSource || p.defaultVocalization !== 'unvocalized' ? t.surfaceVocalized : t.surfaceUnvocalized)}</span>`).join(' ')}
          </article>
          <div class="cp-q">
            <div class="cp-q__title">${esc(d.questionFr)}</div>
            <div class="choice-grid">${opts.map((o, i) => `<button class="choice-btn" data-opt="${i}">${esc(o)}</button>`).join('')}</div>
          </div>
        </main>
      </div>`;
    bindClose();
    $app().querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', async () => {
      const ok = opts[Number(b.dataset.opt)] === d.expectedAnswerFr;
      $app().querySelectorAll('[data-opt]').forEach(x => {
        x.disabled = true;
        if (opts[Number(x.dataset.opt)] === d.expectedAnswerFr) x.classList.add('is-correct');
      });
      if (!ok) b.classList.add('is-wrong');
      ok ? C.correct++ : C.wrong++;
      const n = C.catalog[d.targetNotionId];
      await commit([evidence({
        notionId: d.targetNotionId, dimension: defaultDimensionForNotion(n),
        vocalization: p.isImmutableSource ? 'full' : p.defaultVocalization,
        scaffolding: step.recommendedScaffolding, sourceModule: 'diagnostic', passageId: p.id, isSuccess: ok,
      })]);
      await showFeedback({
        correct: ok,
        title: ok ? 'Exact' : 'On va travailler ce point',
        html: `<b>${esc(n.labelFr)}</b> — ${esc(n.explanationFr)}`,
      });
      k++;
      if (k < prompts.length) { draw(); return; }
      // Le plan est recalculé : les notions réussies sortent de l'entraînement
      C.plan = mergeFreshPlan();
      nextStep();
    }));
  };
  draw();
}

// ── Entraînement (exemples pédagogiques, écoute, racines, reconstruction) ─────────────────

function runPractice(step) {
  const items = buildPracticeItems(step);
  if (!items.length) { nextStep(); return; }
  let k = 0;
  const go = () => {
    if (k >= items.length) { nextStep(); return; }
    const item = items[k++];
    drawPracticeItem(step, item, k, items.length, go);
  };
  go();
}

function buildPracticeItems(step) {
  const items = [];
  const sc = step.recommendedScaffolding;
  const unvoc = C.passage.defaultVocalization === 'unvocalized';
  for (const notionId of step.targetNotionIds) {
    const n = C.catalog[notionId];
    if (!n) continue;
    const dim = step.targetDimensions?.[notionId] || defaultDimensionForNotion(n);
    const drills = C.lib.drills.filter(d => d.notionId === notionId);
    if (sc === 'full_help') items.push({ kind: 'explain', n, drill: drills[0] || null });
    const mod = step.targetModule;
    if (mod === 'roots' && n.root) { items.push({ kind: 'root', n, dim }); continue; }
    if (mod === 'conversation') {
      const d = drills.find(x => x.arabicVocalized.split(' ').length >= 3);
      if (d) { items.push({ kind: 'build', n, dim, drill: d }); continue; }
    }
    if (mod === 'listening') {
      if (drills.length) drills.slice(0, 2).forEach(d => items.push({ kind: 'listen', n, dim, drill: d }));
      else if (n.wordAr) items.push({ kind: 'listen-word', n, dim });
      continue;
    }
    if (dim === 'memory_recall' && n.wordAr) { items.push({ kind: 'recall', n, dim }); continue; }
    if (drills.length) drills.slice(0, 2).forEach(d => items.push({ kind: 'meaning', n, dim, drill: d, unvoc: unvoc && dim === 'read_recognition' }));
    else if (n.wordAr) items.push({ kind: 'word', n, dim, unvoc: unvoc && dim === 'read_recognition' });
  }
  return items;
}

function meaningOptions(correct, pool, seed) {
  const others = [...new Set(pool.filter(x => x && x !== correct))];
  return seededShuffle([correct, ...seededShuffle(others, seed).slice(0, 2)], `${seed}:o`);
}

function drawPracticeItem(step, item, k, total, next) {
  const { n } = item;
  const sc = step.recommendedScaffolding;
  let used = sc;
  const ev = ok => evidence({
    notionId: n.id, dimension: item.dim || defaultDimensionForNotion(n),
    vocalization: item.unvoc ? 'unvocalized' : 'full', scaffolding: used,
    sourceModule: { listen: 'listening', 'listen-word': 'listening', build: 'dialogue', root: 'roots' }[item.kind] || 'flashcard',
    isSuccess: ok,
  });
  const reminder = sc === 'light_help' && item.kind !== 'explain'
    ? `<details class="cp-remind"><summary>${icon('lightbulb')} Rappel : ${esc(n.labelFr)}</summary><p>${esc(n.explanationFr)}</p></details>` : '';
  const shell = body => `
    <div class="cp-session">
      ${topBar()}
      <main class="cp-body">
        ${stepHead(step, `<div class="cp-q-count">${k} / ${total}</div>`)}
        ${body}
      </main>
    </div>`;

  const answer = async (ok, html) => {
    ok ? C.correct++ : C.wrong++;
    await commit([ev(ok)]);
    await showFeedback({ correct: ok, html });
    next();
  };

  const bindChoices = (opts, correct, after) => {
    $app().querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', () => {
      const ok = opts[Number(b.dataset.opt)] === correct;
      $app().querySelectorAll('[data-opt]').forEach(x => {
        x.disabled = true;
        if (opts[Number(x.dataset.opt)] === correct) x.classList.add('is-correct');
      });
      if (!ok) b.classList.add('is-wrong');
      answer(ok, after);
    }));
  };
  const choicesHtml = (opts, ar = false) => `<div class="choice-grid">${opts.map((o, i) => `<button class="choice-btn ${ar ? 'choice-btn--ar' : ''}" data-opt="${i}" ${ar ? 'lang="ar"' : ''}>${esc(o)}</button>`).join('')}</div>`;
  const remindBind = () => $app().querySelector('.cp-remind')?.addEventListener('toggle', e => { if (e.target.open) used = maxScaffolding(used, 'light_help'); });

  if (item.kind === 'explain') {
    $app().innerHTML = shell(`
      <section class="cp-card-x">
        <div class="cp-card-x__eyebrow">${icon('lightbulb')} À savoir</div>
        ${n.wordAr ? `<div class="cp-card-x__ar" lang="ar">${esc(n.wordAr)}</div>` : ''}
        <h2>${esc(n.labelFr)}</h2>
        <p>${esc(n.explanationFr)}</p>
        ${item.drill ? `<div class="cp-ex"><p lang="ar" dir="rtl">${esc(item.drill.arabicVocalized)}</p><span>${esc(item.drill.frenchMeaning)}</span>
          <button class="audio-btn" id="x-audio" aria-label="Écouter">${icon('volume-2')}</button></div>` : ''}
      </section>
      <div class="cp-cta"><button class="btn btn--primary btn--block btn--lg" id="x-next">J’ai compris</button></div>`);
    bindClose();
    document.getElementById('x-audio')?.addEventListener('click', () => playWord(item.drill.arabicVocalized, 'ar-SA'));
    document.getElementById('x-next').addEventListener('click', next);
    return;
  }

  if (item.kind === 'meaning' || item.kind === 'listen') {
    const d = item.drill;
    const pool = C.lib.drills.filter(x => x.id !== d.id).map(x => x.frenchMeaning);
    const opts = meaningOptions(d.frenchMeaning, pool, d.id);
    const listen = item.kind === 'listen';
    const showText = !listen || sc === 'full_help';
    $app().innerHTML = shell(`
      ${reminder}
      <section class="cp-drill">
        ${listen ? `<button class="cp-listen pressable" id="p-play">${icon('headphones')}<span>Écouter</span></button>` : ''}
        <p class="cp-drill__ar ${showText ? '' : 'is-hidden'}" lang="ar" dir="rtl" id="p-ar">${esc(item.unvoc ? d.arabicUnvocalized : d.arabicVocalized)}</p>
        ${listen && !showText ? `<button class="btn btn--sm btn--ghost" id="p-show">${icon('eye')} Afficher le texte</button>` : ''}
        ${!listen ? `<button class="audio-btn" id="p-play" aria-label="Écouter">${icon('volume-2')}</button>` : ''}
      </section>
      <div class="cp-q"><div class="cp-q__title">${listen ? 'Qu’as-tu entendu ?' : 'Que signifie cette phrase ?'}</div>${choicesHtml(opts)}</div>`);
    bindClose();
    remindBind();
    const play = () => playWord(d.arabicVocalized, 'ar-SA');
    document.getElementById('p-play')?.addEventListener('click', play);
    document.getElementById('p-show')?.addEventListener('click', e => {
      used = 'full_help';
      document.getElementById('p-ar').classList.remove('is-hidden');
      e.currentTarget.remove();
    });
    if (listen) setTimeout(play, 350);
    bindChoices(opts, d.frenchMeaning, `<span lang="ar">${esc(d.arabicVocalized)}</span><br>${esc(d.frenchMeaning)}`);
    return;
  }

  if (item.kind === 'word' || item.kind === 'listen-word') {
    const pool = Object.values(C.catalog).filter(x => x.meaningFr && x.id !== n.id).map(x => x.meaningFr);
    const opts = meaningOptions(n.meaningFr, pool, n.id);
    const listen = item.kind === 'listen-word';
    $app().innerHTML = shell(`
      ${reminder}
      <section class="cp-drill">
        ${listen ? `<button class="cp-listen pressable" id="p-play">${icon('headphones')}<span>Écouter</span></button>` : `<p class="cp-drill__ar cp-drill__ar--word" lang="ar">${esc(item.unvoc ? bare(n.wordAr) : n.wordAr)}</p>`}
      </section>
      <div class="cp-q"><div class="cp-q__title">Quel est le sens de ce mot ?</div>${choicesHtml(opts)}</div>`);
    bindClose();
    remindBind();
    const play = () => playWord(n.wordAr.split(' / ')[0], 'ar-SA');
    document.getElementById('p-play')?.addEventListener('click', play);
    if (listen) setTimeout(play, 350);
    bindChoices(opts, n.meaningFr, `<span lang="ar">${esc(n.wordAr)}</span> — ${esc(n.meaningFr)}`);
    return;
  }

  if (item.kind === 'recall') {
    $app().innerHTML = shell(`
      <section class="cp-drill">
        <p class="cp-drill__ar cp-drill__ar--word" lang="ar">${esc(n.wordAr)}</p>
        <p class="cp-recall is-hidden" id="r-ans">${esc(n.meaningFr)}</p>
      </section>
      <div class="cp-q" id="r-q">
        <div class="cp-q__title">Te souviens-tu de son sens, sans choix proposés ?</div>
        <button class="btn btn--primary btn--block btn--lg" id="r-show">${icon('eye')} Vérifier</button>
      </div>`);
    bindClose();
    document.getElementById('r-show').addEventListener('click', () => {
      document.getElementById('r-ans').classList.remove('is-hidden');
      document.getElementById('r-q').innerHTML = `
        <div class="mr-grade">
          <button class="btn btn--secondary btn--lg" id="r-ko">${icon('rotate-ccw')} Pas encore</button>
          <button class="btn btn--primary btn--lg" id="r-ok">${icon('check')} Je savais</button>
        </div>`;
      document.getElementById('r-ok').addEventListener('click', () => answer(true, ''));
      document.getElementById('r-ko').addEventListener('click', () => answer(false, esc(n.explanationFr)));
    });
    return;
  }

  if (item.kind === 'root') {
    const roots = [...new Set(Object.values(C.catalog).map(x => x.root).filter(r => r && r !== n.root))];
    const opts = seededShuffle([n.root, ...seededShuffle(roots, n.id).slice(0, 2)], `${n.id}:r`);
    $app().innerHTML = shell(`
      ${reminder}
      <section class="cp-drill"><p class="cp-drill__ar cp-drill__ar--word" lang="ar">${esc(n.wordAr)}</p><span class="cp-drill__fr">${esc(n.meaningFr)}</span></section>
      <div class="cp-q"><div class="cp-q__title">De quelle racine vient ce mot ?</div>
        <div class="choice-grid choice-grid--3">${opts.map((o, i) => `<button class="choice-btn choice-btn--ar" lang="ar" data-opt="${i}">${esc(rootDisplay(o))}</button>`).join('')}</div>
      </div>
      <div id="r-family"></div>`);
    bindClose();
    remindBind();
    $app().querySelectorAll('[data-opt]').forEach(b => b.addEventListener('click', async () => {
      const ok = opts[Number(b.dataset.opt)] === n.root;
      $app().querySelectorAll('[data-opt]').forEach(x => {
        x.disabled = true;
        if (opts[Number(x.dataset.opt)] === n.root) x.classList.add('is-correct');
      });
      if (!ok) b.classList.add('is-wrong');
      const fam = await familyHtml(n.root);
      answer(ok, `Racine <b lang="ar">${esc(rootDisplay(n.root))}</b>${fam}`);
    }));
    return;
  }

  if (item.kind === 'build') {
    const d = item.drill;
    const words = d.arabicVocalized.replace(/[.؟!،]$/, '').split(' ');
    const end = d.arabicVocalized.match(/[.؟!،]$/)?.[0] || '';
    const given = sc === 'full_help' ? 1 : 0;
    const bank = seededShuffle(words.map((w, i) => ({ w, i })).slice(given), d.id);
    const built = words.slice(0, given).map((w, i) => ({ w, i }));
    const draw = () => {
      $app().innerHTML = shell(`
        ${reminder}
        <section class="cp-build">
          <div class="cp-q__title">${icon('edit-3')} Reconstruis la phrase arabe :</div>
          <p class="cp-build__fr">« ${esc(d.frenchMeaning)} »</p>
          <div class="cp-build__line" lang="ar" dir="rtl">${built.map((x, j) => `<button class="cp-tile is-placed" data-un="${j}" ${j < given ? 'disabled' : ''}>${esc(x.w)}</button>`).join('')}${built.length ? esc(end) : '<span class="cp-build__ph">…</span>'}</div>
          <div class="cp-build__bank" lang="ar" dir="rtl">${bank.map((x, j) => `<button class="cp-tile" data-pick="${j}">${esc(x.w)}</button>`).join('')}</div>
        </section>
        <div class="cp-cta"><button class="btn btn--primary btn--block btn--lg" id="b-check" ${bank.length ? 'disabled' : ''}>${icon('check')} Vérifier</button></div>`);
      bindClose();
      remindBind();
      $app().querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => { built.push(...bank.splice(Number(b.dataset.pick), 1)); haptic(5); draw(); }));
      $app().querySelectorAll('[data-un]').forEach(b => b.addEventListener('click', () => { bank.push(...built.splice(Number(b.dataset.un), 1)); draw(); }));
      document.getElementById('b-check').addEventListener('click', () => {
        const ok = built.map(x => x.w).join(' ') === words.join(' ');
        answer(ok, `<span lang="ar">${esc(d.arabicVocalized)}</span>`);
      });
    };
    draw();
  }
}

async function familyHtml(root) {
  const lexicon = await loadLexicon().catch(() => null);
  const lemmas = lexicon?.roots?.[root];
  if (!lemmas?.length) return '';
  const top = [...lemmas].sort((a, b) => (lexicon.lemmas[b]?.[1] || 0) - (lexicon.lemmas[a]?.[1] || 0)).slice(0, 4);
  return `<br><span class="cp-fam">Dans le Coran : ${top.map(l => `<span lang="ar">${esc(l)}</span> <small>${esc(lemmaMeaning(l, lexicon) || '')}</small>`).join(' · ')}</span>`;
}

// ── Bilan ─────────────────────────────

async function finish() {
  stopAll();
  const after = currentMastery();
  const touched = [...new Set(C.session.map(e => e.notionId))].map(id => C.catalog[id]).filter(Boolean);
  const rows = touched.map(n => {
    const d = defaultDimensionForNotion(n);
    const before = levelOf(getEffectiveScore(C.startMastery[n.id], d, 'full'), C.startMastery[n.id]?.dimensions?.[d]?.evidenceCount || 0);
    const now = levelOf(getEffectiveScore(after[n.id], d, 'full'), after[n.id]?.dimensions?.[d]?.evidenceCount || 0);
    return { n, before, now };
  });
  const total = C.correct + C.wrong;
  await recordActivity(courseId(), { correct: C.correct, wrong: C.wrong, lessons: 1 }).catch(() => {});
  const readiness = evaluatePassageReadiness(C.passage, after, C.catalog);
  if (total && C.wrong === 0) confetti();

  const next = C.lib.passages
    .filter(p => p.id !== C.passage.id)
    .map(p => ({ p, r: evaluatePassageReadiness(p, after, C.catalog) }))
    .sort((a, b) => ({ syntax_to_discover: 0, ready_now: 1, prepare_first: 2 }[a.r.status] - { syntax_to_discover: 0, ready_now: 1, prepare_first: 2 }[b.r.status]))[0];

  $app().innerHTML = `
    <div class="cp-session">
      <div class="pl-top cp-top"><button class="back-btn icon-btn--ghost" id="cp-close" aria-label="Fermer">${icon('x')}</button><div class="pl-top__mid">${progressBar(100)}</div></div>
      <main class="cp-body cp-summary">
        <div class="completion__icon">${icon('award')}</div>
        <h1 class="completion__title">Séance terminée</h1>
        <p class="cp-summary__sub">${total ? `${C.correct} réponse${C.correct > 1 ? 's' : ''} juste${C.correct > 1 ? 's' : ''} sur ${total}` : 'Lecture validée'} · ${esc(readiness.guidanceFr)}</p>
        ${rows.length ? `
          <ul class="cp-progress">
            ${rows.map(({ n, before, now }) => `
              <li><button class="cp-progress__row pressable" data-notion="${esc(n.id)}">
                <span class="cp-progress__label">${esc(n.labelFr)}</span>
                <span class="cp-progress__lv">${before.id !== now.id ? `<span class="cp-dim cp-dim--${before.id}">${before.label}</span>${icon('arrow-left')}` : ''}<span class="cp-dim cp-dim--${now.id}">${now.label}</span></span>
              </button></li>`).join('')}
          </ul>` : ''}
        <div class="cp-cta">
          ${next ? `<button class="btn btn--primary btn--block btn--lg" data-navigate="/comprendre/${encodeURIComponent(next.p.id)}">${icon('arrow-right')} Lire ensuite : ${esc(next.p.title)}</button>` : ''}
          <button class="btn btn--ghost btn--block" data-navigate="/comprendre">Retour à la bibliothèque</button>
        </div>
      </main>
    </div>`;
  bindClose();
  $app().querySelectorAll('[data-notion]').forEach(b => b.addEventListener('click', () => openNotionSheet(b.dataset.notion)));
}

// ── Utilitaires ─────────────────────────────

/** Mélange déterministe (les choix ne bougent pas d'un affichage à l'autre). */
function seededShuffle(arr, seed) {
  let h = 2166136261;
  for (const ch of String(seed)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => { h = Math.imul(h ^ (h >>> 15), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export { loadLibrary };
