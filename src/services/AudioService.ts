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
      this.startSurf();
      this.scheduleGull();
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

  /**
   * Прибой: зацикленный шум под фильтром, громкость качает медленный
   * генератор. Тишина на берегу моря — самая заметная фальшь, какая бывает,
   * а сэмпл прибоя весит сотни килобайт.
   */
  private startSurf(): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;

    const frames = Math.floor(ctx.sampleRate * 4);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    // Сглаженный шум: белый звучит шипением, а не водой.
    let previous = 0;
    for (let i = 0; i < frames; i++) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.86 + white * 0.14;
      data[i] = previous * 3.2;
    }
    // Склейка петли: последние полсекунды растворяются в первых.
    const blend = Math.floor(ctx.sampleRate * 0.5);
    for (let i = 0; i < blend; i++) {
      const k = i / blend;
      const tail = data[frames - blend + i] ?? 0;
      const head = data[i] ?? 0;
      data[frames - blend + i] = tail * (1 - k) + head * k;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 620;

    const gain = ctx.createGain();
    gain.gain.value = 0.085;

    // Волна набегает и уходит: без качания петля выдаёт себя за десять секунд.
    const swell = ctx.createOscillator();
    swell.frequency.value = 0.09;
    const swellDepth = ctx.createGain();
    swellDepth.gain.value = 0.05;
    swell.connect(swellDepth).connect(gain.gain);
    swell.start();

    source.connect(filter).connect(gain).connect(master);
    source.start();
  }

  /** Редкий крик чайки: у берега он значит больше, чем ещё один слой шума. */
  private scheduleGull(): void {
    const delay = 12000 + Math.random() * 22000;
    setTimeout(() => {
      if (this.ctx && !this.muted && this.ctx.state === 'running') {
        this.sweep(1500, 880, 0.13, 'sawtooth', 0.09);
        this.sweep(1350, 820, 0.11, 'sawtooth', 0.07, 0.19);
      }
      this.scheduleGull();
    }, delay);
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
