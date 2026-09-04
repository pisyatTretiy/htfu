export type SoundName = 'cast' | 'splash' | 'bite' | 'reel' | 'snap' | 'coin' | 'bounce';

/**
 * Звук. Требование площадки: при потере фокуса вкладкой звук останавливается —
 * это отдельный пункт критериев модерации и частая причина отказа
 * (docs/02, § 2.1).
 *
 * Звуки синтезируются: в репозитории нет ни одного аудиофайла, поэтому билд
 * не растёт и работа не ждёт саунд-дизайнера. Настоящие сэмплы придут в фазе 3
 * и заменят синтез, не трогая вызовы.
 */
export class AudioService {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private muted = false;
  private enabled = true;

  constructor() {
    const suspend = (): void => void this.ctx?.suspend();
    const resume = (): void => {
      if (!this.muted && document.visibilityState === 'visible') void this.ctx?.resume();
    };

    document.addEventListener('visibilitychange', () =>
      document.hidden ? suspend() : resume(),
    );
    addEventListener('blur', suspend);
    addEventListener('focus', resume);
    addEventListener('pagehide', suspend);
  }

  /**
   * Браузеры запрещают звук до первого жеста, поэтому контекст создаётся
   * не на старте, а при первом касании.
   */
  unlock(): void {
    if (this.ctx || !this.enabled) return;
    try {
      const Ctor = window.AudioContext ?? (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) {
        this.enabled = false;
        return;
      }
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    } catch {
      this.enabled = false;
    }
  }

  /** Глушение на время рекламы: звук игры не должен идти поверх ролика. */
  setMuted(muted: boolean): void {
    this.muted = muted;
    if (!this.ctx) return;
    if (muted) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  play(name: SoundName): void {
    if (!this.ctx || !this.master || this.muted) return;
    if (this.ctx.state === 'suspended') return;

    switch (name) {
      case 'cast':
        this.sweep(220, 620, 0.16, 'triangle', 0.5);
        break;
      case 'splash':
        this.noise(0.28, 1400, 0.7);
        break;
      case 'bite':
        this.sweep(520, 180, 0.18, 'square', 0.35);
        break;
      case 'reel':
        this.sweep(160, 200, 0.08, 'sawtooth', 0.18);
        break;
      case 'snap':
        this.sweep(900, 90, 0.26, 'sawtooth', 0.6);
        this.noise(0.18, 2600, 0.5);
        break;
      case 'coin':
        this.sweep(880, 1320, 0.1, 'sine', 0.45);
        this.sweep(1320, 1760, 0.12, 'sine', 0.3, 0.08);
        break;
      case 'bounce':
        this.sweep(320, 140, 0.1, 'triangle', 0.35);
        break;
    }
  }

  private sweep(
    from: number,
    to: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
  ): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + duration);
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain).connect(master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  /** Всплеск и обрыв — это шум, а не тон. */
  private noise(duration: number, cutoff: number, volume: number): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const frames = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = cutoff;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    source.connect(filter).connect(gain).connect(master);
    source.start();
  }
}
