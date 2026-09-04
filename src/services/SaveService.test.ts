import { describe, expect, it } from 'vitest';
import { migrate, emptySave, SAVE_VERSION } from './SaveService';

describe('миграции сейва', () => {
  it('пустой вход даёт валидный сейв текущей версии', () => {
    const save = migrate(null);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.money).toBe(0);
    expect(save.upgrades).toEqual({});
  });

  it('поднимает сейв нулевой версии до текущей, сохраняя прогресс', () => {
    const legacy = { version: 0, updatedAt: 1, money: 340, upgrades: { line: 2 } };
    const save = migrate(legacy);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.money).toBe(340);
    expect(save.upgrades).toEqual({ line: 2 });
    expect(save.album).toEqual({});
  });

  it('сейв первой версии получает цепочку заданий, не теряя нажитого', () => {
    const v1 = {
      version: 1,
      updatedAt: 5,
      money: 780,
      upgrades: { line: 3, net: 1 },
      album: { perch: 12 },
    };
    const save = migrate(v1 as never);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.money).toBe(780);
    expect(save.upgrades).toEqual({ line: 3, net: 1 });
    expect(save.album).toEqual({ perch: 12 });
    expect(save.quests).toEqual({ index: 0, progress: 0 });
  });

  it('не ломает сейв из будущей версии — игрок мог откатиться', () => {
    const future = { ...emptySave(), version: SAVE_VERSION + 5, money: 99 };
    const save = migrate(future);
    expect(save.money).toBe(99);
    expect(save.version).toBeGreaterThanOrEqual(SAVE_VERSION);
  });

  it('добивает недостающие поля значениями по умолчанию', () => {
    const partial = { version: SAVE_VERSION, money: 12 } as never;
    const save = migrate(partial);
    expect(save.album).toEqual({});
    expect(save.upgrades).toEqual({});
  });
});
