import type { Rng } from '../core/Rng';

export type Rarity = 'common' | 'rare' | 'gold';

export const RARITIES: Rarity[] = ['common', 'rare', 'gold'];

/**
 * Редкие варианты видов — долгосрочная цель поверх денег: собрать всех в трёх
 * вариантах занимает десятки часов (docs/03, § 3.5).
 *
 * Шансы намеренно щедрые на редкий и скупые на золотой: редкий должен
 * попадаться достаточно часто, чтобы игрок понял правила, золотой — достаточно
 * редко, чтобы о нём рассказывали.
 */
const CHANCE: Record<Rarity, number> = { common: 0.82, rare: 0.15, gold: 0.03 };

/** Во сколько раз дороже обычного. */
const PRICE: Record<Rarity, number> = { common: 1, rare: 2.4, gold: 6 };

/** Оттенок для меша: редкий отливает синевой, золотой — золотом. */
const TINT: Record<Rarity, number> = { common: 0xffffff, rare: 0x9fe8ff, gold: 0xffd85c };

export function rollRarity(rng: Rng, luck = 1): Rarity {
  // Удача сдвигает шансы к редкому, не трогая суммарную вероятность.
  const gold = CHANCE.gold * luck;
  const rare = CHANCE.rare * luck;
  const ticket = rng.next();
  if (ticket < gold) return 'gold';
  if (ticket < gold + rare) return 'rare';
  return 'common';
}

export const rarityPrice = (rarity: Rarity): number => PRICE[rarity];
export const rarityTint = (rarity: Rarity): number => TINT[rarity];
