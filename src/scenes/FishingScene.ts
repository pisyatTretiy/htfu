import { Container, Sprite } from 'pixi.js';
import { WaterScene } from './WaterScene';
import { Hook } from '../gameplay/Hook';
import { FishingLine } from '../gameplay/FishingLine';
import { Rod } from '../gameplay/Rod';
import { PowerMeter } from '../gameplay/PowerMeter';
import { lineTexture, radialTexture } from '../fx/textures';
import { clamp, damp, metersToPx, MAX_DEPTH_M } from '../core/world';
import type { QualityProfile } from '../core/Quality';

/** Шаг симуляции: 120 Гц. Кадр может быть любым, шаг — нет. */
const STEP = 1 / 120;
/** Потолок шагов за кадр: защита от спирали смерти после фриза вкладки. */
const MAX_STEPS = 8;

/** Длина размотанной лески на стартовой снасти. */
const MAX_LINE_M = 60;
const REEL_SPEED = 980;

export type CastState = 'idle' | 'charging' | 'flying' | 'sinking' | 'reeling';

/**
 * День 2 спайка: заброс, леска, погружение.
 *
 * Здесь же живёт камера — она следует за крючком, а вода получает готовое
 * значение глубины и только рисует эффекты.
 */
export class FishingScene {
  readonly root = new Container();

  state: CastState = 'idle';
  trickShot = false;
  /** Сколько трюк-шотов подряд — пригодится для множителя серии в фазе 2. */
  trickStreak = 0;

  private readonly water: WaterScene;
  private readonly rod = new Rod();
  private readonly hook = new Hook();
  private readonly line: FishingLine;
  private readonly meter = new PowerMeter();
  private readonly splash: Sprite[] = [];
  private readonly splashVel: { x: number; y: number; life: number }[] = [];

  private width = 1;
  private accumulator = 0;
  private cameraDepth = 0;
  private boatX = 0;

  constructor(quality: QualityProfile, private readonly onToast: (text: string) => void) {
    this.water = new WaterScene(quality);
    this.line = new FishingLine(lineTexture(3));

    const splashTexture = radialTexture(32, 'rgba(226,255,252,0.95)', 2);
    for (let i = 0; i < 16; i++) {
      const drop = new Sprite(splashTexture);
      drop.anchor.set(0.5);
      drop.blendMode = 'add';
      drop.visible = false;
      drop.scale.set(0.35);
      this.splash.push(drop);
      this.splashVel.push({ x: 0, y: 0, life: 0 });
      this.water.gameplay.addChild(drop);
    }

    this.water.gameplay.addChild(this.line.view, this.hook.view, this.rod.view, this.meter.view);
    this.root.addChild(this.water.root);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.boatX = width * 0.26;
    this.water.resize(width, height);
    if (this.state === 'idle') this.hook.reset(this.rod.tipX, this.rod.tipY);
  }

  // --- ввод -----------------------------------------------------------------

  /** Палец опущен: в покое начинаем копить силу, в воде — рулим крючком. */
  pressStart(): void {
    if (this.state === 'idle') {
      this.state = 'charging';
      this.meter.begin();
    }
  }

  /** Палец поднят. `tapped` — короткое касание без движения. */
  pressEnd(tapped: boolean): void {
    if (this.state === 'charging') {
      this.trickShot = this.meter.release();
      this.trickStreak = this.trickShot ? this.trickStreak + 1 : 0;
      this.hook.cast(this.meter.value);
      this.state = 'flying';
      if (this.trickShot) {
        this.onToast(this.trickStreak > 1 ? `Трюк-шот ×${this.trickStreak}` : 'Трюк-шот!');
      }
      return;
    }

    this.hook.steer = 0;
    if (tapped && (this.state === 'sinking' || this.state === 'flying')) this.reel();
  }

  /** Свайп по горизонтали во время погружения. */
  steer(direction: number): void {
    if (this.state === 'sinking') this.hook.steer = clamp(direction, -1, 1);
  }

  reel(): void {
    if (this.state === 'flying' || this.state === 'sinking') this.state = 'reeling';
  }

  /** Свободный осмотр колесом, пока снасть в покое. */
  freeLook(meters: number): void {
    if (this.state === 'idle') {
      this.cameraDepth = clamp(this.cameraDepth + meters, 0, MAX_DEPTH_M);
    }
  }

  // --- симуляция ------------------------------------------------------------

