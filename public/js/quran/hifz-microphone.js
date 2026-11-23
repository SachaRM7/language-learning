// L'élément possède le micro uniquement pendant sa présence dans l'exercice.
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
    this.innerHTML = `<button class="btn btn--primary btn--block">Réciter au micro</button>
      <p class="hz-help" role="status">Récite à voix haute pour suivre les mots du passage. Première utilisation · téléchargement de 25 Mo.</p>
      <progress aria-label="Mots repérés" value="0" max="1"></progress><p data-progress></p>
      <label hidden>Niveau du micro <meter min="-70" max="0" value="-70"></meter></label>
      <small>Tilawa repère les mots remplacés, ajoutés ou oubliés. La prononciation des lettres et le tajwid ne sont pas évalués.</small>
      <ul aria-live="polite" aria-label="Passages à revoir"></ul>`;
    this.button = this.querySelector('button');
    this.status = this.querySelector('[role=status]');
    this.button.onclick = () => this.activate();
    window.addEventListener('pagehide', () => this.close(), { signal: this.controller.signal });
  }

  disconnectedCallback() { this.close(); }

  close() {
    this.controller.abort();
    this.prepared?.release();
    void this.finish().catch(() => {});
  }

  async finish() {
    const mic = this.mic;
    this.mic = null;
    try {
      await mic?.stop();
    } finally {
      this.querySelector("label").hidden = true;
      if (this.controller.signal.aborted) await this.engine?.dispose();
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
        this.current.dataset.located = '';
        this.located.add(this.current);
        this.querySelector('progress').value = this.located.size;
      }
      this.querySelector('[data-progress]').textContent = `Verset ${ref.ayah} · mot ${ref.word} · ${this.current?.textContent || ''}`;
      this.status.textContent = 'Récitation suivie.';
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

  updateIssues() {
    this.closest('main')?.querySelectorAll('.hz-passage [data-review-word]').forEach(el => el.removeAttribute('data-review-word'));
    this.querySelector('ul').replaceChildren(...Array.from(this.issues.values(), event => {
      const { ayah, word } = event.location;
      const target = document.getElementById(`hz-word-${ayah}-${word}`);
      if (target && (event.state === 'confirmed' || target.dataset.reviewWord !== 'confirmed')) target.dataset.reviewWord = event.state;
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#/coran/${this.dataset.surah}/hifz/${ayah}`;
      const feedback = event.state === 'confirmed' ? labels[event.errorClass] : event.state === 'uncertain' ? 'Écoute incertaine' : 'À vérifier';
      link.textContent = `${feedback} · ${target?.textContent || `mot ${word}`} · verset ${ayah}`;
      li.append(link);
      return li;
    }));
  }

  async activate() {
    this.button.disabled = true;
    const signal = this.controller.signal;
    let stage = 'arrêt de la récitation';
    try {
      if (this.mic) {
        await this.finish();
        this.session.dispose();
        const confirmed = [...this.issues.values()].filter(issue => issue.state === 'confirmed').length;
        const result = confirmed ? `${confirmed} écart(s) à reprendre.` : 'Aucun écart de mots confirmé.';
        this.status.textContent = this.tracked || this.issues.size
          ? `${this.located.size} / ${this.querySelector('progress').max} mots repérés. ${result}`
          : this.heard ? 'Voix entendue. Passage trop incertain pour un bilan.' : 'Aucune voix détectée.';
      } else {
        stopAudio();
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
        });
        this.prepared = null;
        if (signal.aborted) { await this.finish(); return; }
        this.querySelector('label').hidden = false;
        this.status.textContent = 'Micro actif. Récite le passage.';
      }
    } catch (error) {
      this.prepared?.release();
      this.prepared = null;
      this.session?.dispose();
      this.querySelector("label").hidden = true;
      if (signal.aborted) return;
      console.warn('HelloArabic — récitation', error);
      this.status.textContent = error.reason === 'denied' || error.name === 'NotAllowedError'
        ? 'Autorise le micro dans ton navigateur pour réciter.'
        : `Échec · ${stage} (${error.cause?.name || error.name || 'audio'}). Appuie pour réessayer.`;
    } finally {
      this.button.textContent = this.mic ? 'Terminer ma récitation' : 'Réciter au micro';
      this.button.disabled = false;
    }
  }
}
customElements.define('hifz-microphone', HifzMicrophone);
