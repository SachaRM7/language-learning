// Démarrer la capture dans le geste utilisateur, avant l’import du moteur.
export function prepareRecitationMicrophone() {
  const context = new AudioContext();
  context.resume().catch(() => {});
  let stream;
  try {
    stream = navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
  } catch (error) {
    void context.close().catch(() => {});
    throw error;
  }
  let released = false;
  return {
    context, stream,
    release() {
      if (released) return;
      released = true;
      stream.then(media => media.getTracks().forEach(track => track.stop()), () => {});
      void context.close().catch(() => {});
    },
  };
}

// Tilawa utilise un AudioWorklet. Si le navigateur ouvre le micro mais refuse
// ce graphe audio, on envoie les échantillons du même micro à la même session.
export async function listenToVerse(engine, session, prepared, signal, onLevel) {
  const stream = await prepared.stream;
  signal.throwIfAborted();
  const context = prepared.context;

  try {
    // L'appelant reste propriétaire du micro en cas d'échec du worklet.
    return await engine.listen(session, { onLevel, prepared: { ...prepared, release() {} } });
  } catch (error) {
    signal.throwIfAborted();
    if (!stream.active || session.state !== 'active' || !context.createScriptProcessor) throw error;
  }

  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(4096, 1, 1);
  let pending = Promise.resolve();
  let failure;
  processor.onaudioprocess = event => {
    if (failure || signal.aborted) return;
    const samples = event.inputBuffer.getChannelData(0).slice();
    let energy = 0;
    for (const sample of samples) energy += sample * sample;
    onLevel(10 * Math.log10(energy / samples.length + 1e-12));
    pending = session.pushAudio(samples, context.sampleRate).catch(error => { failure = error; });
  };
  source.connect(processor);
  // Le tampon de sortie reste silencieux.
  processor.connect(context.destination);
  return {
    async stop() {
      processor.onaudioprocess = null;
      source.disconnect();
      processor.disconnect();
      prepared.release();
      await pending;
      if (failure) throw failure;
      if (session.state === 'active') await session.end();
    },
  };
}
