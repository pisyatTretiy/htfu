import upgrades from '../content/upgrades.json';
import type { Localized } from '../services/I18n';

interface UpgradeLevel {
  price: number;
  value: number;
}

interface UpgradeBranch {
  id: BranchId;
  name: Localized;
  hint: Localized;
  unit: Localized;
  levels: UpgradeLevel[];
}

export type BranchId = 'line' | 'reel' | 'rod' | 'net';

const BRANCHES = (upgrades as unknown as { branches: UpgradeBranch[] }).branches;

export interface Effects {
  /** Длина размотанной лески, м. */
  maxLineM: number;
  /** Множитель к тому, как быстро рыба выдыхается. */
  reelPower: number;
  /** Во сколько раз выше порог обрыва лески. */
  lineStrength: number;
  /** Сколько секунд даётся на усмирение улова на настиле. */
  subdueSeconds: number;
  /** Множитель к шансу редкого варианта: приманка, а не снасть. */
  luck: number;
}

/**
 * Прокачка снасти. Четыре ветки, каждая чинит своё узкое место — так игрок
 * понимает, за что платит (docs/03, § 3.5).
 */
export class Progression {
  private levels: Record<BranchId, number> = { line: 0, reel: 0, rod: 0, net: 0 };

  get branches(): UpgradeBranch[] {
    return BRANCHES;
  }

  levelOf(id: BranchId): number {
    return this.levels[id];
  }

  maxLevelOf(id: BranchId): number {
    return (this.branch(id)?.levels.length ?? 1) - 1;
  }

  /** Цена следующего уровня или null, если ветка прокачана до конца. */
  nextPrice(id: BranchId): number | null {
    const branch = this.branch(id);
    const next = branch?.levels[this.levels[id] + 1];
    return next ? next.price : null;
  }

  valueOf(id: BranchId, level = this.levels[id]): number {
    const branch = this.branch(id);
    return branch?.levels[level]?.value ?? 0;
  }

  /** Значение следующего уровня — показывается в магазине как «станет». */
  nextValue(id: BranchId): number | null {
    const branch = this.branch(id);
    const next = branch?.levels[this.levels[id] + 1];
    return next ? next.value : null;
  }

  levelUp(id: BranchId): void {
    if (this.levels[id] < this.maxLevelOf(id)) this.levels[id] += 1;
  }

  get effects(): Effects {
    return {
      maxLineM: this.valueOf('line'),
      reelPower: this.valueOf('reel'),
      lineStrength: this.valueOf('rod'),
      subdueSeconds: this.valueOf('net'),
      luck: 1,
    };
  }

  serialize(): Record<BranchId, number> {
    return { ...this.levels };
  }

  restore(saved: Partial<Record<BranchId, number>> | undefined): void {
    if (!saved) return;
    for (const branch of BRANCHES) {
      const level = saved[branch.id];
      if (typeof level === 'number') {
        this.levels[branch.id] = Math.max(0, Math.min(this.maxLevelOf(branch.id), Math.floor(level)));
      }
    }
  }

  private branch(id: BranchId): UpgradeBranch | undefined {
    return BRANCHES.find((entry) => entry.id === id);
  }
}
