import { describe, expect, it } from 'vitest';
import { JUNK_SHARE, poolAt, rollCatch } from './CatchPool';
import { FightSystem } from './FightSystem';
import { Rng } from '../core/Rng';
import { CATCH_ENTRIES } from '../content/catalog';
import type { CatchEntry } from '../content/types';

const ENTRIES = CATCH_ENTRIES;
const DEPTHS = [0, 10, 30, 60, 100, 160, 240];

describe('пул заброса', () => {
  it('на каждой глубине есть и рыба, и мусор', () => {
    for (const depth of DEPTHS) {
      const pool = poolAt(depth);
      expect(pool.some((entry) => entry.kind === 'fish'), `рыба на ${depth} м`).toBe(true);
      expect(pool.some((entry) => entry.kind === 'junk'), `мусор на ${depth} м`).toBe(true);
    }
  });

  it('держит долю мусора в коридоре 20–30 % на любой глубине', () => {
    for (const depth of DEPTHS) {
      const rng = new Rng(depth + 1);
      let junk = 0;
      const rolls = 4000;
      for (let i = 0; i < rolls; i++) {
        if (rollCatch(depth, rng).kind === 'junk') junk += 1;
      }
      const share = junk / rolls;
      expect(share, `доля мусора на ${depth} м`).toBeGreaterThan(0.2);
      expect(share, `доля мусора на ${depth} м`).toBeLessThan(0.3);
      expect(Math.abs(share - JUNK_SHARE)).toBeLessThan(0.03);
    }
  });

  it('никогда не выдаёт вид вне его диапазона глубин', () => {
    for (const depth of DEPTHS) {
      const rng = new Rng(depth + 99);
      for (let i = 0; i < 500; i++) {
        const entry = rollCatch(depth, rng);
        expect(depth).toBeGreaterThanOrEqual(entry.depth[0]);
        expect(depth).toBeLessThanOrEqual(entry.depth[1]);
      }
    }
  });
});

/** Игрок с нормальной реакцией: тянет на низком натяжении, отпускает перед обрывом. */
function playReasonably(entry: CatchEntry, seed: number): string {
  const fight = new FightSystem(entry, seed);
  const step = 1 / 120;
  for (let i = 0; i < 120 * 30; i++) {
    if (fight.tension > 0.62) fight.reeling = false;
    else if (fight.tension < 0.24) fight.reeling = true;
    const outcome = fight.step(step);
    if (outcome !== 'fighting') return outcome;
  }
  return 'timeout';
}

/** Игрок, который просто зажал палец и не отпускает. */
function playGreedily(entry: CatchEntry, seed: number): string {
  const fight = new FightSystem(entry, seed);
  fight.reeling = true;
  const step = 1 / 120;
  for (let i = 0; i < 120 * 30; i++) {
    const outcome = fight.step(step);
    if (outcome !== 'fighting') return outcome;
  }
  return 'timeout';
}

describe('баланс боя', () => {
  const fish = ENTRIES.filter((entry) => entry.kind === 'fish');
  const junk = ENTRIES.filter((entry) => entry.kind === 'junk');

  it('вменяемый ритм вытаскивает любую рыбу', () => {
    for (const entry of fish) {
      expect(playReasonably(entry, 7), entry.name.ru).toBe('landed');
    }
  });

  it('зажатый палец рвёт леску на рыбе — иначе в бою нет решения', () => {
    for (const entry of fish) {
      expect(playGreedily(entry, 7), entry.name.ru).toBe('snapped');
    }
  });

  it('мусор вытаскивается без борьбы', () => {
    for (const entry of junk) {
      expect(playGreedily(entry, 7), entry.name.ru).toBe('landed');
    }
  });

  it('улов срывается, если игрок ничего не делает', () => {
    const perch = fish[0];
    expect(perch).toBeDefined();
    const fight = new FightSystem(perch as CatchEntry, 3);
    let outcome = 'fighting';
    for (let i = 0; i < 120 * 30 && outcome === 'fighting'; i++) outcome = fight.step(1 / 120);
    expect(outcome).toBe('escaped');
  });
});
