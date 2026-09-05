import {
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three';
import { Birds3D } from './Birds3D';
import { Sky3D } from './Sky3D';
import { Water3D } from './Water3D';
import { Environment3D, shoreHeight } from './Environment3D';
import { Pier3D } from './Pier3D';
import { AmbientFish3D } from './AmbientFish3D';
import { Splash3D } from './Splash3D';
import { Hands3D } from './Hands3D';
import { Hook3D } from './Hook3D';
import { Line3D } from './Line3D';
import { FishView3D } from './FishView3D';
import { FightSystem } from '../gameplay/FightSystem';
import { MischiefAct } from '../gameplay/Mischief';
import { rollCatch } from '../gameplay/CatchPool';
import { rarityPrice, rarityTint, rollRarity, type Rarity } from '../gameplay/Rarity';
import { entryName } from '../content/catalog';
import { clamp, damp } from '../core/world';
import { Rng } from '../core/Rng';
import type { CatchEntry, FightPhase } from '../content/types';
import type { Effects } from '../meta/Progression';
import type { Zone } from '../meta/Zones';

/** Шаг симуляции: 120 Гц. Кадр может быть любым, шаг — нет. */
const STEP = 1 / 120;
const MAX_STEPS = 8;
/** Единиц мира на метр глубины: 250 м иначе уезжают за горизонт видимости. */
const UNITS_PER_M = 0.5;
const REEL_SPEED = 14;
const BITE_MIN = 0.7;
const BITE_MAX = 2.1;
/** Пределы наклона взгляда: вниз смотрим охотнее, чем вверх. */
const PITCH_MIN = -1.15;
const PITCH_MAX = 0.5;
/** Сколько улов висит на леске перед игроком, прежде чем уйти в лодку. */
const SHOWCASE_TIME = 1.6;

/** Сколько длится свеча рыбы и как часто она возможна. */
const LEAP_TIME = 0.8;
const LEAP_COOLDOWN = 3.2;

/** Где стоит игрок и на какой высоте его глаза: на настиле причала. */
const PLAYER_Z = -6;
const EYE_HEIGHT = 1.62;
/** Линия берега: за ней песок, перед ней вода. */
const SHORE_Z = 2.5;
/** Высота настила причала над водой. */
const PIER_Y = 0.68;

export type CastState =
  | 'idle'
  | 'charging'
  | 'flying'
  | 'sinking'
  | 'fighting'
  | 'showcase'
  | 'onboard'
  | 'reeling';

export interface SceneHooks {
  toast(text: string): void;
  sfx(name: 'cast' | 'splash' | 'bite' | 'snap' | 'bounce' | 'coin'): void;
  zoneCatches(): readonly string[];
  zoneDepth(): number;
  bossBite(): { entry: CatchEntry; phases: FightPhase[]; taunt: string } | null;
  onBoss(entryId: string): void;
  onBossEscaped(): void;
  effects(): Effects;
  onCatch(entry: CatchEntry, reward: number, rarity: Rarity): void;
}

/**
 * Рыбалка от первого лица (ADR-0004).
 *
 * Игрок закреплён в лодке: передвижения нет, поэтому одного пальца хватает на
 * всё — осмотр, заброс, подмотку и действие. Это и есть то, чем снимается риск
 * по требованию «управление одной рукой».
 *
 * Вся игровая логика — бой, пул, редкость, пакости — переиспользована из
 * двумерной версии без единой правки: она никогда не знала о рендере.
 */
export class FishingScene3D {
  readonly scene = new Scene();
  // Угол шире обычного: в портретном кадре по горизонтали видно вдвое меньше,
  // чем по вертикали, и при 62° сцена превращается в замочную скважину.
  readonly camera = new PerspectiveCamera(70, 1, 0.05, 1200);

  state: CastState = 'idle';
  paused = false;
  trickShot = false;
  trickStreak = 0;

  private readonly sky = new Sky3D();
  private readonly birds = new Birds3D();
  private readonly water = new Water3D();
  private readonly shore = new Environment3D();
  private readonly pier = new Pier3D();
  private readonly ambient = new AmbientFish3D();
  private readonly splash = new Splash3D();
  private readonly hands = new Hands3D();
  private readonly sun = new DirectionalLight(0xffffff, 2.1);
  private readonly hook = new Hook3D();
  private readonly line = new Line3D();
  private readonly rng = new Rng(Date.now() & 0xffff);

  private fight: FightSystem | null = null;
  private hooked: FishView3D | null = null;
  private hookedEntry: CatchEntry | null = null;
  private mischief: MischiefAct | null = null;
  private mischiefView: FishView3D | null = null;
  private isBossFight = false;
  private rarity: Rarity = 'common';

  private yaw = 0;
  private pitch = -0.18;
  private accumulator = 0;
  private time = 0;
  private submergedFor = 0;
  private biteAt = BITE_MIN;
  private hitstop = 0;
  private shake = 0;
  private leapTimer = 0;
  private leapCooldown = LEAP_COOLDOWN;
  private showcaseTimer = 0;
  private power = 0;
  private charging = false;

  private readonly bitePoint = new Vector3();
  private readonly tipWorld = new Vector3();
  private readonly forward = new Vector3();

  constructor(private readonly hooks: SceneHooks) {
    this.pier.group.position.set(0, 0, 3.4);
    this.scene.add(this.sky.mesh, this.water.mesh, this.shore.group, this.pier.group);
    this.scene.add(this.birds.group);
    this.scene.add(this.hook.object, this.line.mesh, this.ambient.group, this.splash.group);
    this.camera.add(this.hands.group);
    this.scene.add(this.camera);

    // Солнце сбоку и сзади: тени ложатся в кадр, а не прячутся за объектами.
    // Настоящие тени — главная примета стиля, ради которой всё и затевалось.
    this.sun.position.set(14, 20, 12);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -26;
    this.sun.shadow.camera.right = 26;
    this.sun.shadow.camera.top = 26;
    this.sun.shadow.camera.bottom = -26;
    this.sun.shadow.camera.far = 70;
    this.sun.shadow.bias = -0.0015;
    this.scene.add(this.sun, new HemisphereLight(0xdfeeff, 0x7a6a4a, 1.15));

    // Игрок стоит на причале и смотрит в море.
    this.camera.position.set(0, PIER_Y + EYE_HEIGHT, PLAYER_Z);
    this.applyLook();
    this.hook.reset(this.rodTip());
    this.line.reset(this.rodTip());
  }

  // --- окружение -----------------------------------------------------------

  applyZone(zone: Zone): void {
    this.sky.setPalette(zone.sky);
    const [shallow] = zone.water;
    // Третий оттенок палитры, а не предпоследний: самые тёмные её ступени —
    // это цвет толщи воды под поверхностью, и на поверхности они выглядели
    // не морем, а асфальтом.
    const deep = zone.water[2] ?? zone.water[0];
    if (shallow && deep) this.water.setPalette(shallow, deep, '#eef7fb');
    this.water.setHorizon(zone.sky[0] ?? '#cfe6f5');
    this.water.setShoreZ(SHORE_Z);
    this.water.setSun(this.sun.position);
    this.shore.setPalette(zone.sand, zone.foliage);
    // Дымка на горизонте того же цвета, что и небо у линии воды.
    this.scene.fog = new Fog(new Color(zone.sky[0] ?? '#cfe6f5').getHex(), 45, 260);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  // --- ввод ----------------------------------------------------------------

  pressStart(screenX: number, screenY: number): void {
    if (this.state === 'idle') {
      this.charging = true;
      this.power = 0;
      return;
    }
    if (this.state === 'fighting' && this.fight) {
      this.fight.reeling = true;
      return;
    }
    if (this.state === 'onboard' && this.mischief) {
      if (this.tapMischief(screenX, screenY)) {
        this.shake = Math.max(this.shake, 0.05);
        this.hooks.sfx('bounce');
      }
    }
  }

  pressEnd(tapped: boolean): void {
    if (this.charging) {
      this.charging = false;
      this.trickShot = this.power >= 0.72 && this.power <= 0.88;
      this.trickStreak = this.trickShot ? this.trickStreak + 1 : 0;
      this.camera.getWorldDirection(this.forward);
      this.hook.reset(this.rodTip());
      this.hook.cast(this.forward, this.power);
      this.hooks.sfx('cast');
      this.state = 'flying';
      if (this.trickShot) {
        this.hooks.toast(this.trickStreak > 1 ? `Трюк-шот ×${this.trickStreak}` : 'Трюк-шот!');
      }
      return;
    }

    if (this.fight) this.fight.reeling = false;
    this.hook.steer.set(0, 0, 0);
    if (tapped && (this.state === 'sinking' || this.state === 'flying')) this.reel();
  }

  /** Осмотр: перетаскивание крутит камеру. Это же движение рулит крючком. */
  look(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * 0.0032;
    this.pitch = clamp(this.pitch - deltaY * 0.0032, PITCH_MIN, PITCH_MAX);
    this.applyLook();

    if (this.state === 'sinking') {
      const right = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      this.hook.steer.copy(right).multiplyScalar(clamp(-deltaX * 0.02, -1, 1));
    }
  }

  steer(direction: number): void {
    if (this.state !== 'sinking') return;
    const right = new Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.hook.steer.copy(right).multiplyScalar(clamp(direction, -1, 1));
  }

  reel(): void {
    if (this.state === 'flying' || this.state === 'sinking') this.state = 'reeling';
  }

  freeLook(): void {
    // В первом лице свободный осмотр — это и есть камера, отдельного режима нет.
  }

  resetToSurface(): void {
    this.clearMischief();
    this.dropHooked();
    this.isBossFight = false;
    this.rest();
  }

  // --- цикл ----------------------------------------------------------------

  update(deltaMs: number): void {
    const dt = Math.min(deltaMs, 100) / 1000;
    this.time += dt;

    if (!this.paused) {
      this.accumulator += Math.min(deltaMs, 250);
      let steps = 0;
      while (this.accumulator >= STEP * 1000 && steps < MAX_STEPS) {
        this.simulate(STEP);
        this.accumulator -= STEP * 1000;
        steps += 1;
      }
      if (steps === MAX_STEPS) this.accumulator = 0;
    }

    // Причал не качается — качается вода. Тряска остаётся отдачей от рывка.
    this.camera.position.y = PIER_Y + EYE_HEIGHT + this.shakeOffset();
    this.shake *= Math.pow(0.02, dt);

    this.sky.update(dt);
    this.birds.update(dt);
    this.water.update(dt, this.camera.position);
    this.ambient.update(dt);
    this.splash.update(dt);
    this.hooked?.update(dt, this.state === 'showcase' ? 0.9 : (this.fight?.surge ?? 0.3));
    this.line.render(this.camera);

    if (this.charging) {
      // Шкала силы бежит туда-обратно: та же механика, что и в 2D.
      this.power = Math.abs(((this.time * 0.87) % 1) * 2 - 1);
    }
  }

  private simulate(dt: number): void {
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      return;
    }

    const tip = this.rodTip();
    switch (this.state) {
      case 'flying':
      case 'sinking': {
        if (this.hook.step(dt, this.water.heightAt(this.hook.position.x, this.hook.position.z))) {
          this.state = 'sinking';
          this.submergedFor = 0;
          this.biteAt = this.rng.range(BITE_MIN, BITE_MAX);
          this.hooks.sfx('splash');
          // Всплеск в точке входа: без него заброс заканчивается в пустоте.
          this.splash.burst(this.hook.position, 0.7);
        }
        this.applyLineLimit(tip);
        if (this.state === 'sinking') {
          this.submergedFor += dt;
          if (this.submergedFor >= this.biteAt && this.hook.depthMeters > 2) this.bite();
        }
        break;
      }
      case 'fighting':
        this.stepFight(dt, tip);
        break;
      case 'showcase':
        this.stepShowcase(dt, tip);
        break;
      case 'onboard':
        this.stepMischief(dt);
        break;
      case 'reeling':
        if (this.hook.reelTo(tip, REEL_SPEED, dt)) this.rest();
        break;
      default:
        this.hook.reset(tip);
    }

    const pull = this.camera.worldToLocal(this.hook.position.clone());
    const tension = this.fight ? Math.max(this.line.tension, this.fight.tensionRatio) : this.line.tension;
    this.hands.update(tension, pull.sub(this.hands.tipLocal));

    if (this.state === 'idle' || this.state === 'onboard') this.line.reset(tip);
    else this.line.step(dt, tip, this.hook.position, this.maxLineUnits());
  }

  private maxLineUnits(): number {
    return Math.min(this.hooks.effects().maxLineM, this.hooks.zoneDepth()) * UNITS_PER_M;
  }

  private applyLineLimit(tip: Vector3): void {
    const max = this.maxLineUnits();
    const delta = this.hook.position.clone().sub(tip);
    const distance = delta.length();
    if (distance <= max) return;

    const normal = delta.divideScalar(distance);
    this.hook.position.copy(tip).addScaledVector(normal, max);
    const radial = this.hook.velocity.dot(normal);
    if (radial > 0) this.hook.velocity.addScaledVector(normal, -radial);
  }

  private bite(): void {
    const boss = this.hooks.bossBite();
    const entry =
      boss?.entry ?? rollCatch(this.hook.depthMeters, this.rng, this.hooks.zoneCatches());
    const { reelPower, lineStrength } = this.hooks.effects();

    this.hookedEntry = entry;
    this.isBossFight = boss !== null;
    this.rarity = boss ? 'common' : rollRarity(this.rng);
    this.fight = new FightSystem(
      entry,
      this.rng.int(1, 1 << 20),
      { reelPower, lineStrength },
      boss ? { phases: boss.phases } : {},
    );

    this.hooked = new FishView3D(entry);
    this.hooked.setTint(rarityTint(this.rarity));
    this.scene.add(this.hooked.group);
    this.bitePoint.copy(this.hook.position);
    this.state = 'fighting';
    this.shake = boss ? 0.18 : 0.07;
    this.hooks.sfx('bite');
    this.hooks.toast(boss ? boss.taunt : 'Клюёт!');
  }

  private stepFight(dt: number, tip: Vector3): void {
    const fight = this.fight;
    if (!fight) return;
    const outcome = fight.step(dt);
    this.stepLeap(dt);

    // Крючок ползёт от места поклёвки к вершинке по мере усталости рыбы:
    // положение — визуализация уже посчитанного боя, а не его причина.
    const progress = 1 - fight.stamina;
    this.hook.position.lerpVectors(this.bitePoint, tip, progress);
    this.hook.position.x += Math.sin(this.time * 9) * 0.25 * fight.surge;
    this.hook.position.z += Math.cos(this.time * 7) * 0.25 * fight.surge;
    // Свеча: рыба выходит из воды дугой и падает обратно.
    if (this.leapTimer > 0) {
      const t = 1 - this.leapTimer / LEAP_TIME;
      this.hook.position.y += Math.sin(t * Math.PI) * (0.9 + fight.surge * 0.8);
    }
    this.hook.object.position.copy(this.hook.position);

    if (this.hooked) {
      this.hooked.group.position.copy(this.hook.position);
      this.hooked.group.position.y -= 0.2;
      this.hooked.group.lookAt(this.camera.position);
    }

    this.line.setTint(tensionTint(fight.tensionRatio));
    this.shake = Math.max(this.shake, fight.surge * (this.isBossFight ? 0.09 : 0.05));

    if (fight.phaseJustChanged) {
      fight.phaseJustChanged = false;
      this.shake = 0.22;
      this.hitstop = 0.09;
      this.hooks.sfx('snap');
      this.hooks.toast(`Он разозлился! Фаза ${fight.phase + 1}`);
    }

    if (outcome === 'snapped' || outcome === 'escaped') {
      this.hooks.toast(outcome === 'snapped' ? 'Леска лопнула!' : 'Сорвалась!');
      this.hooks.sfx('snap');
      this.hitstop = 0.12;
      this.shake = 0.2;
      if (this.isBossFight) this.hooks.onBossEscaped();
      this.dropHooked();
      this.state = 'reeling';
    } else if (outcome === 'landed') {
      this.hitstop = 0.08;
      this.beginShowcase();
    }
  }

  /**
   * Улов повисает на леске перед игроком.
   *
   * Без этого пойманное существо игрок не видит вовсе: был бой — и сразу
   * всплывающая надпись. Именно этот кадр в рыбалке и есть награда.
   */
  private beginShowcase(): void {
    if (!this.hooked) {
      this.finishLanding();
      return;
    }
    this.showcaseTimer = SHOWCASE_TIME;
    this.state = 'showcase';
    this.splash.burst(this.hook.position, 0.6);
    this.hooks.sfx('splash');
  }

  private stepShowcase(dt: number, tip: Vector3): void {
    this.showcaseTimer -= dt;

    // Крючок подтягивается к вершинке, улов покачивается под ним.
    this.hook.position.lerp(tip, Math.min(1, dt * 6));
    this.hook.object.position.copy(this.hook.position);

    if (this.hooked) {
      const sway = Math.sin(this.time * 4) * 0.12;
      this.hooked.group.scale.setScalar(0.55);
      this.hooked.group.position.copy(this.hook.position);
      this.hooked.group.position.y -= 0.34;
      this.hooked.group.position.x += sway * 0.3;
      // Рыба висит головой вверх и медленно поворачивается к игроку.
      this.hooked.group.rotation.set(0, this.time * 0.9, Math.PI / 2 + sway);
    }

    if (this.showcaseTimer <= 0) this.finishLanding();
  }

  /**
   * Свеча: измотанная рыба выбрасывается из воды. Это и зрелище, и подсказка —
   * игрок видит, кого тащит, и понимает, что бой идёт к концу.
   */
  private stepLeap(dt: number): void {
    const fight = this.fight;
    if (!fight) return;

    if (this.leapTimer > 0) {
      this.leapTimer -= dt;
      if (this.leapTimer <= 0) {
        this.splash.burst(this.hook.position, 0.9);
        this.hooks.sfx('splash');
      }
      return;
    }

    this.leapCooldown -= dt;
    const ready = this.leapCooldown <= 0 && fight.surge > 0.82 && fight.stamina < 0.75;
    if (ready && this.rng.next() < 0.55) {
      this.leapTimer = LEAP_TIME;
      this.leapCooldown = LEAP_COOLDOWN;
      this.splash.burst(this.hook.position, 0.85);
      this.hooks.sfx('splash');
      this.shake = Math.max(this.shake, 0.12);
    }
  }

  private finishLanding(): void {
    const entry = this.hookedEntry;
    const fight = this.fight;
    this.dropHooked();
    this.line.setTint(0xffffff);
    if (!entry || !fight) {
      this.rest();
      return;
    }

    if (this.isBossFight) {
      this.shake = 0.26;
      this.hooks.sfx('coin');
      this.hooks.onBoss(entry.id);
      this.isBossFight = false;
      this.rest();
      return;
    }

    if (entry.mischief === 'none') {
      const reward = this.rewardFor(fight);
      this.hooks.onCatch(entry, reward, this.rarity);
      this.hooks.toast(`${this.label(entry)}! +${reward} ₽`);
      this.rest();
      return;
    }

    this.mischief = new MischiefAct(
      entry,
      this.rng.int(1, 1 << 20),
      this.hooks.effects().subdueSeconds,
    );
    this.mischief.start({ x: 0, y: 0, halfWidth: 60, height: 90 });
    this.mischiefView = new FishView3D(entry);
    this.mischiefView.setTint(rarityTint(this.rarity));
    // Улов буянит в двух метрах от лица: в натуральную величину он закрывает
    // весь кадр, поэтому ужимаем — как и в двумерной версии.
    this.mischiefView.group.scale.setScalar(0.4);
    this.scene.add(this.mischiefView.group);
    this.state = 'onboard';
    this.hooks.toast(`${this.label(entry)} в лодке!`);
  }

  private stepMischief(dt: number): void {
    const act = this.mischief;
    const entry = this.hookedEntry;
    const fight = this.fight;
    if (!act || !entry || !fight) return;

    const { result, prank } = act.step(dt, { x: 0, y: 0, halfWidth: 60, height: 90 });
    if (prank) {
      this.hooks.toast(prank);
      this.shake = Math.max(this.shake, 0.08);
    }

    // Плоские координаты пакости раскладываем в пространство перед игроком.
    if (this.mischiefView) {
      this.mischiefView.group.position.set(
        clamp(act.x / 90, -0.75, 0.75),
        clamp(-0.55 - act.y / 150, -0.95, -0.1),
        -2.4,
      );
      this.mischiefView.group.position.applyMatrix4(this.camera.matrixWorld);
      this.mischiefView.group.rotation.set(0, this.time * 2.2, Math.sin(this.time * 6) * 0.5);
      this.mischiefView.update(dt, act.intensity);
    }

    if (result === 'subdued') {
      const reward = Math.max(1, Math.round(this.rewardFor(fight) * (1 - act.damage)));
      this.hooks.onCatch(entry, reward, this.rarity);
      this.hooks.toast(`${this.label(entry)} усмирён! +${reward} ₽`);
      this.clearMischief();
      this.rest();
    } else if (result === 'escaped') {
      this.hooks.toast(`${this.label(entry)} ушёл за борт!`);
      this.shake = 0.16;
      this.clearMischief();
      this.rest();
    }
  }

  /** Тап по буянящему улову: сверяем экранные координаты с его проекцией. */
  private tapMischief(screenX: number, screenY: number): boolean {
    const view = this.mischiefView;
    const act = this.mischief;
    if (!view || !act) return false;

    const projected = view.group.position.clone().project(this.camera);
    const x = ((projected.x + 1) / 2) * this.viewportWidth;
    const y = ((1 - projected.y) / 2) * this.viewportHeight;
    const reach = Math.max(70, this.viewportWidth * 0.22);
    if (Math.hypot(screenX - x, screenY - y) > reach) return false;
    return act.tap();
  }

  private viewportWidth = 1;
  private viewportHeight = 1;

  setViewport(width: number, height: number): void {
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.resize(width, height);
  }

  // --- служебное -----------------------------------------------------------

  private rodTip(): Vector3 {
    this.tipWorld.copy(this.hands.tipLocal);
    return this.camera.localToWorld(this.tipWorld.clone());
  }

  private applyLook(): void {
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }

  private shakeOffset(): number {
    return this.shake > 0.005 ? (Math.random() - 0.5) * this.shake : 0;
  }

  private rewardFor(fight: FightSystem): number {
    return Math.max(1, Math.round(fight.reward(this.trickShot) * rarityPrice(this.rarity)));
  }

  private label(entry: CatchEntry): string {
    const name = entryName(entry);
    if (this.rarity === 'gold') return `Золотой ${name.toLowerCase()}`;
    if (this.rarity === 'rare') return `Редкий ${name.toLowerCase()}`;
    return name;
  }

  private dropHooked(): void {
    if (!this.hooked) return;
    this.scene.remove(this.hooked.group);
    this.hooked.dispose();
    this.hooked = null;
  }

  private clearMischief(): void {
    if (this.mischiefView) {
      this.scene.remove(this.mischiefView.group);
      this.mischiefView.dispose();
      this.mischiefView = null;
    }
    this.mischief = null;
  }

  private rest(): void {
    this.state = 'idle';
    this.fight = null;
    this.hookedEntry = null;
    this.charging = false;
    this.showcaseTimer = 0;
    this.leapTimer = 0;
    this.leapCooldown = LEAP_COOLDOWN;
    this.power = 0;
    const tip = this.rodTip();
    this.hook.reset(tip);
    this.line.reset(tip);
    this.line.setTint(0xffffff);
  }

  // --- метрики -------------------------------------------------------------

  get chargePower(): number {
    return this.charging ? this.power : 0;
  }

  get debugSnapshot(): {
    state: CastState;
    tension: number;
    stamina: number;
    patience: number;
    depth: number;
    onHook: string;
    rarity: Rarity;
  } {
    return {
      state: this.state,
      depth: this.hook.depthMeters,
      tension: this.fight?.tensionRatio ?? 0,
      stamina: this.fight?.stamina ?? 1,
      patience: this.mischief?.patience ?? (this.fight?.patienceLeft ?? 1),
      onHook: this.hookedEntry ? entryName(this.hookedEntry) : '',
      rarity: this.rarity,
    };
  }

  get metrics(): [string, string][] {
    const rows: [string, string][] = [
      ['состояние', this.state],
      ['глубина', `${this.hook.depthMeters.toFixed(1)} м`],
      ['предел', `${Math.min(this.hooks.effects().maxLineM, this.hooks.zoneDepth())} м`],
    ];
    if (this.charging) rows.push(['заброс', this.power.toFixed(2)]);
    if (this.fight && this.state === 'fighting') {
      rows.push([this.isBossFight ? 'БОСС' : 'на крючке', this.debugSnapshot.onHook]);
      rows.push(['натяжение', this.fight.tensionRatio.toFixed(2)]);
      rows.push(['силы рыбы', this.fight.stamina.toFixed(2)]);
      if (this.isBossFight) rows.push(['фаза', String(this.fight.phase + 1)]);
    } else if (this.mischief) {
      rows.push(['в лодке', this.hookedEntry ? entryName(this.hookedEntry) : '—']);
      rows.push(['усмирение', `${Math.round(this.mischief.progress * 100)} %`]);
    } else {
      rows.push(['трюк-серия', String(this.trickStreak)]);
    }
    return rows;
  }

  dispose(): void {
    this.sky.dispose();
    this.birds.dispose();
    this.water.dispose();
    this.shore.dispose();
    this.pier.dispose();
    this.ambient.dispose();
    this.splash.dispose();
    this.hands.dispose();
    this.line.dispose();
    this.hook.dispose();
  }
}

function tensionTint(tension: number): number {
  const t = clamp(tension, 0, 1);
  return (255 << 16) | (Math.round(255 - t * 190) << 8) | Math.round(255 - t * 215);
}

/** Пока не используется, но damp понадобится для плавной камеры боя. */
void damp;
void shoreHeight;
