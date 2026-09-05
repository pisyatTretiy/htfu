import { describe, expect, it } from 'vitest';
import { Boosts, LURE_LUCK, LURE_MINUTES } from './Boosts';

const MINUTE = 60_000;
const NOW = 1_700_000_000_000;

describe('временные бонусы', () => {
  it('без приманки удача обычная', () => {
    const boosts = new Boosts();
    expect(boosts.isLureActive(NOW)).toBe(false);
    expect(boosts.luck(NOW)).toBe(1);
    expect(boosts.secondsLeft(NOW)).toBe(0);
  });

  it('приманка работает ровно отведённые минуты', () => {
    const boosts = new Boosts();
    boosts.activateLure(NOW);

    expect(boosts.luck(NOW)).toBe(LURE_LUCK);
    expect(boosts.luck(NOW + LURE_MINUTES * MINUTE - 1)).toBe(LURE_LUCK);
    expect(boosts.luck(NOW + LURE_MINUTES * MINUTE)).toBe(1);
  });

  it('второй ролик продлевает, а не начинает заново', () => {
    const boosts = new Boosts();
    boosts.activateLure(NOW);
    boosts.activateLure(NOW + MINUTE);

    expect(boosts.secondsLeft(NOW + MINUTE)).toBe(2 * LURE_MINUTES * 60 - 60);
  });

  it('приманка, дотлевшая до нуля, начинается заново', () => {
    const boosts = new Boosts();
    boosts.activateLure(NOW);
    const later = NOW + 30 * MINUTE;
    boosts.activateLure(later);

    expect(boosts.secondsLeft(later)).toBe(LURE_MINUTES * 60);
  });

  it('переживает перезагрузку и битый сейв', () => {
    const boosts = new Boosts();
    boosts.activateLure(NOW);

    const restored = new Boosts();
    restored.restore(boosts.serialize());
    expect(restored.luck(NOW)).toBe(LURE_LUCK);

    restored.restore({ lureUntil: Number.NaN });
    expect(restored.luck(NOW)).toBe(1);
  });
});
