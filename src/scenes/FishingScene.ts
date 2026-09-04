import { Container, Graphics, Sprite } from 'pixi.js';
import { WaterScene } from './WaterScene';
import { Hook } from '../gameplay/Hook';
import { FishingLine } from '../gameplay/FishingLine';
import { Rod } from '../gameplay/Rod';
import { PowerMeter } from '../gameplay/PowerMeter';
import { FightSystem } from '../gameplay/FightSystem';
import { CatchView } from '../gameplay/CatchView';
import { MischiefAct, type Area } from '../gameplay/Mischief';
import { rollCatch } from '../gameplay/CatchPool';
import { entryName } from '../content/catalog';
import { lineTexture, radialTexture } from '../fx/textures';
import { Rng } from '../core/Rng';
import { clamp, damp, metersToPx, MAX_DEPTH_M } from '../core/world';
import type { CatchEntry } from '../content/types';
import type { QualityProfile } from '../core/Quality';
import type { Effects } from '../meta/Progression';

/** Шаг симуляции: 120 Гц. Кадр может быть любым, шаг — нет. */
const STEP = 1 / 120;
/** Потолок шагов за кадр: защита от спирали смерти после фриза вкладки. */
const MAX_STEPS = 8;

const REEL_SPEED = 980;
/** Клёв гарантирован: вопрос только в том, через сколько секунд под водой. */
const BITE_MIN = 0.7;
const BITE_MAX = 2.1;

export type CastState =
  | 'idle'
  | 'charging'
  | 'flying'
  | 'sinking'
  | 'fighting'
  | 'onboard'
  | 'reeling';

/**
 * День 3 спайка: заброс → клёв → бой → улов буянит в лодке.
 *
 * Исход боя считает FightSystem фиксированным шагом; леска, изгиб удилища и
 * тряска камеры его только показывают (ADR-0001, § 2.1).
 */
export interface SceneHooks {
  toast(text: string): void;
  /** Звук события. Сцена не знает, чем он воспроизводится. */
  sfx(name: 'cast' | 'splash' | 'bite' | 'snap' | 'bounce'): void;
  /** Эффекты прокачки читаются каждый кадр: снасть меняется прямо в магазине. */
  effects(): Effects;
  /** Улов зачтён: деньги, альбом и сохранение — забота вызывающего. */
  onCatch(entry: CatchEntry, reward: number): void;
}

export class FishingScene {
  readonly root = new Container();

  state: CastState = 'idle';
  trickShot = false;
  trickStreak = 0;
  /** Пауза: открыт магазин. Симуляция стоит, вода продолжает жить. */
  paused = false;

  private readonly water: WaterScene;
  private readonly rod = new Rod();
  private readonly hook = new Hook();
  private readonly line: FishingLine;
  private readonly meter = new PowerMeter();
  private readonly gauge = new Graphics();
  private readonly splash: Sprite[] = [];
  private readonly splashVel: { x: number; y: number; life: number }[] = [];
  private readonly rng = new Rng(Date.now() & 0xffff);

  private fight: FightSystem | null = null;
  private hooked: CatchView | null = null;
  private hookedEntry: CatchEntry | null = null;
  private mischief: MischiefAct | null = null;

  private width = 1;
  private accumulator = 0;
  private cameraDepth = 0;
  private boatX = 0;
  private surfaceY = 0;
  private submergedFor = 0;
  private biteAt = BITE_MIN;
  private bitePointX = 0;
  private bitePointY = 0;
  private shake = 0;
  private hitstop = 0;

  constructor(
    quality: QualityProfile,
    private readonly hooks: SceneHooks,
  ) {
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

    this.water.gameplay.addChild(this.line.view, this.hook.view, this.rod.view);
    this.water.gameplay.addChild(this.gauge, this.meter.view);
    this.root.addChild(this.water.root);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.boatX = width * 0.26;
    this.water.resize(width, height);
    if (this.state === 'idle') this.hook.reset(this.rod.tipX, this.rod.tipY);
  }

  // --- ввод -----------------------------------------------------------------

  pressStart(screenX: number, screenY: number): void {
    if (this.state === 'idle') {
      this.state = 'charging';
      this.meter.begin();
      return;
    }
    if (this.state === 'fighting' && this.fight) {
      this.fight.reeling = true;
      return;
    }
    if (this.state === 'onboard' && this.mischief) {
      const world = this.water.screenToWorld(screenX, screenY);
      if (this.mischief.tap(world.x, world.y)) {
        this.shake = Math.max(this.shake, 5);
        this.hooks.sfx('bounce');
      }
    }
  }