  update(deltaMs: number): void {
    // Кадр после возврата из фона может прийти в сотни мс — режем сразу.
    this.accumulator += Math.min(deltaMs, 250);

    let steps = 0;
    while (this.accumulator >= STEP * 1000 && steps < MAX_STEPS) {
      this.simulate(STEP);
      this.accumulator -= STEP * 1000;
      steps += 1;
    }
    // Не догнали за MAX_STEPS — остаток выбрасываем, иначе накопится долг.
    if (steps === MAX_STEPS) this.accumulator = 0;

    this.water.setDepth(this.cameraDepth);
    this.water.update(deltaMs);
    this.meter.update(deltaMs / 1000, this.boatX + 24, this.rod.tipY - 26);
    this.hook.syncView();
    this.updateSplash(Math.min(deltaMs, 100) / 1000);
  }

  private simulate(dt: number): void {
    const surfaceY = this.water.surfaceHeightAt(this.boatX);
    const bounds = { left: 12, right: this.width - 12 };

    if (this.state === 'flying' || this.state === 'sinking') {
      const entered = this.hook.step(dt, bounds);
      if (entered) {
        this.state = 'sinking';
        this.spawnSplash();
      }
      this.applyLineLimit();
    } else if (this.state === 'reeling') {
      const done = this.hook.reelTo(this.rod.tipX, this.rod.tipY, REEL_SPEED, dt);
      if (done) {
        this.state = 'idle';
        this.hook.reset(this.rod.tipX, this.rod.tipY);
        this.line.reset(this.rod.tipX, this.rod.tipY);
      }
    } else {
      this.hook.reset(this.rod.tipX, this.rod.tipY);
    }

    const dx = this.hook.x - this.rod.tipX;
    const dy = this.hook.y - this.rod.tipY;
    this.rod.update(this.boatX, surfaceY, { dx, dy, tension: this.line.tension });

    if (this.state === 'idle') {
      this.line.reset(this.rod.tipX, this.rod.tipY);
    } else {
      this.line.step(dt, { x: this.rod.tipX, y: this.rod.tipY }, this.hook, metersToPx(MAX_LINE_M));
    }

    this.followCamera(dt);
  }

  /** Леска кончилась: дальше крючок не уходит, радиальная скорость гасится. */
  private applyLineLimit(): void {
    const maxLength = metersToPx(MAX_LINE_M);
    const dx = this.hook.x - this.rod.tipX;
    const dy = this.hook.y - this.rod.tipY;
    const distance = Math.hypot(dx, dy);
    if (distance <= maxLength) return;

    const nx = dx / distance;
    const ny = dy / distance;
    this.hook.x = this.rod.tipX + nx * maxLength;
    this.hook.y = this.rod.tipY + ny * maxLength;

    const radial = this.hook.vx * nx + this.hook.vy * ny;
    if (radial > 0) {
      this.hook.vx -= radial * nx;
      this.hook.vy -= radial * ny;
    }
  }

  private followCamera(dt: number): void {
    const target = this.state === 'idle' ? this.cameraDepth : this.hook.depthMeters;
    this.cameraDepth = damp(this.cameraDepth, target, 0.02, dt);
  }

  private spawnSplash(): void {
    for (let i = 0; i < this.splash.length; i++) {
      const drop = this.splash[i];
      const velocity = this.splashVel[i];
      if (!drop || !velocity) continue;
      const angle = -Math.PI / 2 + (i / this.splash.length - 0.5) * 2.2;
      const speed = 90 + Math.random() * 160;
      drop.x = this.hook.x;
      drop.y = 0;
      drop.alpha = 0.9;
      drop.visible = true;
      velocity.x = Math.cos(angle) * speed;
      velocity.y = Math.sin(angle) * speed;
      velocity.life = 0.5 + Math.random() * 0.3;
    }
  }

  private updateSplash(dt: number): void {
    for (let i = 0; i < this.splash.length; i++) {
      const drop = this.splash[i];
      const velocity = this.splashVel[i];
      if (!drop || !velocity || !drop.visible) continue;

      velocity.life -= dt;
      if (velocity.life <= 0) {
        drop.visible = false;
        continue;
      }
      velocity.y += 900 * dt;
      drop.x += velocity.x * dt;
      drop.y += velocity.y * dt;
      drop.alpha = Math.max(0, velocity.life * 1.6);
    }
  }

  // --- метрики для HUD ------------------------------------------------------

  get metrics(): [string, string][] {
    const lineOut = Math.hypot(this.hook.x - this.rod.tipX, this.hook.y - this.rod.tipY);
    return [
      ['состояние', this.state],
      ['глубина', `${this.hook.depthMeters.toFixed(1)} м`],
      ['леска', `${(lineOut / metersToPx(1)).toFixed(1)} / ${MAX_LINE_M} м`],
      ['натяжение', this.line.tension.toFixed(2)],
      ['трюк-серия', String(this.trickStreak)],
    ];
  }
}
