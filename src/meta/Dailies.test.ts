import { describe, expect, it } from 'vitest';
import { Dailies, currentDay } from './Dailies';
import { CATCH_ENTRIES } from '../content/catalog';
import type { CatchEntry } from '../content/types';

const DAY = 86_400_000;
const fish = CATCH_ENTRIES.find((entry) => entry.kind === 'fish') as CatchEntry;
const junk = CATCH_ENTRIES.find((entry) => entry.kind === 'junk') as CatchEntry;

describe('ежедневные дела', () => {
  it('набор на день одинаков при повторном заходе', () => {
    const a = new Dailies();
    const b = new Dailies();
    expect(a.tasks.map((task) => task.id)).toEqual(b.tasks.map((task) => task.id));
    expect(a.tasks).toHaveLength(3);
  });

  it('набор меняется от дня ко дню', () => {
    const today = new Dailies();
    const later = new Dailies();
    later.restore(
      { day: currentDay() + 3, progress: {}, claimed: [], streak: 0, lastCompletedDay: -1 },
      Date.now() + 3 * DAY,
    );
    // Совпадение всех трёх дел два дня подряд означало бы, что выбор не зависит от даты.
    expect(later.tasks.map((t) => t.id).join()).not.toBe(today.tasks.map((t) => t.id).join());
  });

  it('улов двигает только те дела, чья цель ему соответствует', () => {
    const dailies = new Dailies();
    const before = new Map(dailies.tasks.map((task) => [task.id, dailies.progressOf(task)]));

    dailies.onCatch(fish, 'common', 0, false);

    for (const task of dailies.tasks) {
      const moved = dailies.progressOf(task) > (before.get(task.id) ?? 0);
      // Обычная рыба без награды закрывает только «поймать штук».
      const shouldMove = task.goal.type === 'catch_any';
      expect(moved, `${task.id}: ${task.goal.type}`).toBe(shouldMove);
    }
  });

  it('награда выдаётся один раз', () => {
    const dailies = new Dailies();
    const task = dailies.tasks[0]!;
    for (let i = 0; i < task.goal.count + 5; i++) {
      dailies.onCatch(junk, 'rare', 1000, true);
      dailies.onTrickShot();
      dailies.onDepth(250);
    }
    expect(dailies.isDone(task)).toBe(true);

    const first = dailies.claim(task);
    expect(first).toBeGreaterThan(0);
    expect(dailies.claim(task)).toBe(0);
    expect(dailies.isClaimed(task)).toBe(true);
  });

  it('стрик растёт за день игры и обнуляется при пропуске', () => {
    const dailies = new Dailies();
    const task = dailies.tasks[0]!;
    for (let i = 0; i < 40; i++) {
      dailies.onCatch(junk, 'rare', 1000, true);
      dailies.onTrickShot();
      dailies.onDepth(250);
    }
    dailies.claim(task);
    expect(dailies.currentStreak).toBe(1);
    expect(dailies.streakMultiplier).toBeCloseTo(1.15);

    // Следующий день подряд — прогресс сброшен, стрик цел.
    const state = dailies.serialize();
    const next = new Dailies();
    next.restore(state, Date.now() + DAY);
    expect(next.currentStreak).toBe(1);
    expect(next.progressOf(next.tasks[0]!)).toBe(0);

    // Пропуск двух дней подряд — стрик сгорает.
    const skipped = new Dailies();
    skipped.restore(state, Date.now() + 3 * DAY);
    expect(skipped.currentStreak).toBe(0);
  });

  it('цель по глубине не откатывается назад', () => {
    const dailies = new Dailies();
    const deep = dailies.tasks.find((task) => task.goal.type === 'reach_depth');
    if (!deep) return;

    dailies.onDepth(40);
    dailies.onDepth(12);
    expect(dailies.progressOf(deep)).toBe(40);
  });

  it('множитель стрика не растёт бесконечно', () => {
    const dailies = new Dailies();
    dailies.restore({
      day: currentDay(),
      progress: {},
      claimed: [],
      streak: 99,
      lastCompletedDay: currentDay(),
    });
    expect(dailies.streakMultiplier).toBeLessThanOrEqual(2);
  });
});
