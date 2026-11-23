// Une seule prise en mémoire. Le trajet de secours du micro peut fournir du PCM
// à la fréquence native du téléphone, le worklet de Tilawa fournit déjà 16 kHz.
export class PronunciationTake {
  chunks = [];
  length = 0;

  append(samples, rate) {
    this.rate = rate;
    this.length += samples.length;
    if (this.length > 30 * rate) {
      this.chunks.length = 0;
      return;
    }
    this.chunks.push(samples.slice());
  }

  async samples() {
    if (!this.chunks.length || this.length < this.rate / 2) return null;
    const pcm = new Float32Array(this.length);
    let offset = 0;
    for (const chunk of this.chunks) {
      pcm.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks.length = 0;
    if (this.rate === 16000) return pcm;
    const context = new OfflineAudioContext(1, Math.ceil(this.length * 16000 / this.rate), 16000);
    const buffer = context.createBuffer(1, pcm.length, this.rate);
    buffer.copyToChannel(pcm, 0);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(context.destination);
    source.start();
    return (await context.startRendering()).getChannelData(0);
  }
}
