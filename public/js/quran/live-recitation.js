// Une séance de récitation sur le verset courant, indépendante de sa validation en hifz.
const labels = {
  wrong_word: 'Mot remplacé', omitted_word: 'Mot omis',
  added_word: 'Mot ajouté', skipped_passage: 'Passage sauté',
};

export function bindRecitation(surah, verse, goBack) {
  const action = document.getElementById('hz-rec-action');
  const status = document.getElementById('hz-rec-status');
  const list = document.getElementById('hz-rec-errors');
  const words = [...document.querySelectorAll('.hz-w')];
  const life = new AbortController();
  const { signal } = life;
  let engine, session, prepared, mic;
  let tracked = false;

  function onEvent(e) {
    if (signal.aborted) return;
    if (e.type === 'position') {
      const pos = e.state === 'locked' && e.observed[0]?.word;
      const index = pos && pos.surah === surah && pos.ayah === verse.n ? pos.word - 1 : -1;
      words.forEach((w, i) => w.classList.toggle('is-tracked', i === index));
      if (words[index]) {
        tracked = true;
        status.textContent = `Mot ${index + 1} sur ${words.length}.`;
      }
    }
    if (e.type === 'checker') {
      const row = [...list.children].find(item => item.dataset.issue === e.id);
      if (e.state !== 'confirmed') { row?.remove(); return; }
      const item = row || document.createElement('li');
      item.dataset.issue = e.id;
      item.textContent = `${labels[e.errorClass]} · mot ${e.location.word} ${verse.w[e.location.word - 1]?.t || ''}`;
      if (!row) list.append(item);
    }
  }

  async function leave() {
    if (signal.aborted) return;
    life.abort();
    prepared?.release();
    try { await mic?.stop(); } finally { await engine?.dispose(); }
  }
  const close = () => { void leave().catch(console.error); };
  window.addEventListener('hashchange', close, { signal });
  window.addEventListener('pagehide', close, { signal });
  document.getElementById('hz-close').addEventListener('click', close, { signal });
  document.getElementById('hz-rec-return').onclick = () => { close(); goBack(); };

  function failed(message) {
    status.textContent = message;
    action.disabled = true;
    close();
  }

  async function finish() {
    action.disabled = true;
    status.textContent = 'Fin de la récitation…';
    try {
      await mic.stop();
      if (signal.aborted) return;
      status.textContent = list.children.length ? 'Mots à revoir dans ce verset.' :
        tracked ? 'Aucune erreur de mémorisation signalée.' : 'Le suivi n’a pas reconnu le verset.';
      session.dispose();
      mic = session = null;
      action.textContent = 'Réciter à nouveau';
      action.onclick = start;
      action.disabled = false;
    } catch { if (!signal.aborted) failed('La séance a été interrompue. Reviens à l’exercice pour réessayer.'); }
  }

  let sdk;
  async function start() {
    action.disabled = true;
    status.textContent = 'Autorise le micro pour commencer.';
    list.replaceChildren();
    tracked = false;
    words.forEach(w => w.classList.remove('is-tracked'));
    try {
      prepared = sdk.prepareMicrophone();
      session = engine.startMemorization({ surah, fromAyah: verse.n, toAyah: verse.n });
      session.subscribe(onEvent);
      const capture = await engine.listen(session, { prepared, onError() {
        if (!signal.aborted) failed('L’analyse a été interrompue. Reviens à l’exercice pour réessayer.');
      } });
      prepared = null;
      if (signal.aborted) { await capture.stop(); return; }
      mic = capture;
      status.textContent = 'À toi de réciter.';
      action.textContent = 'Terminer la récitation';
      action.onclick = finish;
      action.disabled = false;
    } catch (err) {
      if (!signal.aborted) failed(err.reason === 'denied' ? 'Micro refusé. Autorise-le dans les réglages du navigateur, puis réessaie.' : 'Micro indisponible. Vérifie le micro et les autorisations du navigateur.');
    }
  }

  async function load() {
    try {
      sdk = await import('/js/vendor/tilawa.js');
      if (signal.aborted) return;
      const loaded = await sdk.createTilawa({ tier: 'lite', signal, onProgress(p) {
        if (!signal.aborted && p.stage === 'model') status.textContent = `Préparation du modèle · ${Math.round(p.fraction * 100)} %`;
      } });
      if (signal.aborted) { await loaded.dispose(); return; }
      engine = loaded;
      status.textContent = 'Le suivi est prêt.';
      action.disabled = false;
      action.onclick = start;
    } catch {
      if (!signal.aborted) failed('Impossible de préparer le suivi. Vérifie ta connexion au premier usage, puis réessaie.');
    }
  }
  void load();
}
