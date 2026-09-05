import { describe, expect, it } from 'vitest';
import { CATCH_ENTRIES } from '../content/catalog';
import { poolAt } from './CatchPool';
import { COMPETENT, LEARNING, MASTER, ROOKIE, TIMID, simulateSpecies } from './Simulate';
import type { PlayerModel } from './Simulate';

const FISH = CATCH_ENTRIES.filter((entry) => entry.kind === 'fish');
const RUNS = 12;

interface Totals {
  landed: number;
  snapped: number;
  escaped: number;
  seconds: number;
  total: number;
}

/** Свод по всему каталогу для одной модели игрока. */
function totals(player: PlayerModel): Totals {
  const sum: Totals = { landed: 0, snapped: 0, escaped: 0, seconds: 0, total: 0 };
  for (const entry of FISH) {
    const stats = simulateSpecies(entry, RUNS, player);
    sum.landed += stats.landed;
    sum.snapped += stats.snapped;
    sum.escaped += stats.escaped;
    sum.seconds += stats.averageSeconds;
    sum.total += RUNS;
  }
  sum.seconds /= FISH.length;
  return sum;
}

/**
 * Гейты баланса из docs/05, § «Фаза 4». Числа взяты не с потолка: их выдал
 * прогон симулятора (`npm run balance`), а тест не даёт им уехать при
 * следующей правке данных.
 *
 * Смысл набора моделей: у каждой манеры игры своя цена ошибки. Жадность рвёт
 * леску, осторожность упускает рыбу, чтение рывков — самая быстрая и надёжная
 * игра. Если хоть один из этих гейтов сойдётся к нулю, бой снова станет
 * бинарным: «знаешь приём — побеждаешь всегда».
 */
describe('гейты баланса', () => {
  it('умелый игрок вытаскивает почти всё', () => {
    const stats = totals(COMPETENT);
    expect(stats.landed / stats.total).toBeGreaterThanOrEqual(0.95);
  });

  it('чтение рывков — лучшая игра: быстрее и надёжнее', () => {
    const master = totals(MASTER);
    const competent = totals(COMPETENT);
    expect(master.landed / master.total).toBeGreaterThanOrEqual(0.98);
    expect(master.seconds).toBeLessThan(competent.seconds);
  });

  it('доля обрывов у новичка не выше пятой части боёв', () => {
    // Гейт фазы 4: новичок, который тянет слишком долго, должен терять рыбу
    // иногда, а не в каждом бою. Это же и требование к удержанию.
    const stats = totals(ROOKIE);
    expect(stats.snapped / stats.total).toBeLessThanOrEqual(0.2);
    expect(stats.snapped / stats.total).toBeGreaterThan(0);
  });

  it('осторожность стоит рыбы, но не всей', () => {
    const stats = totals(TIMID);
    const escapeShare = stats.escaped / stats.total;
    expect(escapeShare).toBeGreaterThan(0);
    expect(escapeShare).toBeLessThanOrEqual(0.35);
  });

  it('игрок, который разбирается по ходу, справляется', () => {
    const stats = totals(LEARNING);
    expect(stats.landed / stats.total).toBeGreaterThanOrEqual(0.9);
  });

  it('первые бои укладываются в обещанные 5–15 секунд', () => {
    // docs/03, § 3.3: виток должен быть коротким, иначе первые десять минут
    // не помещаются в сценарий обучения.
    for (const entry of poolAt(6).filter((item) => item.kind === 'fish')) {
      const stats = simulateSpecies(entry, RUNS, COMPETENT);
      expect(stats.averageSeconds, entry.id).toBeGreaterThan(5);
      expect(stats.averageSeconds, entry.id).toBeLessThan(15);
    }
  });

  it('у каждого вида рыбы есть своё терпение', () => {
    // Одинаковое терпение для всех означало бы, что вялую рыбу невозможно
    // вытащить в срок, а бойкую невозможно упустить.
    for (const entry of FISH) {
      expect(entry.fight.patience, entry.id).toBeGreaterThanOrEqual(12);
      expect(entry.fight.patience, entry.id).toBeLessThanOrEqual(48);
    }
  });
});
