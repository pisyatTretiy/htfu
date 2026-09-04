import table from '../content/catches.json';
import type { CatchTable } from '../content/types';

const TOTAL = (table as unknown as CatchTable).entries.length;

/**
 * Альбом видов. Долгосрочная цель поверх денег: заполнение даёт бонусы
 * (docs/03, § 3.5). Пока считает только поимки — бонусы придут в фазе 3.
 */
export class Album {
  private caught: Record<string, number> = {};

  /** @returns true, если вид попался впервые */
  record(id: string): boolean {
    const before = this.caught[id] ?? 0;
    this.caught[id] = before + 1;
    return before === 0;
  }

  get discovered(): number {
    return Object.keys(this.caught).length;
  }

  get total(): number {
    return TOTAL;
  }

  countOf(id: string): number {
    return this.caught[id] ?? 0;
  }

  serialize(): Record<string, number> {
    return { ...this.caught };
  }

  restore(saved: Record<string, number> | undefined): void {
    if (!saved) return;
    for (const [id, count] of Object.entries(saved)) {
      if (typeof count === 'number' && count > 0) this.caught[id] = Math.floor(count);
    }
  }
}
