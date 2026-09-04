import { Application, Container } from 'pixi.js';
import { resolveQuality, type QualityProfile } from './Quality';
import type { IPlatform } from '../platform';
import { FishingScene } from '../scenes/FishingScene';
import { PerfHud } from '../debug/PerfHud';

declare global {
  interface Window {
    /** Тестовый шов для tools/capture.ts. Читается только автотестом. */
    __htfu?: FishingScene['debugSnapshot'] | undefined;
  }
}

/** Касание короче этого и без сдвига считается тапом, а не свайпом. */
const TAP_MS = 200;
const TAP_SLOP = 10;

/**
 * Бутстрап приложения: рендерер, ресайз, ввод, пауза по потере фокуса.
 *
 * Пауза геймплея при уходе из вкладки — требование площадки и частая причина
 * отказа модерации, поэтому живёт в ядре с первого дня.
 */
export class App {
  private readonly pixi = new Application();
  private readonly quality: QualityProfile = resolveQuality();
  private scene!: FishingScene;
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

    this.scene = new FishingScene(this.quality, (text) => showToast(text));
    this.pixi.stage.addChild(this.scene.root);
    this.resize();

    this.bindInput();
    this.bindFocus();

    this.hud = new PerfHud(this.quality, () => ({
      sprites: countNodes(this.pixi.stage),
      rows: this.scene.metrics,
    }));

    this.pixi.ticker.add((ticker) => {
      if (!this.running) return;
      this.scene.update(ticker.deltaMS);
      this.hud?.update(ticker.deltaMS);
      window.__htfu = this.scene.debugSnapshot;
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
        this.scene.freeLook(event.deltaY * 0.06);
      },
      { passive: false },
    );

    let pressedAt = 0;
    let startX = 0;
    let startY = 0;
    let moved = false;
    let down = false;

    canvas.addEventListener('pointerdown', (event) => {
      down = true;
      moved = false;
      pressedAt = performance.now();
      startX = event.clientX;
      startY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      this.scene.pressStart(event.clientX, event.clientY);
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!down) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > TAP_SLOP) moved = true;
      // Руление крючком: чем дальше увёл палец, тем сильнее снос.
      this.scene.steer(dx / (this.pixi.screen.width * 0.25));
    });

    const release = (event: PointerEvent): void => {
      if (!down) return;
      down = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      this.scene.pressEnd(!moved && performance.now() - pressedAt < TAP_MS);
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    // Клавиатура нужна десктопу; стрелки и OK — ещё и пульту ТВ.
    let spaceHeld = false;
    addEventListener('keydown', (event) => {
      if (event.code === 'Space' && !spaceHeld) {
        spaceHeld = true;
        this.scene.pressStart(this.pixi.screen.width * 0.26, this.pixi.screen.height * 0.42);
        event.preventDefault();
      }
      if (event.key === 'ArrowLeft') this.scene.steer(-1);
      if (event.key === 'ArrowRight') this.scene.steer(1);
      if (event.key === 'r' || event.key === 'R') this.scene.reel();
      if (event.key === 'l' || event.key === 'L') freezeMainThread(250);
    });
    addEventListener('keyup', (event) => {
      if (event.code === 'Space') {
        spaceHeld = false;
        this.scene.pressEnd(false);
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') this.scene.steer(0);
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

/**
 * Искусственный фриз главного потока: проверка из ADR-0001, § 5 (день 2) —
 * леска не должна разваливаться, когда кадр приходит через четверть секунды.
 * Клавиша L.
 */
function freezeMainThread(ms: number): void {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    // Намеренная блокировка: воспроизводим фриз вкладки.
  }
  console.info(`[debug] главный поток заморожен на ${ms} мс`);
}

let toastTimer = 0;
function showToast(text: string): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1400) as unknown as number;
}
