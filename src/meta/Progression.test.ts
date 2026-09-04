import { describe, expect, it } from 'vitest';
import { Progression, type BranchId } from './Progression';

const IDS: BranchId[] = ['line', 'reel', 'rod', 'net'];

describe('прокачка', () => {
  it('стартовый уровень бесплатный у всех веток', () => {
    const progression = new Progression();
    for (const branch of progression.branches) {
      expect(branch.levels[0]?.price, branch.id).toBe(0);
    }
  });

  it('цены растут, а польза не падает', () => {
    const progression = new Progression();
    for (const branch of progression.branches) {
      for (let level = 1; level < branch.levels.length; level++) {
        const previous = branch.levels[level - 1];
        const current = branch.levels[level];
        expect(current?.price, `${branch.id} цена ур. ${level}`).toBeGreaterThan(
          previous?.price ?? 0,
        );
        expect(current?.value, `${branch.id} польза ур. ${level}`).toBeGreaterThan(
          previous?.value ?? 0,
        );
      }
    }
  });

  it('прокачка упирается в потолок и больше не берёт денег', () => {
    const progression = new Progression();
    for (const id of IDS) {
      for (let i = 0; i < 20; i++) progression.levelUp(id);
      expect(progression.levelOf(id)).toBe(progression.maxLevelOf(id));
      expect(progression.nextPrice(id)).toBeNull();
      expect(progression.nextValue(id)).toBeNull();
    }
  });

  it('эффекты собираются из текущих уровней', () => {
    const progression = new Progression();
    const start = progression.effects;
    progression.levelUp('line');
    progression.levelUp('net');
    const grown = progression.effects;

    expect(grown.maxLineM).toBeGreaterThan(start.maxLineM);
    expect(grown.subdueSeconds).toBeGreaterThan(start.subdueSeconds);
    expect(grown.reelPower).toBe(start.reelPower);
  });

  it('битый сейв не даёт выйти за границы веток', () => {
    const progression = new Progression();
    progression.restore({ line: 999, reel: -5, rod: 1.7 } as Record<BranchId, number>);
    expect(progression.levelOf('line')).toBe(progression.maxLevelOf('line'));
    expect(progression.levelOf('reel')).toBe(0);
    expect(progression.levelOf('rod')).toBe(1);
  });
});