  pressEnd(tapped: boolean): void {
    if (this.state === 'charging') {
      this.trickShot = this.meter.release();
      this.trickStreak = this.trickShot ? this.trickStreak + 1 : 0;
      this.hook.cast(this.meter.value);
      this.hooks.sfx('cast');
      this.state = 'flying';
      if (this.trickShot) {
        this.hooks.toast(this.trickStreak > 1 ? `Трюк-шот ×${this.trickStreak}` : 'Трюк-шот!');
      }
      return;
    }

    if (this.fight) this.fight.reeling = false;
    this.hook.steer = 0;
    if (tapped && (this.state === 'sinking' || this.state === 'flying')) this.reel();
  }

  steer(direction: number): void {
    if (this.state === 'sinking') this.hook.steer = clamp(direction, -1, 1);
  }

  reel(): void {
    if (this.state === 'flying' || this.state === 'sinking') this.state = 'reeling';
  }

  freeLook(meters: number): void {
    if (this.state === 'idle') {
      this.cameraDepth = clamp(this.cameraDepth + meters, 0, MAX_DEPTH_M);
    }
  }

  // --- симуляция ------------------------------------------------------------

  update(deltaMs: number): void {
    if (this.paused) {
      // Вода и пузыри живут дальше — застывшая сцена за магазином выглядит багом.
      this.water.setDepth(this.cameraDepth);
      this.water.update(deltaMs);
      this.accumulator = 0;
      return;
    }
    this.accumulator += Math.min(deltaMs, 250);

    let steps = 0;
    while (this.accumulator >= STEP * 1000 && steps < MAX_STEPS) {
      this.simulate(STEP);
      this.accumulator -= STEP * 1000;
      steps += 1;
    }
    if (steps === MAX_STEPS) this.accumulator = 0;

    const dt = Math.min(deltaMs, 100) / 1000;
    this.water.setDepth(this.cameraDepth);
    this.water.update(deltaMs);
    this.meter.update(dt, this.boatX + 30, this.rod.tipY - 26);
    this.hook.syncView();
    this.updateSplash(dt);
    this.hooked?.update(dt, this.fight?.surge ?? 0.3);
    this.mischief?.render(dt);
    this.drawGauge();
    this.applyShake(dt);
  }

  private simulate(dt: number): void {
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }
    this.surfaceY = this.water.surfaceHeightAt(this.boatX);
    const bounds = { left: 12, right: this.width - 12 };

    switch (this.state) {
      case 'flying':
      case 'sinking': {
        if (this.hook.step(dt, bounds)) {
          this.state = 'sinking';
          this.submergedFor = 0;
          this.biteAt = this.rng.range(BITE_MIN, BITE_MAX);
          this.spawnSplash();
          this.hooks.sfx('splash');
        }
        this.applyLineLimit();
        if (this.state === 'sinking') {
          this.submergedFor += dt;
          if (this.submergedFor >= this.biteAt && this.hook.depthMeters > 2) this.bite();
        }
        break;
      }
      case 'fighting':
        this.stepFight(dt);
        break;
      case 'onboard':
        this.stepMischief(dt);
        break;
      case 'reeling': {
        if (this.hook.reelTo(this.rod.tipX, this.rod.tipY, REEL_SPEED, dt)) this.rest();
        break;
      }
      default:
        this.hook.reset(this.rod.tipX, this.rod.tipY);
    }

    const dx = this.hook.x - this.rod.tipX;
    const dy = this.hook.y - this.rod.tipY;
    const tension = this.fight ? Math.max(this.line.tension, this.fight.tension) : this.line.tension;
    this.rod.update(this.boatX, this.surfaceY, { dx, dy, tension });

    if (this.state === 'idle' || this.state === 'onboard') {
      this.line.reset(this.rod.tipX, this.rod.tipY);
    } else {
      this.line.step(
        dt,
        { x: this.rod.tipX, y: this.rod.tipY },
        this.hook,
        metersToPx(this.hooks.effects().maxLineM),
      );
    }

