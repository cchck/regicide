// Lightweight audio manager for Regicide.
// - SFX are synthesized on the fly with WebAudio: zero assets, works offline.
// - BGM streams from /public/audio/{track}.mp3 — drop AI-generated files in with
//   the agreed names; a missing file just means silence, never an error.
// - Browsers block sound until the first user gesture; we queue and unlock.

export type SfxName =
  | 'click'
  | 'cardPlay'
  | 'cardSlam'
  | 'chip'
  | 'fold'
  | 'winRound'
  | 'loseRound'
  | 'regicide'
  | 'drillAdvance'
  | 'drillKill'
  | 'thud'
  | 'tinnitus';

export type MusicTrack = 'lobby' | 'table';

const MUSIC_KEY = 'regicide-vol-music';
const SFX_KEY = 'regicide-vol-sfx';

class AudioManager {
  private ctx: AudioContext | null = null;
  private sfxGain: GainNode | null = null;
  private music: HTMLAudioElement | null = null;
  private currentTrack: MusicTrack | null = null;
  private pendingTrack: MusicTrack | null = null;
  private unlocked = false;
  private musicVolume = 0.5;
  private sfxVolume = 0.7;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  // Per-element fade timers — a single shared timer would let a fade-in cancel a
  // still-running fade-out on a different element, leaving the old track playing.
  private fadeTimers = new WeakMap<HTMLAudioElement, ReturnType<typeof setInterval>>();

