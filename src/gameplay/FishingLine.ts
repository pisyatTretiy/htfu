import { MeshRope, type PointData, type Texture } from 'pixi.js';

const SEGMENTS = 26;
const ITERATIONS = 6;
/** Провис лески: сегменты чуть длиннее прямой между концами. */
const SLACK = 1.07;
const GRAVITY = 160;
const DRAG = 1.4;

interface RopePoint extends PointData {
  x: number;
  y: number;
  px: number;
  py: number;
}

/**
 * Леска — верле-цепочка между вершинкой удилища и крючком.
 *
 * Оба конца закреплены: удилище и крючок считаются снаружи, леска только
 * провисает между ними. Это подача, а не источник истины — исход боя она не
 * решает (docs/adr/0001-stack.md, § 2.1).
 */
export class FishingLine {
  readonly view: MeshRope;

  private readonly points: RopePoint[] = [];
  /** Длина сегмента в покое, пересчитывается под текущее расстояние. */
  private restLength = 4;
  /** Натяжение 0..1: 1 — леска вытянута в струну. */
  tension = 0;

  constructor(texture: Texture) {
    for (let i = 0; i < SEGMENTS; i++) {
      this.points.push({ x: 0, y: 0, px: 0, py: 0 });
    }
    this.view = new MeshRope({ texture, points: this.points });
    this.view.blendMode = 'normal';
  }

  /** Схлопнуть леску в одну точку — состояние покоя до заброса. */
  reset(x: number, y: number): void {
    for (const point of this.points) {
      point.x = x;
      point.y = y;
      point.px = x;
      point.py = y;
    }
    this.tension = 0;
  }

  /**
   * Шаг симуляции с фиксированным dt.
   * @param maxLength максимальная длина размотанной лески в пикселях
   */
  step(
    dt: number,
    from: { x: number; y: number },
    to: { x: number; y: number },
    maxLength: number,
  ): void {
    const span = Math.hypot(to.x - from.x, to.y - from.y);
    const deployed = Math.min(span * SLACK, maxLength);
    this.restLength = deployed / (SEGMENTS - 1);
    this.tension = maxLength > 0 ? Math.min(1, span / maxLength) : 0;

    const damping = Math.exp(-DRAG * dt);
    for (const point of this.points) {
      const vx = (point.x - point.px) * damping;
      const vy = (point.y - point.py) * damping;
      point.px = point.x;
      point.py = point.y;
      point.x += vx;
      point.y += vy + GRAVITY * dt * dt;
    }

    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      this.pin(0, from);
      this.pin(this.points.length - 1, to);
      this.solve();
    }
    this.pin(0, from);
    this.pin(this.points.length - 1, to);
  }

  private pin(index: number, target: { x: number; y: number }): void {
    const point = this.points[index];
    if (!point) return;
    point.x = target.x;
    point.y = target.y;
  }

  private solve(): void {
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      if (!a || !b) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distance = Math.hypot(dx, dy) || 0.0001;
      const correction = (distance - this.restLength) / distance / 2;
      const ox = dx * correction;
      const oy = dy * correction;

      a.x += ox;
      a.y += oy;
      b.x -= ox;
      b.y -= oy;
    }
  }
}