    this.followCamera(dt);
  }

  /** Клёв гарантирован, пока крючок в воде — находка оригинала (docs/01). */
  private bite(): void {
    const entry = rollCatch(this.hook.depthMeters, this.rng);
    const { reelPower, lineStrength } = this.hooks.effects();
    this.hookedEntry = entry;
    this.fight = new FightSystem(entry, this.rng.int(1, 1 << 20), { reelPower, lineStrength });
    this.hooked = new CatchView(entry);
    this.water.gameplay.addChildAt(this.hooked.view, 0);
    this.bitePointX = this.hook.x;
    this.bitePointY = this.hook.y;
    this.state = 'fighting';
    this.shake = 7;
    this.hooks.sfx('bite');
    this.hooks.toast('Клюёт!');
  }

  private stepFight(dt: number): void {
    const fight = this.fight;
    if (!fight) return;

    const outcome = fight.step(dt);

    // Позиция крючка — визуализация уже посчитанного боя, а не его причина.
    const progress = 1 - fight.stamina;
    const wobble = Math.sin(fight.tension * 30) * 26 * fight.surge;
    // Улов держим в кадре целиком: он шире крючка, и у края экрана половина
    // силуэта уезжала за границу.
    const margin = 72;
    this.hook.x = clamp(
      this.bitePointX + (this.rod.tipX - this.bitePointX) * progress + wobble,
      margin,
      this.width - margin,
    );
    this.hook.y = this.bitePointY + (this.rod.tipY - this.bitePointY) * progress;
    this.hook.vx = 0;
    this.hook.vy = 0;

    if (this.hooked) {
      this.hooked.view.x = this.hook.x - 6;
      this.hooked.view.y = this.hook.y + 4;
      this.hooked.view.rotation = Math.sin(fight.surge * 6) * 0.35;
    }

    this.line.view.tint = tensionTint(fight.tensionRatio);
    this.shake = Math.max(this.shake, fight.surge * 4.5);

    if (outcome === 'snapped' || outcome === 'escaped') {
      this.hooks.toast(outcome === 'snapped' ? 'Леска лопнула!' : 'Сорвалась!');
      this.hooks.sfx('snap');
      this.hitstop = 0.12;
      this.shake = outcome === 'snapped' ? 14 : 8;
      this.dropHooked();
      this.state = 'reeling';
    } else if (outcome === 'landed') {
      this.hitstop = 0.08;
      this.land();
    }
  }

  private land(): void {
    const entry = this.hookedEntry;
    const fight = this.fight;
    this.dropHooked();
    this.line.view.tint = 0xffffff;
    if (!entry || !fight) {
      this.rest();
      return;
    }

    // Мусор не буянит: его просто сдают и смеются над тем, что вытащили.
    if (entry.mischief === 'none') {
      const reward = fight.reward(this.trickShot);
      this.hooks.onCatch(entry, reward);
      this.hooks.toast(`${entryName(entry)}! +${reward} ₽`);
      this.rest();
      return;
    }

    this.mischief = new MischiefAct(
      entry,
      this.rng.int(1, 1 << 20),
      this.hooks.effects().subdueSeconds,
    );
    this.water.gameplay.addChild(this.mischief.view);
    this.mischief.start(this.boatArea());
    this.state = 'onboard';
    this.hooks.toast(`${entryName(entry)} в лодке!`);
  }

  private stepMischief(dt: number): void {
    const act = this.mischief;
    const entry = this.hookedEntry;
    const fight = this.fight;
    if (!act || !entry || !fight) return;

    const { result, prank } = act.step(dt, this.boatArea());
    if (prank) {
      this.hooks.toast(prank);
      this.shake = Math.max(this.shake, 6);
    }

    if (result === 'subdued') {
      const reward = Math.max(1, Math.round(fight.reward(this.trickShot) * (1 - act.damage)));
      this.hooks.onCatch(entry, reward);
      this.hooks.toast(`${entryName(entry)} усмирён! +${reward} ₽`);
      this.clearMischief();
      this.rest();
    } else if (result === 'escaped') {
      this.hooks.toast(`${entryName(entry)} ушёл за борт!`);
      this.shake = 10;
      this.clearMischief();
      this.rest();
    }
  }

  private boatArea(): Area {
    return { x: this.boatX, y: this.surfaceY - 6, halfWidth: 52, height: 96 };
  }

  private dropHooked(): void {
    if (!this.hooked) return;
    this.hooked.view.destroy({ children: true });
    this.hooked = null;
  }

  private clearMischief(): void {
    if (!this.mischief) return;
    this.mischief.view.destroy({ children: true });
    this.mischief = null;
  }

  private rest(): void {
    this.state = 'idle';
    this.fight = null;
    this.hookedEntry = null;
    this.hook.reset(this.rod.tipX, this.rod.tipY);
    this.line.reset(this.rod.tipX, this.rod.tipY);
    this.line.view.tint = 0xffffff;
  }

  private applyLineLimit(): void {
    const maxLength = metersToPx(this.hooks.effects().maxLineM);
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
    const target =
      this.state === 'idle' || this.state === 'onboard' ? 0 : this.hook.depthMeters;
    const source = this.state === 'idle' ? this.cameraDepth : target;
    this.cameraDepth = damp(this.cameraDepth, source, 0.02, dt);
  }

  /** Полоска натяжения в бою и терпения в лодке — над лодкой, крупно. */
  private drawGauge(): void {
    const g = this.gauge;
    g.clear();

    const show = this.state === 'fighting' || this.state === 'onboard';
    if (!show) return;

    const width = 108;
    const x = this.boatX - width / 2;
    const y = this.rod.tipY - 44;
    const value =
      this.state === 'fighting' ? (this.fight?.tensionRatio ?? 0) : (this.mischief?.patience ?? 0);
    const color = this.state === 'fighting' ? tensionTint(value) : 0xffd166;

    g.roundRect(x - 3, y - 3, width + 6, 16, 8).fill({ color: 0x08222c, alpha: 0.85 });
    g.roundRect(x, y, width * value, 10, 5).fill({ color });

    if (this.state === 'fighting' && this.fight) {
      // Вторая полоска — запас сил рыбы: игрок видит, что бой идёт к концу.
      g.roundRect(x, y + 13, width * (1 - this.fight.stamina), 4, 2).fill({ color: 0x4fd6b4 });
    }
  }

  private applyShake(dt: number): void {
    if (this.shake <= 0.05) {
      this.root.x = 0;
      this.root.y = 0;
      this.shake = 0;
      return;
    }
    this.root.x = (Math.random() - 0.5) * this.shake * 2;
    this.root.y = (Math.random() - 0.5) * this.shake * 2;
    this.shake *= Math.pow(0.02, dt);
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

  /**
   * Слепок состояния для автотестов: tools/capture.ts играет по нему, а не по
   * таймингам, и проверяет, что бой вообще выигрывается вменяемым ритмом.
   */
  get debugSnapshot(): {
    state: CastState;
    tension: number;
    stamina: number;
    patience: number;
    depth: number;
    onHook: string;
  } {
    return {
      state: this.state,
      depth: this.hook.depthMeters,
      tension: this.fight?.tensionRatio ?? 0,
      stamina: this.fight?.stamina ?? 1,
      patience: this.mischief?.patience ?? (this.fight?.patience ?? 1),
      onHook: this.hookedEntry ? entryName(this.hookedEntry) : '',
    };
  }

  get metrics(): [string, string][] {
    const rows: [string, string][] = [
      ['состояние', this.state],
      ['глубина', `${this.hook.depthMeters.toFixed(1)} м`],
      ['леска', `${this.hooks.effects().maxLineM} м`],
    ];
    if (this.fight && this.state === 'fighting') {
      rows.push(['на крючке', entryName(this.hookedEntry ?? { name: { ru: '—' } } as never)]);
      rows.push(['натяжение', this.fight.tensionRatio.toFixed(2)]);
      rows.push(['силы рыбы', this.fight.stamina.toFixed(2)]);
      rows.push(['терпение', this.fight.patience.toFixed(2)]);
    } else if (this.mischief) {
      rows.push(['в лодке', this.hookedEntry ? entryName(this.hookedEntry) : '—']);
      rows.push(['усмирение', `${Math.round(this.mischief.progress * 100)} %`]);
      rows.push(['терпение', this.mischief.patience.toFixed(2)]);
    } else {
      rows.push(['трюк-серия', String(this.trickStreak)]);
    }
    return rows;
  }
}

/** Белая леска на свободном ходу, красная на грани обрыва. */
function tensionTint(tension: number): number {
  const t = clamp(tension, 0, 1);
  const r = 255;
  const g = Math.round(255 - t * 190);
  const b = Math.round(255 - t * 215);
  return (r << 16) | (g << 8) | b;
}
