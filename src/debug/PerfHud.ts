import type { QualityProfile } from '../core/Quality';

/**
 * Метрики спайка. Смысл спайка — цифры, а не «выглядит плавно»:
 * FPS, худший кадр за последнюю секунду, число спрайтов, профиль качества.
 *
 * HUD — обычный DOM поверх canvas: так же, как весь UI игры (docs/04, § 4.2).
 */
export class PerfHud {
  private readonly el: HTMLElement;
  private frames = 0;
  private elapsed = 0;
  private worstFrame = 0;
  private fps = 0;
  private worstShown = 0;

  constructor(
    private readonly quality: QualityProfile,
    private readonly probe: () => { sprites: number; depth: number },
  ) {
    const el = document.getElementById('hud');
    if (!el) throw new Error('#hud не найден в разметке');
    this.el = el;
    this.el.hidden = false;
    this.el.addEventListener('click', () => {
      this.el.style.opacity = this.el.style.opacity === '0.25' ? '1' : '0.25';
    });
    addEventListener('keydown', (event) => {
      if (event.key === 'h' || event.key === 'H') this.el.hidden = !this.el.hidden;
    });
    // Первый замер приходит через полсекунды — до него HUD не должен быть пустым.
    this.render();
  }

  update(deltaMs: number): void {
    this.frames += 1;
    this.elapsed += deltaMs;
    this.worstFrame = Math.max(this.worstFrame, deltaMs);

    if (this.elapsed < 500) return;

    this.fps = Math.round((this.frames * 1000) / this.elapsed);
    this.worstShown = this.worstFrame;
    this.frames = 0;
    this.elapsed = 0;
    this.worstFrame = 0;
    this.render();
  }

  private render(): void {
    const { sprites, depth } = this.probe();
    const target = this.quality.targetFps;
    const fpsClass = this.fps >= target ? 'ok' : 'bad';
    const canvas = document.querySelector('#app canvas');
    const size = canvas instanceof HTMLCanvasElement ? `${canvas.width}×${canvas.height}` : '—';

    this.el.innerHTML = [
      `<div class="${fpsClass}">FPS <b>${this.fps}</b></div>`,
      `<div>худший кадр <b>${this.worstShown.toFixed(1)} мс</b></div>`,
      `<div>цель <b>≥ ${target}</b></div>`,
      '<hr>',
      `<div>профиль <b>${this.quality.tier}</b></div>`,
      `<div>спрайтов <b>${sprites}</b></div>`,
      `<div>глубина <b>${depth.toFixed(0)} м</b></div>`,
      `<div>буфер <b>${size}</b></div>`,
      `<div>DPR <b>${devicePixelRatio.toFixed(2)}</b></div>`,
      '<hr>',
      '<div class="hint">?q=low — мобильный профиль</div>',
      '<div class="hint">H — скрыть, клик — приглушить</div>',
    ].join('');
  }
}
