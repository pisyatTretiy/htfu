import { Application, Container } from 'pixi.js';
import { resolveQuality, type QualityProfile } from './Quality';
import type { IPlatform } from '../platform';
import { WaterScene } from '../scenes/WaterScene';
import { PerfHud } from '../debug/PerfHud';

/**
 * Бутстрап приложения: рендерер, ресайз, ввод, пауза по потере фокуса.
 *
 * Пауза звука и остановка геймплея при уходе из вкладки — требование площадки
 * и частая причина отказа модерации, поэтому живёт в ядре с первого дня.
 */
export class App {
  private readonly pixi = new Application();
  private readonly quality: QualityProfile = resolveQuality();
  private scene!: WaterScene;
  private hud?: PerfHud;
  private running = false;

  constructor(private readonly platform: IPlatform) {}

  async start(): Promise<void> {
    const host = document.getElementById('app');
    if (!host) throw new Error('#app не найден в разметке');

    await this.pixi.init({
      resizeTo: host,
      antialias: false,
      background: 0x04141a,
      resolution: Math.min(devicePixelRatio || 1, this.quality.maxResolution),
      autoDensity: true,
      powerPreference: 'high-performance',
    });
    host.appendChild(this.pixi.canvas);

    this.scene = new WaterScene(this.quality);
    this.pixi.stage.addChild(this.scene.root);
    this.resize();

    this.bindInput();
    this.bindFocus();

    this.hud = new PerfHud(this.quality, () => ({
      sprites: countNodes(this.pixi.stage),
      depth: this.scene.depth,
    }));

    this.pixi.ticker.add((ticker) => {
      if (!this.running) return;
      this.scene.update(ticker.deltaMS);
      this.hud?.update(ticker.deltaMS);
    });

    this.running = true;
    this.platform.ready();
    this.platform.gameplayStart();
    document.getElementById('boot')?.classList.add('hidden');
  }

  private resize(): void {
    this.scene.resize(this.pixi.screen.width, this.pixi.screen.height);
  }

  private bindInput(): void {
    const canvas = this.pixi.canvas;
    addEventListener('resize', () => this.resize());
    this.pixi.renderer.on('resize', () => this.resize());

    // Контекстное меню в игровой области — отдельный пункт требований площадки.
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.scene.addDepth(event.deltaY * 0.08);
      },
      { passive: false },
    );

    let dragging = false;
    let lastY = 0;
    canvas.addEventListener('pointerdown', (event) => {
      dragging = true;
      lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!dragging) return;
      // Тянем вверх — уходим глубже: жест «опускаем леску».
      this.scene.addDepth((lastY - event.clientY) * 0.35);
      lastY = event.clientY;
    });
    const stop = (event: PointerEvent): void => {
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);

    // Стрелки нужны и десктопу, и ТВ-пульту.
    addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') this.scene.addDepth(16);
      if (event.key === 'ArrowUp') this.scene.addDepth(-16);
    });
  }

  private bindFocus(): void {
    const suspend = (): void => {
      if (!this.running) return;
      this.running = false;
      this.platform.gameplayStop();
    };
    const resume = (): void => {
      if (this.running) return;
      this.running = true;
      this.platform.gameplayStart();
    };

    document.addEventListener('visibilitychange', () => (document.hidden ? suspend() : resume()));
    addEventListener('blur', suspend);
    addEventListener('focus', resume);
  }
}

/** Узлов в дереве сцены — грубая, но честная метрика нагрузки для спайка. */
function countNodes(node: Container): number {
  let total = 1;
  for (const child of node.children) total += countNodes(child as Container);
  return total;
}
