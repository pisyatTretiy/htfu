import {
  Container,
  DisplacementFilter,
  Graphics,
  Sprite,
  Texture,
  TilingSprite,
} from 'pixi.js';
import { Rng } from '../core/Rng';
import type { QualityProfile } from '../core/Quality';
import {
  causticsTexture,
  godrayTexture,
  gradientTexture,
  kelpTexture,
  radialTexture,
  rockTexture,
} from '../fx/textures';

import { clamp, LIGHT_DEPTH_M, MAX_DEPTH_M, PX_PER_M } from '../core/world';

const WORLD_H = MAX_DEPTH_M * PX_PER_M;

interface ParallaxLayer {
  view: Container;
  /** Множитель параллакса: <1 — слой отстаёт от камеры, >1 — обгоняет. */
  factor: number;
}

interface Placed {
  sprite: Sprite;
  /** Позиция по горизонтали в долях ширины экрана — пересчитывается на resize. */
  xRatio: number;
}

interface Mote {
  sprite: Sprite;
  x: number;
  y: number;
  speed: number;
}

interface Ray {
  sprite: Sprite;
  phase: number;
  xRatio: number;
}

/**
 * День 1 спайка: вертикальный разрез воды.
 *
 * Проверяем то, что заявлено в ADR-0001, § 4: параллакс, каустики, лучи света,
 * тонирование по глубине и преломление у поверхности — причём всё на
 * аддитивных спрайтах, а полноэкранный фильтр только один и только на десктопе.
 */
export class WaterScene {
  readonly root = new Container();

  /** Слой игровых объектов: лодка, удилище, леска, крючок. Едет с камерой. */
  readonly gameplay = new Container();

  /** Текущая глубина камеры в метрах. Задаётся снаружи. */
  depth = 0;

  private readonly world = new Container();
  private readonly sky = new Container();
  private readonly column = new Container();
  private readonly causticsHolder = new Container();
  private readonly godrayHolder = new Container();
  private readonly moteHolder = new Container();
  private readonly wave = new Graphics();

  private readonly layers: ParallaxLayer[] = [];
  private readonly placed: Placed[] = [];
  private readonly rays: Ray[] = [];
  private readonly motes: Mote[] = [];

  private readonly skySprite: Sprite;
  private readonly sunSprite: Sprite;
  private readonly waterSprite: Sprite;
  private readonly caustics: TilingSprite;
  private readonly tint: Sprite;
  private readonly displacement: Sprite | null = null;

  private width = 1;
  private height = 1;
  private time = 0;
  private lastDepth = 0;
  private depthSpeed = 0;

