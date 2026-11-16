// js/pages/tuteur.js — Conversation libre avec Karim, tuteur IA (Claude via le Worker)

import { store } from '../store.js';
import { escapeHtml } from '../utils.js';
import { icon } from '../icons.js';
import { playWord } from '../audio.js';
import { haptic, toast } from '../ui.js';
import { renderBottomNav } from '../components/bottom-nav.js';
import { recordActivity } from '../activity.js';
import { getParcoursState } from '../parcours.js';
import { accountReady } from '../sync.js';
import { db } from '../db.js';

const $app = () => document.getElementById('app');
const SAVE_KEY = 'ha-tutor';
const KICKOFF = 'Commence la conversation.';

const SCENARIOS = [
  { id: 'libre',        emoji: '☕', title: 'Discussion libre', desc: 'Prendre des nouvelles, parler de ta journée' },
  { id: 'presentation', emoji: '👋', title: 'Se présenter',      desc: 'Prénom, pays, études, travail' },
  { id: 'cafe',         emoji: '🧋', title: 'Au café',           desc: 'Commander, demander le prix' },
  { id: 'famille',      emoji: '👨‍👩‍👧', title: 'La famille',  desc: 'Parents, frères et sœurs' },
  { id: 'loisirs',      emoji: '⚽', title: 'Les loisirs',       desc: 'Sport, musique, week-end' },
  { id: 'voyage',       emoji: '🧳', title: 'En voyage',         desc: 'Chemin, hôtel, taxi' },
  { id: 'coran',        emoji: '📖', title: 'Mots du Coran',     desc: 'Réutiliser les mots que tu mémorises' },
];

let T = null;

const load = () => { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || null; } catch { return null; } };
const save = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ scenario: T.scenario, level: T.level, messages: T.messages })); } catch { /* quota */ } };

export async function renderTutor() {
  // Attend la vérification du compte (lancée au démarrage) si elle n'est pas encore terminée
  const account = store.get('account') ?? await Promise.race([accountReady, new Promise(r => setTimeout(() => r(null), 6000))]);
  const saved = load();
  const level = saved?.level || await guessLevel();
  T = { scenario: saved?.scenario || 'libre', level, messages: saved?.messages || [], busy: false, suggestions: [] };
  renderPicker(account, saved);
}

async function guessLevel() {
  try {
    const s = await getParcoursState();
    return s.pct >= 100 ? 'B1' : s.pct >= 50 ? 'A2' : 'A1';
  } catch { return 'A1'; }
}

// ═════════ Choix du scénario ═════════

