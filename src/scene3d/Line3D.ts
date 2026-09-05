import {
  BufferAttribute,
  BufferGeometry,
  Camera,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Vector3,
} from 'three';

const SEGMENTS = 24;
const ITERATIONS = 6;
/** Провис в покое. Под натяжением леска выпрямляется — иначе висит петлёй. */
const SLACK_LOOSE = 1.11;
const SLACK_TAUT = 1.002;
const GRAVITY = 3.2;
const DRAG = 1.4;
const THICKNESS = 0.018;

interface RopePoint {
  now: Vector3;
  prev: Vector3;
}

/**
 * Леска в трёх измерениях. Та же верле-цепочка, что и в 2D: оба конца
 * закреплены (вершинка удилища и крючок), провисает только середина.
 *
 * Рисуется лентой из квадов, развёрнутой к камере: THREE.Line игнорирует
 * толщину почти везде, а тонкая леска в 3D иначе просто не видна.
 */
export class Line3D {
  // Рабочие векторы разворота ленты: render зовётся каждый кадр.
  private readonly toCamera = new Vector3();
  private readonly along = new Vector3();
  private readonly side = new Vector3();

  readonly mesh: Mesh;

  private readonly points: RopePoint[] = [];
  private readonly geometry = new BufferGeometry();
  private readonly positions = new Float32Array(SEGMENTS * 2 * 3);
  private readonly material: MeshBasicMaterial;
  private restLength = 0.2;

  /** Натяжение 0..1 — по нему сцена красит леску к обрыву. */
  tension = 0;

  constructor() {
    for (let i = 0; i < SEGMENTS; i++) {
      this.points.push({ now: new Vector3(), prev: new Vector3() });
    }

    const indices: number[] = [];
    for (let i = 0; i < SEGMENTS - 1; i++) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setIndex(indices);

    this.material = new MeshBasicMaterial({
      color: new Color('#ffffff'),
      side: DoubleSide,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 20;
  }

  setTint(color: number): void {
    this.material.color.setHex(color);
  }

  reset(at: Vector3): void {
    for (const point of this.points) {
      point.now.copy(at);
      point.prev.copy(at);
    }
    this.tension = 0;
  }

  step(dt: number, from: Vector3, to: Vector3, maxLength: number): void {
    const span = from.distanceTo(to);
    this.tension = maxLength > 0 ? Math.min(1, span / maxLength) : 0;
    // Чем сильнее натянута, тем меньше провис: натянутая леска — прямая линия.
    const slack = SLACK_LOOSE + (SLACK_TAUT - SLACK_LOOSE) * Math.min(1, this.tension * 1.6);
    const deployed = Math.min(span * slack, maxLength);
    this.restLength = deployed / (SEGMENTS - 1);

    const damping = Math.exp(-DRAG * dt);
    for (const point of this.points) {
      const vx = (point.now.x - point.prev.x) * damping;
      const vy = (point.now.y - point.prev.y) * damping;
      const vz = (point.now.z - point.prev.z) * damping;
      point.prev.copy(point.now);
      point.now.x += vx;
      point.now.y += vy - GRAVITY * dt * dt;
      point.now.z += vz;
    }

    for (let iteration = 0; iteration < ITERATIONS; iteration++) {
      this.points[0]?.now.copy(from);
      this.points[this.points.length - 1]?.now.copy(to);
      this.solve();
    }
    this.points[0]?.now.copy(from);
    this.points[this.points.length - 1]?.now.copy(to);
  }

  private solve(): void {
    for (let i = 0; i < this.points.length - 1; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      if (!a || !b) continue;

      const dx = b.now.x - a.now.x;
      const dy = b.now.y - a.now.y;
      const dz = b.now.z - a.now.z;
      const distance = Math.hypot(dx, dy, dz) || 0.0001;
      const correction = (distance - this.restLength) / distance / 2;

      a.now.x += dx * correction;
      a.now.y += dy * correction;
      a.now.z += dz * correction;
      b.now.x -= dx * correction;
      b.now.y -= dy * correction;
      b.now.z -= dz * correction;
    }
  }

  /** Разворачиваем ленту к камере: иначе леска исчезает при взгляде вдоль неё. */
  render(camera: Camera): void {
    const toCamera = this.toCamera;
    const along = this.along;
    const side = this.side;

    for (let i = 0; i < this.points.length; i++) {
      const current = this.points[i]?.now;
      const next = this.points[Math.min(i + 1, this.points.length - 1)]?.now;
      const previous = this.points[Math.max(i - 1, 0)]?.now;
      if (!current || !next || !previous) continue;

      along.subVectors(next, previous);
      if (along.lengthSq() < 1e-8) along.set(0, 1, 0);
      toCamera.subVectors(camera.position, current);
      side.crossVectors(along, toCamera).normalize().multiplyScalar(THICKNESS);

      const base = i * 6;
      this.positions[base] = current.x - side.x;
      this.positions[base + 1] = current.y - side.y;
      this.positions[base + 2] = current.z - side.z;
      this.positions[base + 3] = current.x + side.x;
      this.positions[base + 4] = current.y + side.y;
      this.positions[base + 5] = current.z + side.z;
    }

    const attribute = this.geometry.getAttribute('position') as BufferAttribute;
    attribute.needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
