// L'élément possède le micro uniquement pendant sa présence dans l'exercice.
import { icon } from '../icons.js';
import { PronunciationTake } from './pronunciation-take.js';
import { stopAudio } from '../components/quran-audio.js';

import { listenToVerse, prepareRecitationMicrophone } from './hifz-capture.js';

const labels = {
  wrong_word: 'Mot à reprendre',
  omitted_word: 'Mot manquant',
  added_word: 'Mot en trop',
  skipped_passage: 'Passage sauté',
};

class HifzMicrophone extends HTMLElement {
  connectedCallback() {
    this.controller = new AbortController();
    const pilot = this.hasAttribute('data-pronunciation');
    const total = this.closest('main').querySelectorAll('.practice-word').length;
    const singleVerse = this.dataset.from === this.dataset.to;
    this.innerHTML = `<section class="practice-tracking">
      <div class="practice-tracking__title"><h2>Suivi des mots</h2><span data-count>0 / ${total}</span></div>
      <progress aria-label="Mots repérés" value="0" max="${total || 1}"></progress>
      <p role="status">Récite à voix haute. Premier téléchargement · 25 Mo.</p>
      <p data-progress></p>
      <label data-level hidden>Niveau du micro <meter min="-70" max="0" value="-70"></meter></label>
      <ul aria-live="polite" aria-label="Passages à revoir"></ul>
    </section>
    ${pilot ? `<div class="practice-option">
        <label><input type="checkbox" data-pronunciation aria-describedby="practice-option-help">
          <span>Vérifier ma prononciation</span></label>
        <p id="practice-option-help">Essai sur ح et le madd final à l’arrêt. Analyse sur cet appareil · modèle de 876 Mo.</p>
        <p data-analysis aria-live="polite"></p></div>` : ''}
    <div class="practice-dock">
      <button class="btn practice-replay" data-replay>${icon('headphones')} <span>Écouter ${singleVerse ? 'le verset' : 'le passage'}</span></button>
      <button class="btn practice-record" data-record>${icon('mic')} <span>Réciter au micro</span></button>
    </div>`;
    this.button = this.querySelector('[data-record]');
    this.replay = this.querySelector('[data-replay]');
    this.replay.onclick = () => this.listen(this.replay);
    this.status = this.querySelector('[role=status]');
    this.button.onclick = () => this.activate();
    window.addEventListener('pagehide', () => this.close(), { signal: this.controller.signal });
  }

  disconnectedCallback() { this.close(); }

  stopReference() {
    this.playback?.abort();
    this.playback = null;
    stopAudio();
    this.replay.querySelector('span').textContent = `${this.completed ? 'Réécouter' : 'Écouter'} ${this.dataset.from === this.dataset.to ? 'le verset' : 'le passage'}`;
    const active = this.closest('main')?.querySelector('[data-playing]');
    active?.removeAttribute('data-playing');
    if (active?.hasAttribute('data-listen-verse')) {
      active.setAttribute('aria-label', `Écouter le verset ${active.dataset.listenVerse}`);
      active.innerHTML = icon('volume-2');
    }
  }

  async listen(button) {
    const wasPlaying = button.hasAttribute('data-playing');
    this.stopReference();
    if (wasPlaying || this.mic || this.button.disabled) return;
    const playback = new AbortController();
    this.playback = playback;
    button.dataset.playing = '';
    if (button === this.replay) button.querySelector('span').textContent = 'Arrêter l’écoute';
    else {
      button.setAttribute('aria-label', 'Arrêter l’écoute');
      button.innerHTML = icon('stop');
    }
    try {
      await this.playReference(button, playback.signal);
    } catch {
      if (!playback.signal.aborted) this.status.textContent = 'Lecture indisponible. Réessaie dans un instant.';
    } finally {
      if (!playback.signal.aborted) this.stopReference();
    }
  }

  close() {
    this.controller.abort();
    this.stopReference();
    this.worker?.terminate();
    this.take = null;
    this.prepared?.release();
    void this.finish().catch(() => {});
  }

  async finish() {
    const mic = this.mic;
    this.mic = null;
    try {
      await mic?.stop();
    } finally {
      this.current?.removeAttribute('aria-current');
      this.querySelector('[data-level]').hidden = true;
      if (this.controller.signal.aborted) await this.engine?.dispose();
    }
  }