function renderPicker(account, saved) {
  const aiReady = Boolean(account?.ai);
  const hasSaved = saved?.messages?.length > 1;
  const scen = SCENARIOS.find(s => s.id === saved?.scenario);

  $app().innerHTML = `
    <main class="page-content page-content--nav tt-picker">
      <div class="stagger">
        <section class="tt-hero">
          <div class="tt-hero__avatar">ك<span class="tt-hero__spark">${icon('sparkles')}</span></div>
          <div class="tt-hero__eyebrow">${icon('sparkles')} Tuteur IA</div>
          <h1 class="tt-hero__title">Discute avec Karim</h1>
          <p class="tt-hero__sub">Une vraie conversation en arabe, à ton niveau. Karim corrige tes phrases avec bienveillance et te souffle des réponses.</p>
        </section>

        ${aiReady ? '' : `
          <div class="tt-offline card card--sunk">
            ${icon('info')}
            <div>
              <strong>${account ? 'Clé API à configurer' : 'Disponible en ligne'}</strong>
              <p>${account
                ? 'Ajoute le secret ANTHROPIC_API_KEY au Worker Cloudflare pour réveiller Karim.'
                : 'Karim fonctionne quand l’app est servie par le Worker Cloudflare (pas en mode local).'}</p>
            </div>
          </div>`}

        ${hasSaved && aiReady ? `
          <button class="row pressable tt-resume" id="tt-resume">
            <span class="row__icon">${icon('message-circle')}</span>
            <span class="row__body">
              <span class="row__title">Reprendre la conversation</span>
              <span class="row__meta">${escapeHtml(scen?.title || 'Discussion')} · ${saved.messages.length - 1} messages</span>
            </span>
            <span class="row__chev">${icon('chevron-right')}</span>
          </button>` : ''}

        <section class="section">
          <div class="section__head">
            <h2 class="section__title">Choisis une situation</h2>
            <div class="segmented tt-level" role="radiogroup" aria-label="Niveau">
              ${['A1', 'A2', 'B1'].map(l => `<button class="${T.level === l ? 'is-active' : ''}" data-level="${l}" role="radio" aria-checked="${T.level === l}">${l}</button>`).join('')}
            </div>
          </div>
          <div class="tt-scenarios">
            ${SCENARIOS.map(s => `
              <button class="tt-scenario pressable" data-scenario="${s.id}" ${aiReady ? '' : 'disabled'}>
                <span class="tt-scenario__emoji">${s.emoji}</span>
                <span class="tt-scenario__title">${s.title}</span>
                <span class="tt-scenario__desc">${s.desc}</span>
              </button>`).join('')}
          </div>
        </section>
      </div>
    </main>
    ${renderBottomNav('home')}`;

  $app().querySelectorAll('[data-level]').forEach(b => b.addEventListener('click', () => {
    T.level = b.dataset.level;
    $app().querySelectorAll('[data-level]').forEach(x => {
      x.classList.toggle('is-active', x === b);
      x.setAttribute('aria-checked', String(x === b));
    });
    haptic();
  }));
  $app().querySelectorAll('[data-scenario]').forEach(b => b.addEventListener('click', () => {
    T.scenario = b.dataset.scenario;
    T.messages = [{ role: 'user', content: KICKOFF }];
    save();
    renderChat();
    send(null);
  }));
  document.getElementById('tt-resume')?.addEventListener('click', () => renderChat());
}

// ═════════ Conversation ═════════

function renderChat() {
  const scen = SCENARIOS.find(s => s.id === T.scenario) || SCENARIOS[0];
  $app().innerHTML = `
    <div class="pl-chat tt-chat">
      <div class="pl-top">
        <button class="back-btn icon-btn--ghost" id="tt-back" aria-label="Retour">${icon('arrow-left')}</button>
        <div class="pl-contact tt-contact">
          <div class="pl-contact__avatar">ك<span class="pl-contact__dot"></span></div>
          <div>
            <div class="pl-contact__name">Karim <span class="badge badge--violet tt-ai-badge">${icon('sparkles')} IA</span></div>
            <div class="pl-contact__status">${scen.emoji} ${escapeHtml(scen.title)} · ${T.level}</div>
          </div>
        </div>
        <button class="icon-btn icon-btn--ghost" id="tt-new" aria-label="Nouvelle conversation">${icon('rotate-ccw')}</button>
      </div>
      <main class="pl-thread" id="tt-thread" aria-live="polite">
        <div class="pl-day">Conversation · ${escapeHtml(scen.title)}</div>
      </main>
      <footer class="tt-dock">
        <div class="tt-suggest" id="tt-suggest"></div>
        <form class="tt-input" id="tt-form" autocomplete="off">
          <textarea id="tt-text" rows="1" dir="auto" placeholder="Écris en arabe… ou en français" aria-label="Ton message"></textarea>
          ${speechSupported() ? `<button type="button" class="tt-mic" id="tt-mic" aria-label="Dicter en arabe">${icon('mic')}</button>` : ''}
          <button type="submit" class="tt-send" id="tt-send" aria-label="Envoyer">${icon('arrow-right')}</button>
        </form>
      </footer>
    </div>`;

  // Rejoue l'historique
  const thread = document.getElementById('tt-thread');
  T.messages.forEach((m, i) => {
    if (m.role === 'user' && m.content !== KICKOFF) thread.insertAdjacentHTML('beforeend', userBubble(m.content));
    if (m.role === 'assistant') {
      const turn = parseTurn(m.content);
      if (turn) {
        attachCorrection(turn.correction);
        thread.insertAdjacentHTML('beforeend', karimBubble(turn));
        if (i === T.messages.length - 1) T.suggestions = turn.suggestions || [];
      }
    }
  });
  bindAudio(thread);
  renderSuggestions();
  scrollEnd(false);

  document.getElementById('tt-back').addEventListener('click', () => renderPicker(store.get('account'), load()));
  document.getElementById('tt-new').addEventListener('click', () => {
    T.messages = [{ role: 'user', content: KICKOFF }];
    save();
    renderChat();
    send(null);
  });
  const text = document.getElementById('tt-text');
  text.addEventListener('input', autoGrow);
  text.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); document.getElementById('tt-form').requestSubmit(); }
  });
  document.getElementById('tt-form').addEventListener('submit', e => {
    e.preventDefault();
    const value = text.value.trim();
    if (!value || T.busy) return;
    text.value = '';
    autoGrow.call(text);
    send(value);
  });
  document.getElementById('tt-mic')?.addEventListener('click', dictate);
}

