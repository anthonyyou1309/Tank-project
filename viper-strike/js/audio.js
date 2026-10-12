// Synthesized sound effects via WebAudio, including a looping rotor "chop".
export class Sfx {
  constructor() { this.ctx = null; this.rotor = null; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.45;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  }

  _noise(dur, vol, f0, type = 'lowpass', f1) {
    if (!this.ctx || vol < 0.01) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t, Math.random()); src.stop(t + dur);
  }

  _tone(dur, vol, f0, f1, type = 'square') {
    if (!this.ctx || vol < 0.01) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur);
  }

  gun() { this._noise(0.07, 0.22, 3500, 'bandpass', 900); this._tone(0.05, 0.08, 220, 90, 'square'); }
  flak(v = 1) { this._noise(0.4, 0.5 * v, 1800, 'lowpass', 150); this._tone(0.25, 0.3 * v, 120, 40, 'triangle'); }
  hit(v = 1) { this._noise(0.12, 0.3 * v, 4000, 'bandpass', 1500); }
  explosion(v = 1, big = false) {
    this._noise(big ? 1.6 : 0.8, (big ? 0.95 : 0.6) * v, 1100, 'lowpass', 50);
    this._tone(big ? 0.9 : 0.5, 0.4 * v, 95, 28, 'sine');
  }
  missile(v = 1) { this._noise(1.0, 0.35 * v, 4500, 'bandpass', 600); }
  flare() { this._noise(0.5, 0.3, 6000, 'highpass'); this._tone(0.12, 0.08, 900, 400, 'sawtooth'); }
  beep(freq = 880, dur = 0.06, vol = 0.12) { this._tone(dur, vol, freq, freq, 'square'); }

  startRotor() {
    if (!this.ctx || this.rotor) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise; src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 380;
    const amp = ctx.createGain();
    amp.gain.value = 0.16;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 11;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.13;
    lfo.connect(lfoGain); lfoGain.connect(amp.gain);
    const out = ctx.createGain();
    out.gain.value = 0.8;
    src.connect(lp); lp.connect(amp); amp.connect(out); out.connect(this.master);
    src.start(); lfo.start();
    this.rotor = { src, lfo, out, lp };
  }

  setRotor(level) {
    if (!this.rotor) return;
    const t = this.ctx.currentTime;
    this.rotor.out.gain.setTargetAtTime(0.8 * level, t, 0.1);
    this.rotor.lfo.frequency.setTargetAtTime(6 + 6 * level, t, 0.2);
  }

  stopRotor() {
    if (!this.rotor) return;
    try { this.rotor.src.stop(); this.rotor.lfo.stop(); } catch (e) { /* already stopped */ }
    this.rotor.out.disconnect();
    this.rotor = null;
  }
}
