import { describe, expect, it } from 'vitest';
import { Quests, QUESTS } from './Quests';
import { CATCH_ENTRIES } from '../content/catalog';
import { ZONES, zoneCatchIds } from './Zones';
import type { CatchEntry } from '../content/types';

const ENTRIES = CATCH_ENTRIES;
const find = (id: string): CatchEntry => {
  const entry = ENTRIES.find((item) => item.id === id);
  if (!entry) throw new Error(`Нет вида ${id} в catches.json`);
  return entry;
};

describe('цепочка заданий', () => {
  it('первое задание закрывается любым уловом', () => {
    const quests = new Quests();
    const done = quests.onCatch(find('boot'));
    expect(done?.id).toBe('first_catch');
    expect(quests.active?.id).toBe('perch_three');
  });

  it('считает только подходящий улов', () => {
    const quests = new Quests();
    quests.onCatch(find('boot'));

    quests.onCatch(find('pike'));
    expect(quests.current).toBe(0);

    quests.onCatch(find('perch'));
    quests.onCatch(find('perch'));
    expect(quests.current).toBe(2);
    expect(quests.onCatch(find('perch'))?.id).toBe('perch_three');
  });

  it('цель по глубине не откатывается назад', () => {
    const quests = new Quests();
    quests.restore({ index: 3, progress: 0 });
    expect(quests.active?.id).toBe('deep_forty');

    quests.onDepth(25);
    quests.onDepth(10);
    expect(quests.current).toBe(25);
    expect(quests.onDepth(41)?.id).toBe('deep_forty');
  });

  it('после последнего задания цепочка кончается, а не зацикливается', () => {
    const quests = new Quests();
    quests.restore({ index: quests.total, progress: 0 });
    expect(quests.active).toBeNull();
    expect(quests.done).toBe(true);
    expect(quests.onCatch(find('perch'))).toBeNull();
  });

  it('битый сейв не выводит индекс за пределы цепочки', () => {
    const quests = new Quests();
    quests.restore({ index: 999, progress: -4 });
    expect(quests.completedCount).toBe(quests.total);
    expect(quests.current).toBe(0);
  });
});

describe('выполнимость заданий', () => {
  /**
   * Последнее задание цепочки просит щуку, а щуки на причале нет: она водится
   * в бухте, которая открывается победой над первым боссом. Задание от этого
   * не становится невыполнимым — к пятому заданию босс уже приходил, — но
   * игроку об этом не говорили, и он мог забрасывать у причала сколько угодно.
   * Здесь проверяется и то, что цель вообще существует, и то, что задание не
   * молчит о чужой воде.
   */
  it('каждая именная цель существует в каталоге', () => {
    for (const quest of QUESTS) {
      const goal = quest.goal;
      if (goal.type !== 'catch_id') continue;
      const entry = CATCH_ENTRIES.find((candidate) => candidate.id === goal.id);
      expect(entry, `${quest.id}: вида «${goal.id}» нет в каталоге`).toBeDefined();
    }
  });

  it('цель по глубине достижима, и чужая вода названа', () => {
    const dock = ZONES[0]!;
    const deepest = Math.max(...ZONES.map((zone) => zone.maxDepth));
    for (const quest of QUESTS) {
      const goal = quest.goal;
      if (goal.type !== 'reach_depth') continue;

      expect(goal.depth, `${quest.id}: глубже дна самой глубокой воды`).toBeLessThanOrEqual(deepest);
      if (goal.depth <= dock.maxDepth) continue;

      // Глубже причала — значит, придётся уплыть, и об этом надо сказать.
      const reachable = ZONES.filter((zone) => zone.maxDepth >= goal.depth);
      const words = reachable
        .flatMap((zone) => [zone.name.ru, zone.name.en])
        .filter((value): value is string => Boolean(value))
        .flatMap((label) => label.toLowerCase().split(/\s+/))
        .map((word) => word.slice(0, 4));
      const titles = [quest.title.ru, quest.title.en]
        .filter((value): value is string => Boolean(value))
        .map((title) => title.toLowerCase());

      expect(
        words.some((word) => titles.some((title) => title.includes(word))),
        `${quest.id}: не сказано, где такая глубина`,
      ).toBe(true);
    }
  });

  it('цепочка растёт в цене, хотя отдельный шаг может быть дешевле', () => {
    // Ровного роста от задания к заданию нет и быть не должно: «достань
    // что-нибудь несъедобное» — одна вещь, и платить за неё больше, чем за трёх
    // окуней, незачем. Награда идёт за труд, а не за место в очереди. Расти
    // должна цепочка целиком: доход по локациям отличается почти на порядок.
    const rewards = QUESTS.map((quest) => quest.reward);
    const last = rewards[rewards.length - 1] ?? 0;
    expect(last, 'последнее задание должно быть самым дорогим').toBe(Math.max(...rewards));

    const half = Math.floor(rewards.length / 2);
    const mean = (values: number[]): number =>
      values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
    expect(mean(rewards.slice(half))).toBeGreaterThan(mean(rewards.slice(0, half)) * 2);
  });

  it('если цель водится не там, где выдано задание, это сказано в названии', () => {
    const dock = ZONES[0]!;
    for (const quest of QUESTS) {
      const goal = quest.goal;
      if (goal.type !== 'catch_id') continue;
      if (zoneCatchIds(dock).includes(goal.id)) continue;

      // Вид не с причала: название обязано назвать воду, где его искать.
      const home = ZONES.find((zone) => zoneCatchIds(zone).includes(goal.id));
      expect(home, `${quest.id}: вид «${goal.id}» не водится ни в одной локации`).toBeDefined();

      const words = [home!.name.ru, home!.name.en]
        .filter((value): value is string => Boolean(value))
        .flatMap((label) => label.toLowerCase().split(/\s+/))
        .map((word) => word.slice(0, 4));
      const titles = [quest.title.ru, quest.title.en]
        .filter((value): value is string => Boolean(value))
        .map((title) => title.toLowerCase());
      const named = words.some((word) => titles.some((title) => title.includes(word)));

      expect(named, `${quest.id}: не сказано, где искать «${goal.id}»`).toBe(true);
    }
  });
});
