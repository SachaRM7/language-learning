// L'élément possède le micro uniquement pendant sa présence dans l'exercice.
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
    this.innerHTML = `<button class="btn btn--primary btn--block">Réciter au micro</button>
      <p class="hz-help" role="status">Récite à voix haute pour suivre les mots du passage. Première utilisation · téléchargement de 25 Mo.</p>
      <progress aria-label="Mots repérés" value="0" max="1"></progress><p data-progress></p>
      <label data-level hidden>Niveau du micro <meter min="-70" max="0" value="-70"></meter></label>
      <small>Tilawa repère les mots remplacés, ajoutés ou oubliés.${pilot ? '' : ' La prononciation des lettres et le tajwid ne sont pas évalués.'}</small>
      ${pilot ? `<label><input type="checkbox" data-pronunciation> Vérifier ma prononciation</label>
        <small>Essai sur la lettre ح et le madd final. Récite le verset en entier et marque l’arrêt final. Ton enregistrement reste sur cet appareil. Première analyse · téléchargement du modèle de 876 Mo.</small>
        <p data-analysis aria-live="polite"></p>` : ''}
      <ul aria-live="polite" aria-label="Passages à revoir"></ul>`;
    this.button = this.querySelector('button');
    this.status = this.querySelector('[role=status]');
    this.button.onclick = () => this.activate();
    window.addEventListener('pagehide', () => this.close(), { signal: this.controller.signal });
  }

  disconnectedCallback() { this.close(); }

  close() {
    this.controller.abort();
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
        output.textContent = data.status || data.result || data.error;
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
        this.current.dataset.located = '';
        this.located.add(this.current);
        this.querySelector('progress').value = this.located.size;
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
        if (this.take) await this.analyze(this.take, signal);
        this.take = null;
      } else {
        this.worker?.terminate();
        const analysis = this.querySelector('[data-analysis]');
        if (analysis) analysis.textContent = '';
        const option = this.querySelector('[data-pronunciation]');
        if (option) option.disabled = true;
        this.take = option?.checked ? new PronunciationTake() : null;
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
      this.button.textContent = this.mic ? 'Terminer ma récitation' : 'Réciter au micro';
      this.button.disabled = false;
      const option = this.querySelector('[data-pronunciation]');
      if (option) option.disabled = Boolean(this.mic);
      if (!this.mic) this.take = null;
    }
  }
}
customElements.define('hifz-microphone', HifzMicrophone);