  constructor(private readonly quality: QualityProfile) {
    const rng = new Rng(20260904);

    // --- небо над водой ---
    this.skySprite = new Sprite(
      gradientTexture([
        { at: 0, color: '#8fd3e8' },
        { at: 0.62, color: '#bfe6ec' },
        { at: 1, color: '#dcf1ee' },
      ]),
    );
    this.sunSprite = new Sprite(radialTexture(512, 'rgba(255,247,205,0.8)', 2.2));
    this.sunSprite.anchor.set(0.5);
    this.sunSprite.blendMode = 'add';
    this.sky.addChild(this.skySprite, this.sunSprite);

    // --- вода: одна градиентная колонна на всю глубину мира ---
    this.waterSprite = new Sprite(
      gradientTexture([
        { at: 0, color: '#2ea7a0' },
        { at: 0.06, color: '#17888a' },
        { at: 0.16, color: '#0e5f6b' },
        { at: 0.36, color: '#093a49' },
        { at: 0.64, color: '#051d29' },
        { at: 1, color: '#010a10' },
      ]),
    );
    this.column.addChild(this.waterSprite);

    // --- параллакс: дальние силуэты, средние скалы, ближние водоросли ---
    const far = this.makeLayer(0.55);
    const mid = this.makeLayer(0.8);
    const near = this.makeLayer(1.18);

    for (let i = 0; i < 7; i++) {
      const rock = new Sprite(rockTexture(rng.int(420, 900), rng.int(180, 340), 100 + i, '#04222c'));
      rock.alpha = 0.55;
      rock.y = (18 + i * 32 + rng.range(-6, 6)) * PX_PER_M;
      far.view.addChild(rock);
      this.placed.push({ sprite: rock, xRatio: rng.range(-0.15, 0.75) });
    }

    for (let i = 0; i < 6; i++) {
      const rock = new Sprite(rockTexture(rng.int(260, 560), rng.int(140, 280), 200 + i, '#021620'));
      rock.alpha = 0.8;
      rock.y = (30 + i * 38 + rng.range(-8, 8)) * PX_PER_M;
      mid.view.addChild(rock);
      this.placed.push({ sprite: rock, xRatio: rng.range(-0.1, 0.85) });
    }

    for (let i = 0; i < 9; i++) {
      const kelp = new Sprite(kelpTexture(rng.int(220, 460), 300 + i, '#010e14'));
      kelp.anchor.set(0.5, 1);
      kelp.y = (12 + i * 26 + rng.range(-5, 5)) * PX_PER_M;
      near.view.addChild(kelp);
      this.placed.push({ sprite: kelp, xRatio: rng.range(0, 1) });
    }

    // --- каустики: бесшовный аддитивный тайл, скроллится по времени ---
    this.caustics = new TilingSprite({
      texture: causticsTexture(256, 11),
      width: 64,
      height: LIGHT_DEPTH_M * PX_PER_M,
    });
    this.caustics.blendMode = 'add';
    this.causticsHolder.addChild(this.caustics);

    // Преломление у поверхности — единственный фильтр в сцене, только на десктопе.
    if (quality.filters) {
      const displacement = new Sprite(causticsTexture(256, 29));
      displacement.texture.source.addressMode = 'repeat';
      // Карта смещения не рисуется сама по себе, но должна жить в дереве сцены.
      displacement.renderable = false;
      this.displacement = displacement;
      this.causticsHolder.addChild(displacement);
      this.causticsHolder.filters = [new DisplacementFilter({ sprite: displacement, scale: 18 })];
    }

    // --- лучи света от поверхности ---
    const rayTexture = godrayTexture(128, 640);
    for (let i = 0; i < quality.godrays; i++) {
      const sprite = new Sprite(rayTexture);
      sprite.anchor.set(0.5, 0);
      sprite.blendMode = 'add';
      sprite.scale.x = rng.range(0.35, 0.8);
      this.godrayHolder.addChild(sprite);
      this.rays.push({ sprite, phase: rng.range(0, Math.PI * 2), xRatio: rng.range(0.1, 0.9) });
    }

    // --- взвесь в воде: экранный слой, поднимается навстречу погружению ---
    const moteTexture = radialTexture(32, 'rgba(210,255,250,0.9)', 2);
    for (let i = 0; i < quality.motes; i++) {
      const sprite = new Sprite(moteTexture);
      sprite.anchor.set(0.5);
      sprite.blendMode = 'add';
      sprite.alpha = rng.range(0.06, 0.3);
      sprite.scale.set(rng.range(0.08, 0.28));
      this.moteHolder.addChild(sprite);
      this.motes.push({ sprite, x: rng.next(), y: rng.next(), speed: rng.range(4, 16) });
    }

    // --- тон глубины: экранный спрайт вместо полноэкранного фильтра ---
    this.tint = new Sprite(Texture.WHITE);
    this.tint.blendMode = 'multiply';
    this.tint.tint = 0x0a2a3a;
    this.tint.alpha = 0;

    // Порядок: небо → вода → дальние → средние → каустики → лучи → ближние →
    // поверхность. Экранные слои (взвесь, тон) идут поверх мира.
    this.world.addChild(this.sky, this.column, far.view, mid.view);
    this.world.addChild(this.causticsHolder, this.godrayHolder, near.view, this.wave);
    this.world.addChild(this.gameplay);
    this.root.addChild(this.world, this.moteHolder, this.tint);
  }

  private makeLayer(factor: number): ParallaxLayer {
    const layer: ParallaxLayer = { view: new Container(), factor };
    this.layers.push(layer);
    return layer;
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;

    this.waterSprite.width = width;
    this.waterSprite.height = WORLD_H;

    this.skySprite.width = width;
    this.skySprite.height = height * 1.4;
    this.skySprite.y = -height * 1.4 + 4;
    this.sunSprite.x = width * 0.74;
    this.sunSprite.y = -height * 0.92;
    this.sunSprite.scale.set((width / 900) * 0.8);

    this.caustics.width = width;
    if (this.displacement) {
      this.displacement.width = width;
      this.displacement.height = LIGHT_DEPTH_M * PX_PER_M;
    }

    for (const { sprite, xRatio } of this.placed) sprite.x = xRatio * width;

    for (const ray of this.rays) {
      ray.sprite.x = ray.xRatio * width;
      ray.sprite.height = height * 1.6;
    }

    this.tint.width = width;
    this.tint.height = height;
  }

