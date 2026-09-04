import { playables } from './YouTubePlayablesAdapter';

export type SfxId =
  | 'gunfire'
  | 'heavygun'
  | 'zombiehit'
  | 'explosion'
  | 'promotion'
  | 'legendary'
  | 'bossspawn'
  | 'gameover'
  | 'ui'
  | 'reinforce';

/**
 * Fully procedural audio (Web Audio API) - zero audio assets in the bundle.
 *
 * Two hard rules from the Playables certification:
 *  1. `ytgame.system.isAudioEnabled() === false` means *nothing* may be
 *     audible; we hard-mute the master gain and react to changes instantly.
 *  2. Hundreds of shots per second must not become hundreds of audio voices.
 *     Gunfire is therefore aggregated: combat reports an *intensity* and this
 *     system emits at most `MAX_GUNFIRE_PER_SECOND` squad-level pops.
 */
export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  private hostAudioEnabled = true;
  private musicEnabled = true;
  private sfxEnabled = true;
  private paused = false;
  private started = false;

  private activeVoices = 0;
  private readonly maxVoices = 26;

  private gunfireIntensity = 0;
  private gunfireTierPower = 1;
  private gunfireAccumulator = 0;
  private musicTimer = 0;
  private musicStep = 0;
  private musicRunning = false;

  private static readonly MAX_GUNFIRE_PER_SECOND = 14;

  init(): void {
    this.hostAudioEnabled = playables.isAudioEnabled();
    playables.onAudioEnabledChange((enabled) => {
      this.hostAudioEnabled = enabled;
      this.applyMasterGain();
      if (!enabled) this.stopAllImmediate();
    });
  }

  /** Must be called from a real user gesture (tap / click / key). */
  unlock(): void {
    if (this.started) {
      void this.ctx?.resume().catch(() => {});
      return;
    }
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;

      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();

      this.musicGain.gain.value = 0.22;
      this.sfxGain.gain.value = 0.6;
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.master.connect(this.ctx.destination);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
      this.started = true;
      this.applyMasterGain();
      void this.ctx.resume().catch(() => {});
    } catch (err) {
      playables.logWarning(err);
      this.started = false;
    }
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  setMusicEnabled(enabled: boolean): void {
    this.musicEnabled = enabled;
    this.applyMasterGain();
  }

  setSfxEnabled(enabled: boolean): void {
    this.sfxEnabled = enabled;
    this.applyMasterGain();
  }

  get isAudible(): boolean {
    return this.started && this.hostAudioEnabled && !this.paused;
  }

  private applyMasterGain(): void {
    if (!this.master || !this.ctx || !this.musicGain || !this.sfxGain) return;
    const target = this.hostAudioEnabled && !this.paused ? 1 : 0;
    this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
    this.musicGain.gain.setTargetAtTime(
      this.musicEnabled ? 0.22 : 0,
      this.ctx.currentTime,
      0.05,
    );
    this.sfxGain.gain.setTargetAtTime(this.sfxEnabled ? 0.6 : 0, this.ctx.currentTime, 0.05);
  }

  pause(): void {
    this.paused = true;
    this.applyMasterGain();
    void this.ctx?.suspend().catch(() => {});
  }

  resume(): void {
    this.paused = false;
    void this.ctx?.resume().catch(() => {});
    this.applyMasterGain();
  }

  private stopAllImmediate(): void {
    this.gunfireAccumulator = 0;
  }

  startMusic(): void {
    this.musicRunning = true;
    this.musicStep = 0;
    this.musicTimer = 0;
  }

  stopMusic(): void {
    this.musicRunning = false;
  }

  /**
   * Combat calls this once per frame with the squad's *aggregate* rate of
   * fire. The audio system converts it into a capped stream of pops.
   */
  setGunfireIntensity(shotsPerSecond: number, tierPower: number): void {
    this.gunfireIntensity = shotsPerSecond;
    this.gunfireTierPower = tierPower;
  }

  update(dt: number): void {
    if (!this.isAudible) return;

    if (this.gunfireIntensity > 0) {
      const rate = Math.min(
        AudioSystem.MAX_GUNFIRE_PER_SECOND,
        2 + Math.sqrt(this.gunfireIntensity) * 1.5,
      );
      this.gunfireAccumulator += dt * rate;
      let emitted = 0;
      while (this.gunfireAccumulator >= 1 && emitted < 3) {
        this.gunfireAccumulator -= 1;
        emitted++;
        this.play(this.gunfireTierPower >= 8 ? 'heavygun' : 'gunfire');
      }
      if (this.gunfireAccumulator > 3) this.gunfireAccumulator = 3;
    } else {
      this.gunfireAccumulator = 0;
    }

    if (this.musicRunning && this.musicEnabled) {
      this.musicTimer -= dt;
      if (this.musicTimer <= 0) {
        this.musicTimer = 0.5;
        this.playMusicStep();
      }
    }
  }

  /** Sparse, procedural bass pulse - atmosphere without an audio asset. */
  private playMusicStep(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain) return;
    const pattern = [55, 0, 73.42, 0, 55, 0, 61.74, 0];
    const freq = pattern[this.musicStep % pattern.length];
    this.musicStep++;
    if (freq <= 0) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 320;
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.5, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    osc.connect(filter).connect(gain).connect(this.musicGain);
    osc.start(now);
    osc.stop(now + 0.5);
  }

  /** Fire-and-forget one-shot. Silently drops when the voice cap is hit. */
  play(id: SfxId, volume = 1): void {
    if (!this.isAudible || !this.sfxEnabled) return;
    const ctx = this.ctx;
    const out = this.sfxGain;
    if (!ctx || !out) return;
    if (this.activeVoices >= this.maxVoices) return;

    try {
      switch (id) {
        case 'gunfire':
          this.noise(ctx, out, 0.055, 1600, 0.32 * volume, 'bandpass');
          break;
        case 'heavygun':
          this.noise(ctx, out, 0.1, 700, 0.45 * volume, 'lowpass');
          break;
        case 'zombiehit':
          this.noise(ctx, out, 0.04, 2600, 0.16 * volume, 'highpass');
          break;
        case 'explosion':
          this.explosion(ctx, out, volume);
          break;
        case 'promotion':
          this.chord(ctx, out, [392, 494, 587], 0.5, 0.32 * volume);
          break;
        case 'legendary':
          this.chord(ctx, out, [523, 659, 784, 1047], 0.75, 0.3 * volume, 0.07);
          break;
        case 'bossspawn':
          this.tone(ctx, out, 70, 42, 1.1, 0.45 * volume, 'sawtooth');
          break;
        case 'gameover':
          this.tone(ctx, out, 330, 82, 1.3, 0.35 * volume, 'triangle');
          break;
        case 'reinforce':
          this.tone(ctx, out, 620, 880, 0.16, 0.22 * volume, 'square');
          break;
        case 'ui':
          this.tone(ctx, out, 520, 700, 0.09, 0.2 * volume, 'square');
          break;
      }
    } catch {
      /* audio failures must never affect gameplay */
    }
  }

  private trackVoice(node: AudioScheduledSourceNode): void {
    this.activeVoices++;
    node.onended = () => {
      this.activeVoices = Math.max(0, this.activeVoices - 1);
    };
  }

  private noise(
    ctx: AudioContext,
    out: GainNode,
    duration: number,
    freq: number,
    gainValue: number,
    filterType: BiquadFilterType,
  ): void {
    if (!this.noiseBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = filterType === 'bandpass' ? 1.2 : 0.7;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(filter).connect(gain).connect(out);
    src.start(now);
    src.stop(now + duration);
    this.trackVoice(src);
  }

  private explosion(ctx: AudioContext, out: GainNode, volume: number): void {
    if (!this.noiseBuffer) return;
    const now = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.4);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.55 * volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
    src.connect(filter).connect(gain).connect(out);
    src.start(now);
    src.stop(now + 0.45);
    this.trackVoice(src);
  }

  private tone(
    ctx: AudioContext,
    out: GainNode,
    fromFreq: number,
    toFreq: number,
    duration: number,
    gainValue: number,
    type: OscillatorType,
  ): void {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fromFreq, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), now + duration);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain).connect(out);
    osc.start(now);
    osc.stop(now + duration);
    this.trackVoice(osc);
  }

  private chord(
    ctx: AudioContext,
    out: GainNode,
    freqs: number[],
    duration: number,
    gainValue: number,
    stagger = 0,
  ): void {
    freqs.forEach((freq, index) => {
      const now = ctx.currentTime + index * stagger;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.connect(gain).connect(out);
      osc.start(now);
      osc.stop(now + duration + 0.02);
      this.trackVoice(osc);
    });
  }
}

export const audio = new AudioSystem();