async function send(userText) {
  if (T.busy) return;
  T.busy = true;
  const thread = document.getElementById('tt-thread');
  if (userText) {
    T.messages.push({ role: 'user', content: userText });
    save();
    thread.insertAdjacentHTML('beforeend', userBubble(userText));
    haptic();
  }
  T.suggestions = [];
  renderSuggestions();
  thread.insertAdjacentHTML('beforeend', `<div class="msg msg--them msg--typing" id="tt-typing" role="status" aria-label="Karim prépare sa réponse"><div class="msg__avatar">ك</div><div class="msg__bubble"><span></span><span></span><span></span></div></div>`);
  scrollEnd();
  setBusy(true);

  try {
    const res = await fetch('api/tutor', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ scenario: T.scenario, level: T.level, messages: T.messages, focus: T.scenario === 'coran' ? await quranFocus() : [] }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.message || 'Karim ne répond pas pour le moment.');
    document.getElementById('tt-typing')?.remove();
    T.messages.push({ role: 'assistant', content: body.raw });
    save();
    const turn = body.turn;
    attachCorrection(turn.correction);
    thread.insertAdjacentHTML('beforeend', karimBubble(turn));
    bindAudio(thread.lastElementChild);
    T.suggestions = turn.suggestions || [];
    renderSuggestions();
    scrollEnd();
    if (userText) {
      const course = store.get('currentCourse');
      recordActivity(course?.id || 'arabic', { correct: turn.correction?.has_error ? 0 : 1, wrong: turn.correction?.has_error ? 1 : 0 });
    }
  } catch (err) {
    document.getElementById('tt-typing')?.remove();
    thread.insertAdjacentHTML('beforeend', `
      <div class="tt-error" role="alert">
        ${icon('info')}<span>${escapeHtml(err.message)}</span>
        <button class="btn btn--sm btn--secondary" id="tt-retry">Réessayer</button>
      </div>`);
    document.getElementById('tt-retry')?.addEventListener('click', e => {
      e.currentTarget.closest('.tt-error').remove();
      T.busy = false;
      send(null);
    });
    scrollEnd();
  } finally {
    T.busy = false;
    setBusy(false);
  }
}

// ═════════ Rendu ═════════

function userBubble(text) {
  return `
    <div class="msg msg--me tt-me">
      <div class="msg__bubble"><p class="tt-me__text" dir="auto">${escapeHtml(text)}</p></div>
    </div>`;
}

function karimBubble(turn) {
  return `
    <div class="msg msg--them">
      <div class="msg__avatar">ك</div>
      <div class="msg__col">
        <div class="msg__bubble">
          <div class="msg__head">
            <span class="badge badge--violet">${icon('sparkles')} Karim</span>
            <button class="msg__audio" data-say="${escapeHtml(turn.reply_ar)}" aria-label="Écouter">${icon('volume-2')}</button>
          </div>
          <p class="msg__ar" lang="ar">${escapeHtml(turn.reply_ar)}</p>
          <p class="msg__translit">${escapeHtml(turn.reply_translit || '')}</p>
          <button class="msg__reveal" aria-label="Afficher la traduction">
            <span class="msg__reveal-text">${escapeHtml(turn.reply_fr || '')}</span>
            <span class="msg__reveal-hint">${icon('eye')} Traduction</span>
          </button>
        </div>
        ${(turn.vocab || []).length ? `
          <div class="tt-vocab">
            ${turn.vocab.map(v => `<span class="tt-vocab__chip"><span lang="ar">${escapeHtml(v.ar)}</span>${escapeHtml(v.fr)}</span>`).join('')}
          </div>` : ''}
      </div>
    </div>`;
}

