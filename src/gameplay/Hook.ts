import { Container, Graphics } from 'pixi.js';
import { clamp, pxToMeters } from '../core/world';

/** Куда летит крючок при забросе: вправо и вверх. */
const CAST_ANGLE = 1.02;
const CAST_SPEED_MIN = 420;
const CAST_SPEED_MAX = 1560;

const GRAVITY_AIR = 1500;
/** Вес грузила за вычетом выталкивающей силы. */
const GRAVITY_WATER = 210;
const AIR_DRAG = 0.16;
const WATER_DRAG = 1.9;
/** Ускорение от свайпа влево-вправо во время погружения. */
const STEER_ACCEL = 1100;

/**
 * Крючок с грузилом — точечная масса. Над водой летит по баллистике,
 * под водой тонет с сопротивлением и слушается свайпов.
 *
 * Физика честная, но простая: контактов между телами здесь нет, поэтому
 * физдвижок не нужен (см. docs/adr/0001-stack.md, § 2).
 */
export class Hook {
  readonly view = new Container();

  x = 0;
  y = 0;
  vx = 0;
  vy = 0;

  /** Крючок ниже уровня воды. */
  submerged = false;
  /** Свайп игрока по горизонтали: -1 влево, +1 вправо. */
  steer = 0;

  constructor() {
    const body = new Graphics();
    body.circle(0, 0, 4.5).fill({ color: 0x1a2b30 });
    body.circle(-1.2, -1.2, 1.6).fill({ color: 0x9fd8cf, alpha: 0.8 });
    // Жало крючка — короткая дуга под грузилом.
    body.moveTo(0, 4).lineTo(0, 10).stroke({ width: 1.6, color: 0xb9cfd2 });
    body.arc(-3, 10, 3, 0, Math.PI).stroke({ width: 1.6, color: 0xb9cfd2 });
    this.view.addChild(body);
  }

  get depthMeters(): number {
    return Math.max(0, pxToMeters(this.y));
  }

  get speed(): number {
    return Math.hypot(this.vx, this.vy);
  }

  reset(x: number, y: number): void {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.steer = 0;
    this.submerged = false;
  }

  /** Заброс: сила 0..1 из шкалы, направление фиксировано. */
  cast(power: number): void {
    const speed = CAST_SPEED_MIN + clamp(power, 0, 1) * (CAST_SPEED_MAX - CAST_SPEED_MIN);
    this.vx = Math.cos(CAST_ANGLE) * speed;
    this.vy = -Math.sin(CAST_ANGLE) * speed;
    this.submerged = false;
  }

  /** Шаг симуляции. Вызывается с фиксированным dt из FishingScene. */
  step(dt: number, bounds: { left: number; right: number }): boolean {
    const wasSubmerged = this.submerged;

    if (this.submerged) {
      this.vy += GRAVITY_WATER * dt;
      this.vx += this.steer * STEER_ACCEL * dt;
      const drag = Math.exp(-WATER_DRAG * dt);
      this.vx *= drag;
      this.vy *= drag;
    } else {
      this.vy += GRAVITY_AIR * dt;
      const drag = Math.exp(-AIR_DRAG * dt);
      this.vx *= drag;
      this.vy *= drag;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.x = clamp(this.x, bounds.left, bounds.right);
    this.submerged = this.y > 0;

    // true — именно в этот шаг крючок вошёл в воду.
    return !wasSubmerged && this.submerged;
  }

  /** Подмотка: тянем крючок к вершинке удилища. */
  reelTo(targetX: number, targetY: number, speed: number, dt: number): boolean {
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 8) return true;

    const move = Math.min(distance, speed * dt);
    this.x += (dx / distance) * move;
    this.y += (dy / distance) * move;
    this.vx = 0;
    this.vy = 0;
    this.submerged = this.y > 0;
    return false;
  }

  syncView(): void {
    this.view.x = this.x;
    this.view.y = this.y;
    this.view.rotation = Math.atan2(this.vy, this.vx) - Math.PI / 2;
  }
}
