import { Group } from 'three';
import { FishView3D } from './FishView3D';
import { Rng } from '../core/Rng';
import { CATCH_ENTRIES } from '../content/catalog';
import type { CatchEntry } from '../content/types';

interface Swimmer {
  view: FishView3D;
  radius: number;
  speed: number;
  phase: number;
  depth: number;
  centerX: number;
  centerZ: number;
}

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
  private time = 0;

  constructor(count = 7) {
    const rng = new Rng(1337);
    const species = CATCH_ENTRIES.filter((entry) => entry.kind === 'fish');

    for (let i = 0; i < count; i++) {
      const entry = species[rng.int(0, species.length - 1)] as CatchEntry;
      const view = new FishView3D(entry);
      view.group.scale.setScalar(rng.range(0.7, 1.4));
      this.group.add(view.group);
      this.swimmers.push({
        view,
        radius: rng.range(4, 13),
        speed: rng.range(0.1, 0.28) * (rng.next() > 0.5 ? 1 : -1),
        phase: rng.range(0, Math.PI * 2),
        depth: rng.range(-3.4, -0.7),
        centerX: rng.range(-14, 14),
        centerZ: rng.range(-30, -6),
      });
    }
  }

  update(dt: number): void {
    this.time += dt;
    for (const swimmer of this.swimmers) {
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