  async analyze(take, signal) {
    const output = this.querySelector('[data-analysis]');
    try {
      const samples = this.heard && await take.samples();
      if (signal.aborted) return;
      if (!samples) {
        output.textContent = 'Prise inutilisable. Récite le verset en moins de 30 secondes.';
        return;
      }
      const worker = new Worker('/js/vendor/muaalem-worker.js', { type: 'module' });
      this.worker = worker;
      output.textContent = 'Préparation de l’analyse locale…';
      worker.onmessage = ({ data }) => {
        if (signal.aborted || this.worker !== worker) return;
        output.textContent = data.status || data.result || data.error;
        for (const note of data.notes || []) {
          this.addNote(document.getElementById(`hz-word-${this.dataset.from}-${note.word}`), note.label, 'pronunciation');
        }
        if (!data.status) worker.terminate();
      };
      worker.onerror = () => {
        worker.terminate();
        output.textContent = 'Analyse indisponible sur cet appareil.';
      };
      worker.postMessage(samples, [samples.buffer]);
    } catch {
      output.textContent = 'Analyse indisponible sur cet appareil.';
    }
  }

  updatePosition(event) {
    const ref = event.observed?.[0]?.word;
    if (event.state === 'locked' && this.inPassage(ref)) {
      this.tracked = true;
      this.current?.removeAttribute('aria-current');
      this.current = document.getElementById(`hz-word-${ref.ayah}-${ref.word}`);
      this.current?.setAttribute('aria-current', 'true');
      if (this.current) {
        const scroll = this.current.closest('.practice-scroll');
        if (scroll && !scroll.hidden) {
          const word = this.current.getBoundingClientRect();
          const frame = scroll.getBoundingClientRect();
          if (word.bottom > frame.bottom || word.top < frame.top) scroll.scrollTop += word.top - frame.top - 12;
        }
        this.current.dataset.located = '';
        this.located.add(this.current);
        this.querySelector('progress').value = this.located.size;
        this.querySelector('[data-count]').textContent = `${this.located.size} / ${this.querySelector('progress').max}`;
      }
      this.querySelector('[data-progress]').textContent = `Verset ${ref.ayah} · mot ${ref.word} · ${this.current?.textContent || ''}`;
      this.status.textContent = 'Position repérée · vérification des mots en cours.';
    } else {
      this.current?.removeAttribute('aria-current');
      this.querySelector('[data-progress]').textContent = '';
      this.status.textContent = event.state === 'ambiguous'
        ? 'Plusieurs passages correspondent. Continue à réciter.'
        : 'Recherche de ta position… Continue à réciter.';
    }
  }

  inPassage(ref) {
    return ref?.surah === Number(this.dataset.surah) && ref.ayah >= Number(this.dataset.from) && ref.ayah <= Number(this.dataset.to);
  }

  addNote(target, text, kind) {
    if (!target) return;
    const note = document.createElement('span');
    note.className = 'practice-note';
    note.dataset.note = kind;
    note.lang = 'fr';
    note.dir = 'ltr';
    note.textContent = text;
    target.after(note);
  }

  updateIssues() {
    this.closest('main')?.querySelectorAll('[data-note="word"]').forEach(el => el.remove());
    this.closest('main')?.querySelectorAll('.hz-passage [data-review-word]').forEach(el => el.removeAttribute('data-review-word'));
    this.querySelector('ul').replaceChildren(...Array.from(this.issues.values(), event => {
      const { ayah, word } = event.location;
      const target = document.getElementById(`hz-word-${ayah}-${word}`);
      if (target && (event.state === 'confirmed' || target.dataset.reviewWord !== 'confirmed')) target.dataset.reviewWord = event.state;
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#/coran/${this.dataset.surah}/hifz/${ayah}`;
      const feedback = event.state === 'confirmed' ? labels[event.errorClass] : event.state === 'uncertain' ? 'Écoute incertaine' : 'À vérifier';
      this.addNote(target, feedback, 'word');
      link.textContent = `${feedback} · ${target?.textContent || `mot ${word}`} · verset ${ayah}`;
      li.append(link);
      return li;
    }));
  }

