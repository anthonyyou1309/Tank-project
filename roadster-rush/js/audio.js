// Synthesized sound via WebAudio: cold-gas thruster hiss, suction-fan hum,
// electric drivetrain whine, pickups and crashes. No audio files needed.
export class Sfx {
  constructor() { this.ctx = null; this.muted = false; }

  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

      // Continuous layers: motor whine + fan hum + hover hiss.
      this.whine = this.ctx.createOscillator();
      this.whine.type = 'sawtooth';
      this.whineF = this.ctx.createBiquadFilter();
      this.whineF.type = 'lowpass'; this.whineF.frequency.value = 900;
      this.whineG = this.ctx.createGain(); this.whineG.gain.value = 0;
      this.whine.connect(this.whineF); this.whineF.connect(this.whineG); this.whineG.connect(this.master);
      this.whine.start();

      this.fan = this.ctx.createOscillator();
      this.fan.type = 'triangle'; this.fan.frequency.value = 95;
      this.fanG = this.ctx.createGain(); this.fanG.gain.value = 0;
      this.fan.connect(this.fanG); this.fanG.connect(this.master);
      this.fan.start();

      const hs = this.ctx.createBufferSource();
      hs.buffer = this.noise; hs.loop = true;
      const hf = this.ctx.createBiquadFilter();
      hf.type = 'bandpass'; hf.frequency.value = 2600; hf.Q.value = 0.7;
      this.hissG = this.ctx.createGain(); this.hissG.gain.value = 0;
      hs.connect(hf); hf.connect(this.hissG); this.hissG.connect(this.master);
      hs.start();
    } catch (e) { this.ctx = null; }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  // Per-frame continuous sound parameters.
  loop(speed, fans, hover, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.whine.frequency.setTargetAtTime(120 + speed * 9, t, 0.1);
    this.whineG.gain.setTargetAtTime(active ? 0.035 : 0, t, 0.15);
    this.fanG.gain.setTargetAtTime(active && fans ? 0.12 : 0, t, 0.08);
    this.fan.frequency.setTargetAtTime(fans ? 110 : 80, t, 0.2);
    this.hissG.gain.setTargetAtTime(active && hover ? 0.22 : 0, t, 0.04);
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

  _tone(dur, vol, f0, f1, type = 'sine', delay = 0) {
    if (!this.ctx || vol < 0.01) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  thrust(v = 1) { this._noise(0.45, 0.5 * v, 5200, 'bandpass', 900); this._noise(0.25, 0.25 * v, 300, 'lowpass', 80); }
  sidePuff() { this._noise(0.16, 0.22, 4200, 'highpass'); }
  kickflip() { this.thrust(1.1); this._tone(0.5, 0.06, 300, 900, 'triangle'); }
  fizz() { this._noise(0.25, 0.15, 1500, 'bandpass', 400); this._tone(0.15, 0.05, 180, 120, 'square'); }
  suctionLock() { this._tone(0.3, 0.12, 70, 140, 'sawtooth'); this._noise(0.2, 0.2, 800, 'lowpass', 200); }
  land(v = 1) { this._noise(0.18, 0.3 * v, 600, 'lowpass', 90); }
  cushion() { this._noise(0.3, 0.3, 4000, 'bandpass', 1200); }
  charge() { this._tone(0.12, 0.09, 1320, 1320, 'sine'); this._tone(0.12, 0.06, 1980, 1980, 'sine', 0.05); }
  refill() { this._tone(0.35, 0.1, 400, 1200, 'triangle'); this._noise(0.4, 0.15, 3000, 'highpass'); }
  overdrive() { this._tone(0.8, 0.12, 200, 1600, 'sawtooth'); this._noise(0.8, 0.4, 6000, 'bandpass', 500); }
  bump() { this._noise(0.2, 0.4, 900, 'lowpass', 120); this._tone(0.12, 0.1, 160, 70, 'square'); }
  smash() { this._noise(0.5, 0.5, 2000, 'lowpass', 100); }
  crash() {
    this._noise(1.4, 0.9, 1400, 'lowpass', 40);
    this._tone(0.8, 0.4, 110, 30, 'sine');
    this._noise(0.6, 0.4, 6000, 'highpass');
  }
  bonus() { this._tone(0.1, 0.07, 880, 880, 'square'); this._tone(0.14, 0.07, 1320, 1320, 'square', 0.08); }
}