/** Affiche la correction sous la dernière bulle de l'apprenant. */
function attachCorrection(c) {
  if (!c?.has_error || !c.corrected_ar) return;
  const mine = [...document.querySelectorAll('#tt-thread .tt-me')].pop();
  if (!mine || mine.nextElementSibling?.classList.contains('tt-correction')) return;
  mine.insertAdjacentHTML('afterend', `
    <div class="tt-correction">
      <div class="tt-correction__head">${icon('pen')} Plutôt :</div>
      <p class="tt-correction__ar" lang="ar">${escapeHtml(c.corrected_ar)}</p>
      ${c.explanation_fr ? `<p class="tt-correction__why">${escapeHtml(c.explanation_fr)}</p>` : ''}
    </div>`);
}

function renderSuggestions() {
  const el = document.getElementById('tt-suggest');
  if (!el) return;
  el.innerHTML = T.suggestions.map((s, i) => `
    <button class="tt-chip" data-i="${i}" title="${escapeHtml(s.fr)}">
      <span class="tt-chip__ar" lang="ar">${escapeHtml(s.ar)}</span>
      <span class="tt-chip__fr">${escapeHtml(s.fr)}</span>
    </button>`).join('');
  el.querySelectorAll('.tt-chip').forEach(b => b.addEventListener('click', () => {
    const s = T.suggestions[Number(b.dataset.i)];
    const text = document.getElementById('tt-text');
    text.value = s.ar;
    autoGrow.call(text);
    text.focus();
    haptic();
  }));
}

function parseTurn(raw) {
  try { return JSON.parse(raw); } catch { return null; }
}

function setBusy(on) {
  const btn = document.getElementById('tt-send');
  if (btn) btn.disabled = on;
}

function autoGrow() {
  this.style.height = 'auto';
  this.style.height = `${Math.min(this.scrollHeight, 140)}px`;
}

function scrollEnd(smooth = true) {
  requestAnimationFrame(() => {
    const t = document.getElementById('tt-thread');
    if (t) t.scrollTo({ top: t.scrollHeight, behavior: smooth ? 'smooth' : 'instant' });
  });
}

function bindAudio(root) {
  root?.querySelectorAll?.('[data-say]').forEach(b => {
    if (b.dataset.bound) return;
    b.dataset.bound = '1';
    b.addEventListener('click', async () => {
      b.classList.add('is-playing');
      await playWord(b.dataset.say, 'ar-SA');
      b.classList.remove('is-playing');
    });
  });
  root?.querySelectorAll?.('.msg__reveal').forEach(b => b.addEventListener('click', () => b.classList.add('is-revealed')));
}

/** Les mots du Coran étudiés le plus récemment (pour que Karim les fasse réutiliser). */
async function quranFocus() {
  const course = store.get('currentCourse');
  const srs = await db.getSRS(course?.id || 'arabic').catch(() => []);
  return srs.filter(e => e.cardId.startsWith('q:'))
    .sort((a, b) => (b.lastReview || b.createdAt || '').localeCompare(a.lastReview || a.createdAt || ''))
    .slice(0, 15)
    .map(e => e.cardId.slice(2));
}

// ═════════ Dictée (reconnaissance vocale arabe) ═════════

function speechSupported() {
  return Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
}

function dictate() {
  const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Rec) return;
  const btn = document.getElementById('tt-mic');
  const rec = new Rec();
  rec.lang = 'ar-SA';
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  btn.classList.add('is-listening');
  rec.onresult = e => {
    const text = document.getElementById('tt-text');
    text.value = `${text.value ? text.value + ' ' : ''}${e.results[0][0].transcript}`;
    autoGrow.call(text);
  };
  rec.onerror = e => { if (e.error !== 'no-speech') toast('Micro indisponible', { icon: 'mic' }); };
  rec.onend = () => btn.classList.remove('is-listening');
  rec.start();
}