  /** Глубина камеры в метрах. Считается снаружи — сценой рыбалки. */
  setDepth(meters: number): void {
    this.depth = clamp(meters, 0, MAX_DEPTH_M);
  }

  /** Уровень воды в точке x с учётом волны — на нём качается лодка. */
  surfaceHeightAt(x: number): number {
    return (
      Math.sin(x * 0.012 + this.time * 1.6) * 5 + Math.sin(x * 0.031 - this.time * 2.3) * 2.5
    );
  }

  update(deltaMs: number): void {
    // Ограничение шага: вкладка возвращается из фона с deltaMs в сотни мс.
    const dt = Math.min(deltaMs, 100) / 1000;
    this.time += dt;

    this.depthSpeed = dt > 0 ? Math.abs(this.depth - this.lastDepth) / dt : 0;
    this.lastDepth = this.depth;

    const depthPx = this.depth * PX_PER_M;
    this.world.y = this.height * 0.42 - depthPx;
    for (const layer of this.layers) {
      layer.view.y = depthPx * (1 - layer.factor);
    }

    // Свет гаснет квадратично — линейное затухание читается как «выключили».
    const light = clamp(1 - this.depth / LIGHT_DEPTH_M, 0, 1);
    const lightEase = light * light;

    this.caustics.tilePosition.x = Math.sin(this.time * 0.22) * 60 + this.time * 9;
    this.caustics.tilePosition.y = this.time * 5;
    this.caustics.alpha = 0.55 * lightEase;
    this.causticsHolder.visible = light > 0.01;

    if (this.displacement) {
      this.displacement.x = Math.sin(this.time * 0.35) * 24;
      this.displacement.y = Math.cos(this.time * 0.27) * 18;
    }

    for (const ray of this.rays) {
      ray.sprite.rotation = Math.sin(this.time * 0.18 + ray.phase) * 0.06 - 0.03;
      ray.sprite.alpha = (0.16 + 0.12 * Math.sin(this.time * 0.5 + ray.phase)) * lightEase;
    }
    this.godrayHolder.visible = light > 0.01;

    this.updateMotes(dt);
    this.drawWave(light);

    const deep = clamp((this.depth - 22) / (MAX_DEPTH_M - 22), 0, 1);
    this.tint.alpha = deep * 0.78;
  }

  private updateMotes(dt: number): void {
    const drift = 6 + this.depthSpeed * 1.4;
    for (const mote of this.motes) {
      mote.y -= ((mote.speed + drift) * dt) / this.height;
      if (mote.y < -0.05) {
        mote.y = 1.05;
        mote.x = Math.random();
      }
      mote.sprite.x = mote.x * this.width + Math.sin(this.time * 0.6 + mote.speed) * 6;
      mote.sprite.y = mote.y * this.height;
    }
  }

  /** Поверхность воды: волна и подсветка под ней, перерисовка каждый кадр. */
  private drawWave(light: number): void {
    this.wave.clear();
    if (light <= 0.01) {
      this.wave.visible = false;
      return;
    }
    this.wave.visible = true;

    const segments = this.quality.waveSegments;
    const step = this.width / segments;
    const heightAt = (x: number): number => this.surfaceHeightAt(x);

    this.wave.moveTo(0, heightAt(0));
    for (let i = 1; i <= segments; i++) this.wave.lineTo(i * step, heightAt(i * step));
    this.wave.lineTo(this.width, 46);
    this.wave.lineTo(0, 46);
    this.wave.closePath();
    this.wave.fill({ color: 0xbff5ec, alpha: 0.22 * light });

    this.wave.moveTo(0, heightAt(0));
    for (let i = 1; i <= segments; i++) this.wave.lineTo(i * step, heightAt(i * step));
    this.wave.stroke({ width: 2, color: 0xe8fffb, alpha: 0.75 * light });
  }
}