  constructor() {
    if (typeof window === 'undefined') return;
    const mv = parseFloat(localStorage.getItem(MUSIC_KEY) ?? '');
    const sv = parseFloat(localStorage.getItem(SFX_KEY) ?? '');
    if (!Number.isNaN(mv)) this.musicVolume = mv;
    if (!Number.isNaN(sv)) this.sfxVolume = sv;

    const unlock = () => {
      this.unlocked = true;
      this.ensureCtx();
      if (this.pendingTrack) {
        const t = this.pendingTrack;
        this.pendingTrack = null;
        this.playMusic(t);
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  private ensureCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  // ————— volumes —————

  getMusicVolume() { return this.musicVolume; }
  getSfxVolume() { return this.sfxVolume; }

  setMusicVolume(v: number) {
    this.musicVolume = Math.min(1, Math.max(0, v));
    if (typeof window !== 'undefined') localStorage.setItem(MUSIC_KEY, String(this.musicVolume));
    if (this.music) this.music.volume = this.musicVolume;
  }

  setSfxVolume(v: number) {
    this.sfxVolume = Math.min(1, Math.max(0, v));
    if (typeof window !== 'undefined') localStorage.setItem(SFX_KEY, String(this.sfxVolume));
    if (this.sfxGain) this.sfxGain.gain.value = this.sfxVolume;
  }

  // ————— music —————

  playMusic(track: MusicTrack) {
    if (typeof window === 'undefined') return;
    if (!this.unlocked) {
      this.pendingTrack = track;
      return;
    }
    if (this.currentTrack === track && this.music && !this.music.paused) return;
    this.currentTrack = track;

    const old = this.music;
    this.music = null;
    if (old) this.fadeElement(old, 0, 700, () => old.pause());

    const el = new Audio(`/audio/${track}.mp3`);
    el.loop = true;
    el.volume = 0;
    el.play()
      .then(() => {
        this.music = el;
        this.fadeElement(el, this.musicVolume, 900);
      })
      .catch(() => {
        // File not there yet (or autoplay refused) — silence is acceptable.
      });
  }

  stopMusic() {
    this.currentTrack = null;
    this.pendingTrack = null;
    const old = this.music;
    this.music = null;
    if (old) this.fadeElement(old, 0, 500, () => old.pause());
  }

  private fadeElement(el: HTMLAudioElement, target: number, ms: number, done?: () => void) {
    // Cancel any fade already running on THIS element (not on some other track).
    const existing = this.fadeTimers.get(el);
    if (existing) clearInterval(existing);
    const start = el.volume;
    const t0 = performance.now();
    const timer = setInterval(() => {
      const p = Math.min((performance.now() - t0) / ms, 1);
      el.volume = Math.min(1, Math.max(0, start + (target - start) * p));
      if (p >= 1) {
        clearInterval(timer);
        this.fadeTimers.delete(el);
        done?.();
      }
    }, 40);
    this.fadeTimers.set(el, timer);
  }

  // ————— procedural SFX —————

  private tone(freq: number, type: OscillatorType, delay: number, dur: number, peak: number, glideTo?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(glideTo, 1), t0 + dur);
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  private noise(delay: number, dur: number, peak: number, freq: number, q: number, sweepTo?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain) return;
    const len = Math.max(1, Math.ceil(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = q;
    const t0 = ctx.currentTime + delay;
    filter.frequency.setValueAtTime(freq, t0);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(Math.max(sweepTo, 1), t0 + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(peak, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  sfx(name: SfxName) {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    switch (name) {
      case 'click': // a heavy metal latch: low thunk + faint metallic ring
        this.tone(180, 'triangle', 0, 0.09, 0.22, 120);
        this.tone(950, 'sine', 0, 0.06, 0.045);
        this.noise(0, 0.05, 0.09, 700, 1.5, 250);
        break;
      case 'cardPlay': // a card sliding across felt
        this.noise(0, 0.18, 0.18, 2200, 1.2, 500);
        break;
      case 'cardSlam': // the showdown slam
        this.noise(0, 0.08, 0.32, 900, 0.8);
        this.tone(75, 'sine', 0, 0.28, 0.5, 45);
        break;
      case 'chip': // coin clinks
        for (let i = 0; i < 3; i++) {
          this.tone(2400 + Math.random() * 700, 'triangle', i * 0.05, 0.09, 0.13);
        }
        break;
      case 'fold': // deflating two-step
        this.tone(300, 'triangle', 0, 0.18, 0.16, 210);
        this.tone(210, 'triangle', 0.14, 0.25, 0.13, 150);
        break;
      case 'winRound': // small gold arpeggio
        [523, 659, 784].forEach((f, i) => this.tone(f, 'sine', i * 0.09, 0.35, 0.15));
        break;
      case 'loseRound': // descending minor
        [392, 311, 233].forEach((f, i) => this.tone(f, 'triangle', i * 0.11, 0.3, 0.13));
        break;
      case 'regicide': // the kill: boom + dissonant scream
        this.noise(0, 0.5, 0.38, 600, 0.7, 120);
        this.tone(55, 'sine', 0, 0.9, 0.5, 38);
        this.tone(466, 'sawtooth', 0.05, 0.5, 0.1, 440);
        this.tone(494, 'sawtooth', 0.05, 0.5, 0.1, 466);
        break;
      case 'drillAdvance': // the ratchet lets go one notch: clack, then a grinding screw
        this.tone(140, 'square', 0, 0.06, 0.2, 90);
        this.noise(0.03, 0.9, 0.16, 320, 0.9, 140);
        this.tone(58, 'sawtooth', 0.03, 0.9, 0.16, 44);
        break;
      case 'drillKill': // the governor comes off: a motor screaming past its rating
        this.tone(90, 'sawtooth', 0, 1.1, 0.3, 540);
        this.tone(45, 'square', 0, 1.1, 0.2, 170);
        this.noise(0, 1.1, 0.2, 420, 1.2, 2600);
        break;
      case 'thud': // after the cut — felt in the chest more than heard
        this.tone(46, 'sine', 0, 0.5, 0.6, 28);
        this.noise(0, 0.1, 0.25, 160, 0.8);
        break;
      case 'tinnitus': // the ear's last report: a lone high whine, slowly dying
        this.tone(3400, 'sine', 0.05, 3.2, 0.05);
        break;
    }
  }

  // ————— the ear drill's motor —————
  // A continuous rig rather than one-shots: the machine is alive from the first deal
  // and only gets angrier, so the sound has to be a level you turn up, not an event.

  private rumble: {
    src: AudioBufferSourceNode;
    gain: GainNode;
    lp: BiquadFilterNode;
    motor: OscillatorNode;
    motorGain: GainNode;
  } | null = null;

  /** level 0..1 — 0 stops the motor entirely. */
  setDrillRumble(level: number) {
    const ctx = this.ensureCtx();
    if (!ctx || !this.sfxGain) return;
    const l = Math.min(1, Math.max(0, level));
    if (l <= 0) {
      this.stopDrillRumble();
      return;
    }
    if (!this.rumble) {
      // Brown noise, not white: a machine straining under load is all low end, and
      // white noise would just read as tape hiss next to your ear.
      const len = Math.ceil(ctx.sampleRate * 2);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 180;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(lp);
      lp.connect(gain);
      gain.connect(this.sfxGain);
      src.start();

      // The motor whine sitting under the rumble.
      const motor = ctx.createOscillator();
      motor.type = 'sawtooth';
      motor.frequency.value = 38;
      const motorLp = ctx.createBiquadFilter();
      motorLp.type = 'lowpass';
      motorLp.frequency.value = 400;
      const motorGain = ctx.createGain();
      motorGain.gain.value = 0;
      motor.connect(motorLp);
      motorLp.connect(motorGain);
      motorGain.connect(this.sfxGain);
      motor.start();

      this.rumble = { src, gain, lp, motor, motorGain };
    }
    const r = this.rumble;
    const t = ctx.currentTime;
    // Louder, brighter and higher-pitched together — that combination is what the ear
    // hears as "working harder" rather than just "turned up".
    r.gain.gain.linearRampToValueAtTime(0.04 + l * 0.2, t + 0.5);
    r.lp.frequency.linearRampToValueAtTime(170 + l * 340, t + 0.5);
    r.motorGain.gain.linearRampToValueAtTime(0.01 + l * 0.05, t + 0.5);
    r.motor.frequency.linearRampToValueAtTime(36 + l * 26, t + 0.5);
  }

  stopDrillRumble() {
    const ctx = this.ctx;
    if (!this.rumble || !ctx) return;
    const { src, gain, motor, motorGain } = this.rumble;
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    motorGain.gain.cancelScheduledValues(t);
    gain.gain.linearRampToValueAtTime(0, t + 0.3);
    motorGain.gain.linearRampToValueAtTime(0, t + 0.3);
    src.stop(t + 0.35);
    motor.stop(t + 0.35);
    this.rumble = null;
  }

  // ————— match-point heartbeat loop —————

  startHeartbeat() {
    if (this.heartbeatTimer) return;
    const thump = () => {
      if (!this.ensureCtx()) return;
      this.tone(52, 'sine', 0, 0.14, 0.35, 40);
      this.tone(48, 'sine', 0.18, 0.16, 0.28, 36);
    };
    thump();
    this.heartbeatTimer = setInterval(thump, 1100);
  }

  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

export const audio = new AudioManager();
