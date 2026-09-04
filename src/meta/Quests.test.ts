import { describe, expect, it } from 'vitest';
import { Quests } from './Quests';
import { CATCH_ENTRIES } from '../content/catalog';
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
