import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Leaderboards } from './Leaderboards';

function sink(): { calls: [string, number][]; submitScore: (b: string, v: number) => Promise<void> } {
  const calls: [string, number][] = [];
  return {
    calls,
    submitScore: async (board, value) => {
      calls.push([board, value]);
    },
  };
}

describe('очередь таблиц лидеров', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('первый результат уходит сразу', () => {
    const platform = sink();
    const boards = new Leaderboards(platform, 1500, () => Date.now());

    boards.submit('wealth', 120);
    vi.advanceTimersByTime(0);
    expect(platform.calls).toEqual([['wealth', 120]]);
  });

  it('пачка результатов растягивается по одному на паузу', () => {
    const platform = sink();
    const boards = new Leaderboards(platform, 1500, () => Date.now());

    boards.submit('wealth', 120);
    boards.submit('album', 12);
    boards.submit('best_catch', 40);
    vi.advanceTimersByTime(0);
    expect(platform.calls).toHaveLength(1);

    vi.advanceTimersByTime(1500);
    expect(platform.calls).toHaveLength(2);

    vi.advanceTimersByTime(1500);
    expect(platform.calls).toEqual([
      ['wealth', 120],
      ['album', 12],
      ['best_catch', 40],
    ]);
  });

  it('пока результат ждёт очереди, отправится последнее значение', () => {
    const platform = sink();
    const boards = new Leaderboards(platform, 1500, () => Date.now());

    boards.submit('wealth', 100);
    vi.advanceTimersByTime(0);
    boards.submit('wealth', 250);
    boards.submit('wealth', 310);
    vi.advanceTimersByTime(1500);

    expect(platform.calls).toEqual([
      ['wealth', 100],
      ['wealth', 310],
    ]);
  });

  it('повтор того же значения не занимает очередь', () => {
    const platform = sink();
    const boards = new Leaderboards(platform, 1500, () => Date.now());

    boards.submit('wealth', 100);
    vi.advanceTimersByTime(0);
    boards.submit('wealth', 100);

    expect(boards.queued).toBe(0);
    vi.advanceTimersByTime(5000);
    expect(platform.calls).toHaveLength(1);
  });

  it('дробные и отрицательные значения приводятся к целым', () => {
    const platform = sink();
    const boards = new Leaderboards(platform, 1500, () => Date.now());

    boards.submit('album', 12.7);
    boards.submit('wealth', -5);
    vi.advanceTimersByTime(3000);

    expect(platform.calls).toEqual([
      ['album', 13],
      ['wealth', 0],
    ]);
  });
});
