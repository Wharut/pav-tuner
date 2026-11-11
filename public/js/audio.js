// Microphone input and the small set of synthesised sounds.

export class Mic {
  ctx = null;
  analyser = null;
  stream = null;
  buffer = new Float32Array(8192);

  get ready() {
    return !!this.analyser && this.ctx.state === 'running';
  }
  get sampleRate() {
    return this.ctx.sampleRate;
  }

  /** Must be called from a user gesture (browsers require it for audio). */
  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw Object.assign(new Error('unsupported'), { name: 'NotSupportedError' });
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx ??= new Ctx({ latencyHint: 'interactive' });
    const resume = this.ctx.resume();
    // Processing meant for speech wrecks pitch accuracy, so switch it all off.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
    });
    await resume;
    const source = this.ctx.createMediaStreamSource(this.stream);
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = this.buffer.length;
    this.analyser.smoothingTimeConstant = 0;
    source.connect(this.analyser);
  }

  read() {
    this.analyser.getFloatTimeDomainData(this.buffer);
    return this.buffer;
  }

  resume() {
    if (this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  }
}

function voice(ctx, { freq, type = 'sine', at = 0, attack = 0.005, decay = 0.5, gain = 0.2 }) {
  const t = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + attack);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + attack + decay + 0.05);
}

/** Each returns how long (ms) the tuner should stop listening so it does not hear itself. */
export const sounds = {
  reference(ctx, freq) {
    // Extra harmonics keep low notes audible on small phone speakers.
    voice(ctx, { freq, type: 'triangle', decay: 1.6, gain: 0.3 });
    voice(ctx, { freq: freq * 2, decay: 1.2, gain: 0.12 });
    voice(ctx, { freq: freq * 3, decay: 0.7, gain: 0.05 });
    return 1800;
  },
  chime(ctx) {
    voice(ctx, { freq: 1318.5, decay: 0.25, gain: 0.12 });
    voice(ctx, { freq: 1975.5, at: 0.09, decay: 0.4, gain: 0.1 });
    return 600;
  },
  fanfare(ctx) {
    [523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((freq, i) =>
      voice(ctx, { freq, type: 'triangle', at: i * 0.11, decay: i === 4 ? 0.9 : 0.3, gain: 0.16 }));
    return 1700;
  },
};
