import { describe, expect, it } from 'vitest';
import { rarityPrice, rollRarity, RARITIES } from './Rarity';
import { Rng } from '../core/Rng';

describe('варианты редкости', () => {
  it('золотой дороже редкого, редкий дороже обычного', () => {
    expect(rarityPrice('gold')).toBeGreaterThan(rarityPrice('rare'));
    expect(rarityPrice('rare')).toBeGreaterThan(rarityPrice('common'));
  });

  it('редкий попадается заметно, золотой — редко', () => {
    const rolls = 20000;
    const fresh = new Rng(7);
    const tally: Record<string, number> = { common: 0, rare: 0, gold: 0 };
    for (let i = 0; i < rolls; i++) {
      const rarity = rollRarity(fresh);
      tally[rarity] = (tally[rarity] ?? 0) + 1;
    }

    expect(tally.common! / rolls).toBeGreaterThan(0.75);
    expect(tally.rare! / rolls).toBeGreaterThan(0.1);
    expect(tally.rare! / rolls).toBeLessThan(0.2);
    expect(tally.gold! / rolls).toBeGreaterThan(0.01);
    expect(tally.gold! / rolls).toBeLessThan(0.06);
  });

  it('удача сдвигает шансы к редкому, не ломая набор', () => {
    const plain = new Rng(11);
    const lucky = new Rng(11);
    let plainRare = 0;
    let luckyRare = 0;
    for (let i = 0; i < 5000; i++) {
      if (rollRarity(plain) !== 'common') plainRare += 1;
      if (rollRarity(lucky, 2) !== 'common') luckyRare += 1;
    }
    expect(luckyRare).toBeGreaterThan(plainRare);
    expect(RARITIES).toHaveLength(3);
  });
});
