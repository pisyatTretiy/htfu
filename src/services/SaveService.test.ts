import { describe, expect, it } from 'vitest';
import { migrate, emptySave, SaveService, SAVE_VERSION, type GameSave } from './SaveService';
import type { IPlatform } from '../platform';
import { ONBOARDING_CHAIN } from '../meta/Onboarding';

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
    // Альбом до версии 5 хранил число вместо разбивки по вариантам: приведение
    // к новому виду делает sanitize, и Album.restore получает уже его.
    expect(save.album).toEqual({ perch: { common: 12 } });
    expect(save.quests).toEqual({ index: 0, progress: 0 });
  });

  it('сейв второй версии получает локацию, не теряя заданий', () => {
    const v2 = {
      version: 2,
      updatedAt: 9,
      money: 400,
      upgrades: { line: 1 },
      album: { pike: 2 },
      quests: { index: 3, progress: 1 },
    };
    const save = migrate(v2 as never);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.zone).toBe('dock');
    expect(save.quests).toEqual({ index: 3, progress: 1 });
    expect(save.money).toBe(400);
  });

  it('сейв пятой версии получает ежедневки и рекорд', () => {
    const v5 = {
      version: 5,
      updatedAt: 3,
      money: 90,
      upgrades: {},
      album: { perch: { common: 1 } },
      quests: { index: 1, progress: 0 },
      zone: 'bay',
      bosses: { trophies: ['boss_som'], catches: {} },
    };
    const save = migrate(v5 as never);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.dailies.streak).toBe(0);
    expect(save.bestCatch).toBe(0);
    expect(save.zone).toBe('bay');
    expect(save.bosses.trophies).toEqual(['boss_som']);
  });

  it('старому игроку обучение не показывают заново', () => {
    const v6 = { version: 6, updatedAt: 9, money: 1200, upgrades: { rod: 2 } };
    const save = migrate(v6 as never);
    expect(save.version).toBe(SAVE_VERSION);
    expect(save.onboarding.step).toBe(ONBOARDING_CHAIN.length);
    expect(save.money).toBe(1200);
  });

  it('новый игрок начинает обучение с первого шага', () => {
    expect(emptySave().onboarding).toEqual({ step: 0, seen: [] });
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

  it('мусор в сейве не ломает игру', () => {
    const broken = {
      version: SAVE_VERSION,
      updatedAt: 'вчера',
      money: Number.NaN,
      bestCatch: -40,
      upgrades: { line: 'три', reel: 2 },
      album: { perch: null, crab: { common: 'много', gold: 1 } },
      quests: null,
      zone: 42,
      bosses: { trophies: ['boss_som', 7], catches: null },
      dailies: { day: Number.POSITIVE_INFINITY, progress: null, claimed: 'нет' },
      onboarding: { step: -3, seen: [1, 'cast'] },
      boosts: { lureUntil: 'скоро' },
      store: { owned: null },
    };

    const save = migrate(broken as never);
    expect(save.money).toBe(0);
    expect(save.bestCatch).toBe(0);
    expect(save.updatedAt).toBe(0);
    expect(save.upgrades).toEqual({ reel: 2 });
    expect(save.album).toEqual({ crab: { gold: 1 } });
    expect(save.quests).toEqual({ index: 0, progress: 0 });
    expect(save.zone).toBe('dock');
    expect(save.bosses).toEqual({ trophies: ['boss_som'], catches: {} });
    expect(save.dailies.day).toBe(0);
    expect(save.dailies.claimed).toEqual([]);
    expect(save.dailies.lastCompletedDay).toBe(-1);
    expect(save.onboarding).toEqual({ step: 0, seen: ['cast'] });
    expect(save.boosts).toEqual({ lureUntil: 0 });
    expect(save.store).toEqual({ owned: [] });
  });

  it('целый сейв проходит через проверку без изменений', () => {
    const good = {
      ...emptySave(),
      money: 1200,
      bestCatch: 340,
      upgrades: { line: 2, rod: 1 },
      album: { perch: { common: 4, gold: 1 } },
      zone: 'bay',
      bosses: { trophies: ['boss_som'], catches: { dock: 9 } },
    };
    expect(migrate(good)).toEqual({ ...good, updatedAt: 0 });
  });
});
describe('сброс сейва в облако', () => {
  interface Sink {
    saved: GameSave[];
    fail: boolean;
  }

  function platform(): IPlatform & Sink {
    const sink: Sink = { saved: [], fail: false };
    return {
      ...sink,
      async save(this: Sink, data: GameSave) {
        if (this.fail) throw new Error('облако недоступно');
        this.saved.push(data);
      },
      async load() {
        return null;
      },
    } as unknown as IPlatform & Sink;
  }

  it('сорвавшееся сохранение не пропадает, а уходит со следующей попыткой', async () => {
    const sink = platform();
    const service = new SaveService(sink);
    const data = { ...emptySave(), money: 500 };

    sink.fail = true;
    service.save(data);
    await service.flush();
    expect(sink.saved).toHaveLength(0);

    // Очередь сохранилась: повтор отправляет те же данные, ничего не потеряв.
    sink.fail = false;
    await service.flush();
    expect(sink.saved).toHaveLength(1);
    expect(sink.saved[0]?.money).toBe(500);
  });

  it('отказ облака не валится наверх: он не должен рвать показ рекламы', async () => {
    const sink = platform();
    sink.fail = true;
    const service = new SaveService(sink);
    service.save(emptySave());
    await expect(service.flush()).resolves.toBeUndefined();
  });
});
