// L'élément possède le micro uniquement pendant sa présence dans l'exercice.
import { stopAudio } from '../components/quran-audio.js';

import { listenToVerse } from './hifz-capture.js';

const labels = {
  wrong_word: 'Mot à reprendre',
  omitted_word: 'Mot manquant',
  added_word: 'Mot en trop',
  skipped_passage: 'Passage sauté',
};

class HifzMicrophone extends HTMLElement {
  connectedCallback() {
    this.controller = new AbortController();
    this.innerHTML = `<button class="btn btn--secondary btn--block">Préparer la récitation au micro</button>
      <p class="hz-help" role="status">Tilawa télécharge son modèle léger (environ 25 Mo) à la première utilisation. Ta voix reste sur cet appareil.</p>
      <ul aria-label="Passages à revoir"></ul>`;
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
      this.togglePlayback(true);
      if (this.controller.signal.aborted) await this.engine?.dispose();
    }
  }

  togglePlayback(enabled) {
    const replay = this.closest('.hz')?.querySelector('#hz-back');
    if (replay) replay.disabled = !enabled;
  }

  async activate() {
    this.button.disabled = true;
    const signal = this.controller.signal;
    try {
      if (!this.engine) {
        this.status.textContent = 'Préparation du modèle de récitation…';
        this.sdk = await import('/js/vendor/tilawa.js');
        if (signal.aborted) return;
        this.engine = await this.sdk.createTilawa({ tier: 'lite', signal });
        if (signal.aborted) { await this.engine.dispose(); return; }
        this.status.textContent = 'Prêt. Appuie pour activer le micro.';
      } else if (this.mic) {
        await this.finish();
        this.session.dispose();
        this.status.textContent = this.tracked ? 'Récitation terminée.' : 'Aucun mot reconnu. Tu peux réessayer.';
      } else {
        stopAudio();
        this.prepared = this.sdk.prepareMicrophone();
        this.togglePlayback(false);
        const ayah = Number(this.dataset.ayah);
        this.session = this.engine.startMemorization({ surah: Number(this.dataset.surah), fromAyah: ayah, toAyah: ayah });
        this.tracked = false;
        this.querySelector('ul').replaceChildren();
        const issues = new Map();
        this.session.subscribe(event => {
          if (signal.aborted) return;
          const ref = event.observed?.[0]?.word;
          if (event.type === 'position' && event.state === 'locked' && ref?.ayah === ayah) {
            this.tracked = true;
            this.status.textContent = `Mot suivi : ${ref.word}.`;
          }
          if (event.type === 'checker') {
            if (event.state === 'confirmed') issues.set(event.id, `${labels[event.errorClass]} · mot ${event.location.word}`);
            else issues.delete(event.id);
            this.querySelector('ul').replaceChildren(...Array.from(issues.values(), message => {
              const li = document.createElement('li');
              li.textContent = message;
              return li;
            }));
          }
        });
        this.mic = await listenToVerse(this.engine, this.session, this.prepared, signal);
        this.prepared = null;
        if (signal.aborted) { await this.finish(); return; }
        this.status.textContent = 'Micro actif. Récite le verset.';
      }
    } catch (error) {
      this.prepared?.release();
      this.prepared = null;
      this.session?.dispose();
      this.togglePlayback(true);
      if (signal.aborted) return;
      console.warn('HelloArabic — récitation', error);
      this.status.textContent = error.reason === 'denied' || error.name === 'NotAllowedError'
        ? 'Autorise le micro dans ton navigateur pour réciter.'
        : this.engine
          ? `Échec de la récitation (${error.cause?.name || error.name || 'audio'}). Appuie pour réessayer.`
          : 'Le modèle de récitation n’a pas pu être chargé. Appuie pour réessayer.';
    } finally {
      this.button.textContent = this.mic ? 'Terminer ma récitation' : this.engine ? 'Réciter au micro' : 'Préparer la récitation au micro';
      this.button.disabled = false;
    }
  }
}
customElements.define('hifz-microphone', HifzMicrophone);
