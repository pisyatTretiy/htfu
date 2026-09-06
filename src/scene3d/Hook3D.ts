import { Color, Mesh, MeshLambertMaterial, Object3D, SphereGeometry, Vector3 } from 'three';
import { UNITS_PER_M, damp } from '../core/world';

const GRAVITY_AIR = 9.8;
const AIR_DRAG = 0.12;
const WATER_DRAG = 1.5;
const STEER = 3.2;

/**
 * Скорость погружения: у поверхности медленная, с глубиной растёт.
 *
 * Постоянная скорость не годится ни при каком значении. Медленная — и двести
 * пятьдесят метров нижней локации превращаются в две минуты ожидания на один
 * заброс. Быстрая — и стая в верхних метрах пролетает мимо за полсекунды,
 * навести на неё крючок невозможно. Поэтому скорость линейно растёт от
 * глубины: у поверхности есть время выцелить рыбу, ниже грузило разгоняется.
 */
const SINK_SURFACE_MPS = 3;
const SINK_GAIN = 0.25;

/** Скорость погружения на данной глубине, м/с. */
export function sinkSpeedMps(depthMeters: number): number {
  return SINK_SURFACE_MPS + Math.max(0, depthMeters) * SINK_GAIN;
}

/**
 * Сколько секунд грузило падает до заданной глубины. Считается тем же
 * профилем, что и в шаге, — тест держит за него время ожидания на забросе.
 */
export function sinkSecondsTo(depthMeters: number): number {
  const step = 0.05;
  let seconds = 0;
  for (let depth = 0; depth < depthMeters; depth += step) {
    seconds += step / sinkSpeedMps(depth);
  }
  return seconds;
}

/**
 * Крючок с поплавком. Над водой — баллистика, под водой — погружение с
 * сопротивлением. Физдвижок не нужен: контактов между телами нет.
 */
export class Hook3D {
  readonly object = new Object3D();
  readonly position = new Vector3();
  readonly velocity = new Vector3();

  submerged = false;
  /** Снос от свайпа во время погружения, в плоскости камеры. */
  steer = new Vector3();

  private readonly bobber: Mesh;

  constructor() {
    this.bobber = new Mesh(
      new SphereGeometry(0.09, 12, 10),
      new MeshLambertMaterial({ color: new Color('#ff5f4d') }),
    );
    const weight = new Mesh(
      new SphereGeometry(0.05, 10, 8),
      new MeshLambertMaterial({ color: new Color('#2a3b42') }),
    );
    weight.position.y = -0.14;
    this.bobber.castShadow = true;
    this.object.add(this.bobber, weight);
  }

  get depthMeters(): number {
    return Math.max(0, -this.position.y) / UNITS_PER_M;
  }

  reset(at: Vector3): void {
    this.position.copy(at);
    this.velocity.set(0, 0, 0);
    this.steer.set(0, 0, 0);
    this.submerged = false;
    this.sync();
  }

  /** Заброс вдоль взгляда: сила 0..1 из шкалы. */
  cast(direction: Vector3, power: number): void {
    const speed = 7 + power * 24;
    this.velocity.copy(direction).normalize().multiplyScalar(speed);
    // Небольшой подброс: снасть должна лететь дугой, а не по прямой.
    this.velocity.y += 3.5 + power * 4;
    this.submerged = false;
  }

  /** @returns true, если крючок вошёл в воду именно в этот шаг */
  step(dt: number, surfaceY: number): boolean {
    const wasSubmerged = this.submerged;

    if (this.submerged) {
      this.velocity.addScaledVector(this.steer, STEER * dt);
      // Течение локации: сносит крючок вбок, пока он тонет, и вести его
      // приходится против сноса — это и есть особенность бухты.
      this.velocity.x += this.current * dt;
      // Сопротивление гасит только снос: вертикаль задаётся профилем ниже,
      // иначе разгон по глубине тут же съедался бы этим же множителем.
      const drag = Math.exp(-WATER_DRAG * dt);
      this.velocity.x *= drag;
      this.velocity.z *= drag;
      const sink = sinkSpeedMps(this.depthMeters) * UNITS_PER_M;
      this.velocity.y = damp(this.velocity.y, -sink, 0.02, dt);
    } else {
      this.velocity.y -= GRAVITY_AIR * dt;
      this.velocity.multiplyScalar(Math.exp(-AIR_DRAG * dt));
    }

    this.position.addScaledVector(this.velocity, dt);
    this.submerged = this.position.y < surfaceY;
    this.sync();
    return !wasSubmerged && this.submerged;
  }

  /** Подмотка к вершинке удилища. @returns дошёл ли крючок */
  /** Сила бокового течения локации. Ноль — спокойная вода. */
  current = 0;

  /** Рабочий вектор подмотки: считается каждый кадр, аллокация не нужна. */
  private readonly scratch = new Vector3();

  reelTo(target: Vector3, speed: number, dt: number): boolean {
    const delta = this.scratch.copy(target).sub(this.position);
    const distance = delta.length();
    if (distance < 0.2) return true;

    this.position.addScaledVector(delta.normalize(), Math.min(distance, speed * dt));
    this.velocity.set(0, 0, 0);
    this.submerged = this.position.y < 0;
    this.sync();
    return false;
  }

  private sync(): void {
    this.object.position.copy(this.position);
  }

  dispose(): void {
    this.object.clear();
  }
}