  async activate() {
    this.button.disabled = true;
    this.replay.disabled = true;
    const verseButtons = this.closest('main').querySelectorAll('[data-listen-verse]');
    verseButtons.forEach(button => { button.disabled = true; });
    const signal = this.controller.signal;
    let stage = 'arrêt de la récitation';
    try {
      if (this.mic) {
        await this.finish();
        // end() a maintenant vidé le décodeur. Une hypothèse restée ouverte
        // ne doit pas être présentée comme une faute dans le bilan.
        for (const [id, issue] of this.issues) {
          if (issue.state === 'suspected') this.issues.set(id, { ...issue, state: 'uncertain' });
        }
        this.updateIssues();
        this.session.dispose();
        this.querySelector('[data-progress]').textContent = '';
        const confirmed = [...this.issues.values()].filter(issue => issue.state === 'confirmed').length;
        const result = confirmed ? `${confirmed} écart${confirmed > 1 ? 's' : ''} à reprendre.` : 'Aucun écart de mots confirmé.';
        this.status.textContent = this.tracked || this.issues.size
          ? `${this.located.size} / ${this.querySelector('progress').max} mots repérés. ${result}`
          : this.heard ? 'Voix entendue. Passage trop incertain pour un bilan.' : 'Aucune voix détectée.';
        this.completed = true;
        if (this.take) await this.analyze(this.take, signal);
        this.take = null;
      } else {
        this.worker?.terminate();
        this.worker = null;
        this.closest('main').querySelectorAll('[data-note="pronunciation"]').forEach(el => el.remove());
        const analysis = this.querySelector('[data-analysis]');
        if (analysis) analysis.textContent = '';
        const option = this.querySelector('[data-pronunciation]');
        if (option) option.disabled = true;
        this.take = option?.checked ? new PronunciationTake() : null;
        this.stopReference();
        stage = 'ouverture du micro';
        this.prepared = prepareRecitationMicrophone();
        this.status.textContent = 'Ouverture du micro…';
        await this.prepared.stream;
        if (signal.aborted) return;
        if (!this.engine) {
          stage = 'préparation du modèle';
          this.status.textContent = 'Micro autorisé. Préparation du modèle…';
          const sdk = await import('/js/vendor/tilawa.js');
          if (signal.aborted) return;
          this.engine = await sdk.createTilawa({ tier: 'lite', signal });
          if (signal.aborted) { await this.engine.dispose(); return; }
        }
        stage = 'création de la session';
        this.session = this.engine.startMemorization({
          surah: Number(this.dataset.surah), fromAyah: Number(this.dataset.from), toAyah: Number(this.dataset.to),
        }, { confirm: { after: 'next-word' } });
        const words = this.closest('main').querySelectorAll('.hz-passage [id^="hz-word-"]');
        this.located = new Set();
        for (const word of words) delete word.dataset.located;
        this.querySelector('progress').max = words.length || 1;
        this.querySelector('progress').value = 0;
        this.querySelector('[data-count]').textContent = `0 / ${words.length}`;
        this.tracked = false;
        this.heard = false;
        this.current?.removeAttribute('aria-current');
        this.querySelector('[data-progress]').textContent = '';
        this.issues = new Map();
        this.updateIssues();
        this.session.subscribe(event => {
          if (signal.aborted) return;
          if (event.type === 'position') {
            if (event.observed?.length) this.heard = true;
            this.updatePosition(event);
          }
          if (event.type === 'checker' && this.inPassage(event.location)) {
            if (event.state === 'resolved') this.issues.delete(event.id);
            else this.issues.set(event.id, event);
            this.updateIssues();
          }
        });
        const meter = this.querySelector('meter');
        meter.value = -70;
        stage = 'connexion audio';
        this.mic = await listenToVerse(this.engine, this.session, this.prepared, signal, db => {
          meter.value = db;
          if (db > -48) this.heard = true;
        }, this.take);
        this.prepared = null;
        if (signal.aborted) { await this.finish(); return; }
        this.querySelector('[data-level]').hidden = false;
        this.status.textContent = 'Micro actif. Récite le passage.';
      }
    } catch (error) {
      this.prepared?.release();
      this.prepared = null;
      this.session?.dispose();
      this.querySelector('[data-level]').hidden = true;
      if (signal.aborted) return;
      console.warn('HelloArabic — récitation', error);
      this.status.textContent = error.reason === 'denied' || error.name === 'NotAllowedError'
        ? 'Autorise le micro dans ton navigateur pour réciter.'
        : `Échec · ${stage} (${error.cause?.name || error.name || 'audio'}). Appuie pour réessayer.`;
    } finally {
      this.toggleAttribute('data-recording', Boolean(this.mic));
      const label = this.mic ? 'Terminer ma récitation' : this.completed ? 'Réessayer' : 'Réciter au micro';
      this.button.innerHTML = `${icon(this.mic ? 'stop' : this.completed ? 'rotate-ccw' : 'mic')} <span>${label}</span>`;
      this.replay.disabled = Boolean(this.mic);
      verseButtons.forEach(button => { button.disabled = Boolean(this.mic); });
      if (this.completed && !this.mic && !signal.aborted) this.stopReference();
      this.button.disabled = false;
      const option = this.querySelector('[data-pronunciation]');
      if (option) option.disabled = Boolean(this.mic);
      if (!this.mic) this.take = null;
    }
  }
}
customElements.define('hifz-microphone', HifzMicrophone);
