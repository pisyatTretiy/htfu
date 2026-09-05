import { Color, Group, Vector3 } from 'three';
import { createCatchView, type CatchView } from './CatchView3D';
import { Rng } from '../core/Rng';
import { CATCH_ENTRIES } from '../content/catalog';
import type { CatchEntry } from '../content/types';

interface Swimmer {
  view: CatchView;
  entryId: string;
  radius: number;
  speed: number;
  phase: number;
  depth: number;
  centerX: number;
  centerZ: number;
  /** Пока больше нуля — рыба на крючке или отходит от испуга. */
  gone: number;
}

/** На сколько метров от крючка рыба его замечает. */
export const LURE_RADIUS = 2.6;
/** С какого расстояния рыба уже подсвечена: игрок видит, на кого наводится. */
export const NOTICE_RADIUS = 5.5;
/** Сколько секунд стая не возвращается на место пойманной рыбы. */
const RESPAWN_DELAY = 9;

/**
 * Рыба, плавающая сама по себе под поверхностью.
 *
 * Без неё вода — пустая плоскость: игрок забрасывает крючок в никуда и не
 * верит, что там кто-то есть. Это чистая декорация, на клёв она не влияет —
 * что клюнет, решает пул заброса.
 */
export class AmbientFish3D {
  readonly group = new Group();

  private readonly swimmers: Swimmer[] = [];
  private tint = '#1e3752';
  private time = 0;
  private highlighted = -1;

  constructor(private readonly count = 7) {
    this.populate(CATCH_ENTRIES.filter((entry) => entry.kind === 'fish').map((e) => e.id));
  }

  /**
   * Заселить воду видами локации.
   *
   * Раньше стая набиралась из всего каталога: у причала плавала глубоководная
   * рыба, поймать которую там невозможно. Теперь в воде видно ровно то, что
   * в ней ловится, — иначе прицеливание по рыбе было бы обманом.
   */
  setZone(catchIds: readonly string[], tint: string): void {
    this.tint = tint;
    const fish = catchIds.filter((id) => {
      const entry = CATCH_ENTRIES.find((candidate) => candidate.id === id);
      return entry?.kind === 'fish';
    });
    this.populate(fish.length > 0 ? fish : CATCH_ENTRIES.filter((e) => e.kind === 'fish').map((e) => e.id));
  }

  private populate(ids: readonly string[]): void {
    for (const swimmer of this.swimmers) {
      this.group.remove(swimmer.view.group);
      swimmer.view.dispose();
    }
    this.swimmers.length = 0;

    const rng = new Rng(1337);
    for (let i = 0; i < this.count; i++) {
      const id = ids[rng.int(0, ids.length - 1)] as string;
      const entry = CATCH_ENTRIES.find((candidate) => candidate.id === id) as CatchEntry;
      const view = createCatchView(entry);
      view.group.scale.setScalar(rng.range(0.7, 1.4));
      this.group.add(view.group);
      this.swimmers.push({
        view,
        entryId: entry.id,
        radius: rng.range(4, 13),
        speed: rng.range(0.1, 0.28) * (rng.next() > 0.5 ? 1 : -1),
        phase: rng.range(0, Math.PI * 2),
        // Глубже, чем кажется нужным: на -0.7 рыбу выносило волной на
        // поверхность, и она выглядела плавающей поверх воды.
        depth: rng.range(-9, -1.4),
        centerX: rng.range(-14, 14),
        centerZ: rng.range(-30, -6),
        gone: 0,
      });
    }
    this.shade();
  }

  /**
   * Ближайшая к крючку рыба. По ней решается, кто клюнет: игрок наводит
   * крючок на видимую рыбу, и клюёт именно она.
   */
  nearest(point: Vector3, radius = LURE_RADIUS): { entryId: string; index: number } | null {
    let best: { entryId: string; index: number } | null = null;
    let bestDistance = radius;

    for (let i = 0; i < this.swimmers.length; i++) {
      const swimmer = this.swimmers[i];
      if (!swimmer || swimmer.gone > 0) continue;
      const distance = swimmer.view.group.position.distanceTo(point);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { entryId: swimmer.entryId, index: i };
      }
    }
    return best;
  }

  /** Рыба ушла на крючок: убираем её из стаи и возвращаем через паузу. */
  take(index: number): void {
    const swimmer = this.swimmers[index];
    if (!swimmer) return;
    swimmer.gone = RESPAWN_DELAY;
    swimmer.view.group.visible = false;
    this.highlight(-1);
  }

  /**
   * Подсветить рыбу, на которую наведён крючок.
   *
   * Без этого механика наведения невидима: рыба клюёт «сама», и игрок не
   * связывает клёв со своим движением. Подсвеченная рыба — это обещание.
   */
  highlight(index: number): void {
    if (index === this.highlighted) return;
    this.highlighted = index;
    this.shade();
  }

  private shade(): void {
    const color = new Color(this.tint);
    for (let i = 0; i < this.swimmers.length; i++) {
      const swimmer = this.swimmers[i];
      if (!swimmer) continue;
      const depth = Math.min(0.72, Math.max(0.18, -swimmer.depth / 9));
      // Замеченная рыба почти не уходит в цвет воды — она будто вышла на свет.
      swimmer.view.shade(color, i === this.highlighted ? depth * 0.25 : depth);
    }
  }

  update(dt: number): void {
    this.time += dt;
    for (const swimmer of this.swimmers) {
      if (swimmer.gone > 0) {
        swimmer.gone -= dt;
        if (swimmer.gone > 0) continue;
        // Вернулась — но в другом месте: стая не стоит на одной карусели.
        swimmer.phase += 2.1;
        swimmer.view.group.visible = true;
      }
      const angle = this.time * swimmer.speed + swimmer.phase;
      const x = swimmer.centerX + Math.cos(angle) * swimmer.radius;
      const z = swimmer.centerZ + Math.sin(angle) * swimmer.radius;
      // Лёгкое всплытие и погружение: рыба не ездит по рельсам.
      const y = swimmer.depth + Math.sin(this.time * 0.5 + swimmer.phase) * 0.3;

      swimmer.view.group.position.set(x, y, z);
      swimmer.view.group.rotation.y = -angle + (swimmer.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
      swimmer.view.update(dt, 0.25);
    }
  }

  dispose(): void {
    for (const swimmer of this.swimmers) swimmer.view.dispose();
  }
}
