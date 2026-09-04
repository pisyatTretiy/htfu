import { Container } from 'pixi.js';
import { CatchView } from './CatchView';
import { Rng } from '../core/Rng';
import { clamp } from '../core/world';
import type { CatchEntry } from '../content/types';

export type MischiefResult = 'active' | 'subdued' | 'escaped';

export interface Area {
  x: number;
  y: number;
  halfWidth: number;
  height: number;
}

/** Сколько раз нужно попасть по существу, чтобы усмирить. */
const TAPS_TO_SUBDUE = 3;
/** Базовое время на усмирение. Подсак его увеличивает. */
const BASE_PATIENCE = 7;
/** Пауза между пакостями. */
const PRANK_EVERY = 1.7;

/** К какой ширине приводится улов, пока он в лодке. */
const BOARD_SIZE = 96;
const GRAVITY = 1100;
const BOUNCE = 0.68;

const PRANKS: Record<string, string[]> = {
  flop: ['{name} сшиб ведро!', '{name} прыгает по всей лодке!', '{name} опрокинул снасти!'],
  grab: ['{name} вцепился в удочку!', '{name} не отпускает катушку!', '{name} жуёт леску!'],
  steal: ['{name} утащил наживку!', '{name} выкинул улов за борт!', '{name} лезет в ящик!'],
};

/**
 * Улов буянит в лодке — носитель юмора № 2 из ADR-0003.
 *
 * Это замена «добить существо» из оригинала: вытащенное не оценивается
 * формулой, а действует, и игрок должен успеть его усмирить.
 */
export class MischiefAct {
  readonly view = new Container();

  x = 0;
  y = 0;
  private vx = 0;
  private vy = 0;
  private taps = 0;
  private timer = 0;
  private prankTimer = PRANK_EVERY;
  private result: MischiefResult = 'active';

  private readonly catchView: CatchView;
  private readonly rng: Rng;
  private readonly scale: number;
  /** Убытки от пакостей — вычитаются из награды. */
  damage = 0;

  private readonly patienceSeconds: number;

  constructor(
    private readonly entry: CatchEntry,
    seed: number,
    patienceSeconds = BASE_PATIENCE,
  ) {
    this.patienceSeconds = patienceSeconds > 0 ? patienceSeconds : BASE_PATIENCE;
    this.rng = new Rng(seed);
    this.catchView = new CatchView(entry);
    // В лодке улов ужимается: рыба крупнее лодки — шутка, но лодку она при
    // этом закрывает целиком, и сцена перестаёт читаться.
    this.scale = clamp(BOARD_SIZE / this.catchView.size, 0.5, 1);
    this.catchView.view.scale.set(this.scale);
    this.view.addChild(this.catchView.view);
  }

  get progress(): number {
    return this.taps / TAPS_TO_SUBDUE;
  }

  /** Сколько терпения осталось, 0..1 — рисуется полоской над лодкой. */
  get patience(): number {
    return clamp(1 - this.timer / this.patienceSeconds, 0, 1);
  }

  start(area: Area): void {
    this.x = area.x;
    this.y = area.y - area.height * 0.5;
    this.vx = this.rng.range(-120, 120);
    this.vy = -this.rng.range(120, 260);
  }

  /** Попадание пальцем. @returns было ли попадание */
  tap(worldX: number, worldY: number): boolean {
    if (this.result !== 'active') return false;
    const reach = this.catchView.size * this.scale * 0.6;
    if (Math.hypot(worldX - this.x, worldY - this.y) > reach) return false;

    this.taps += 1;
    // Подпрыгивает от каждого удара — иначе не читается, что попал.
    this.vy = -this.rng.range(160, 300);
    this.vx = this.rng.range(-180, 180);
    if (this.taps >= TAPS_TO_SUBDUE) this.result = 'subdued';
    return true;
  }

  /** @returns текст пакости, если она случилась в этот шаг */
  step(dt: number, area: Area): { result: MischiefResult; prank: string | null } {
    if (this.result !== 'active') return { result: this.result, prank: null };

    this.timer += dt;
    if (this.timer >= this.patienceSeconds) {
      this.result = 'escaped';
      return { result: this.result, prank: null };
    }

    this.vy += GRAVITY * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const floor = area.y;
    const ceiling = area.y - area.height;
    if (this.y > floor) {
      this.y = floor;
      this.vy = -Math.abs(this.vy) * BOUNCE;
      this.vx += this.rng.range(-90, 90);
      if (Math.abs(this.vy) < 60) this.vy = -this.rng.range(180, 320);
    }
    if (this.y < ceiling) {
      this.y = ceiling;
      this.vy = Math.abs(this.vy) * BOUNCE;
    }
    if (this.x < area.x - area.halfWidth) {
      this.x = area.x - area.halfWidth;
      this.vx = Math.abs(this.vx) * BOUNCE;
    }
    if (this.x > area.x + area.halfWidth) {
      this.x = area.x + area.halfWidth;
      this.vx = -Math.abs(this.vx) * BOUNCE;
    }

    let prank: string | null = null;
    this.prankTimer -= dt;
    if (this.prankTimer <= 0) {
      this.prankTimer = PRANK_EVERY;
      prank = this.pickPrank();
      if (this.entry.mischief === 'steal') this.damage += 0.18;
    }

    return { result: this.result, prank };
  }

  render(dt: number): void {
    this.view.x = this.x;
    this.view.y = this.y;
    this.view.rotation = Math.atan2(this.vy, this.vx) * 0.35;
    this.catchView.update(dt, clamp(Math.hypot(this.vx, this.vy) / 400, 0.2, 1));
  }

  private pickPrank(): string | null {
    const lines = PRANKS[this.entry.mischief];
    if (!lines || lines.length === 0) return null;
    return this.rng.pick(lines).replace('{name}', this.entry.name);
  }
}
