import { beforeEach, describe, expect, it, vi } from 'vitest';
import { YandexPlatform } from './YandexPlatform';
import type { YandexSdk } from './yandex-sdk';

/**
 * Единственный модуль, который до этих тестов не исполнялся никогда.
 *
 * Бот-снимальщик работает на localhost, а там `createPlatform` даже не пробует
 * SDK и сразу берёт заглушку. То есть весь код интеграции — реклама, облачные
 * сохранения, покупки, таблицы лидеров — впервые запускался бы уже на
 * модерации. SDK приходит через конструктор, так что подделать его несложно.
 *
 * Тесты держат договор, а не реализацию площадки: награда только по
 * onRewarded, отказ любого вызова не роняет игру, покупка отменена —
 * это не ошибка.
 */

interface Fake {
  sdk: YandexSdk;
  rewardedCallbacks: { onRewarded?: () => void; onClose?: () => void; onError?: (e: unknown) => void };
  interstitialCallbacks: { onClose?: () => void; onError?: (e: unknown) => void };
  saved: Record<string, unknown>;
  scores: [string, number][];
  consumed: string[];
}

function fakeSdk(overrides: Partial<Record<string, unknown>> = {}): Fake {
  const fake = {
    rewardedCallbacks: {},
    interstitialCallbacks: {},
    saved: {} as Record<string, unknown>,
    scores: [] as [string, number][],
    consumed: [] as string[],
  } as Fake;

  fake.sdk = {
    environment: { i18n: { lang: 'en' } },
    deviceInfo: { isTV: () => false },
    features: {
      LoadingAPI: { ready: vi.fn() },
      GameplayAPI: { start: vi.fn(), stop: vi.fn() },
    },
    adv: {
      showRewardedVideo: ({ callbacks }: { callbacks: Fake['rewardedCallbacks'] }) => {
        fake.rewardedCallbacks = callbacks;
      },
      showFullscreenAdv: ({ callbacks }: { callbacks: Fake['interstitialCallbacks'] }) => {
        fake.interstitialCallbacks = callbacks;
      },
      showBannerAdv: vi.fn().mockResolvedValue(undefined),
      hideBannerAdv: vi.fn().mockResolvedValue(undefined),
    },
    getPlayer: async () => ({
      getData: async (keys: string[]) =>
        Object.fromEntries(keys.map((key) => [key, fake.saved[key]])),
      setData: async (data: Record<string, unknown>) => {
        Object.assign(fake.saved, data);
      },
    }),
    getPayments: async () => ({
      getCatalog: async () => [{ id: 'no_ads', price: '99 ₽' }],
      getPurchases: async () => [{ productID: 'no_ads', purchaseToken: 'tok' }],
      purchase: async ({ id }: { id: string }) => ({ productID: id, purchaseToken: 'fresh' }),
      consumePurchase: async (token: string) => {
        fake.consumed.push(token);
      },
    }),
    feedback: {
      canReview: async () => ({ value: true }),
      requestReview: async () => ({ feedbackSent: true }),
    },
    isAvailableMethod: async () => true,
    leaderboards: {
      setScore: async (board: string, value: number) => {
        fake.scores.push([board, value]);
      },
    },
    ...overrides,
  } as unknown as YandexSdk;

  return fake;
}

describe('интеграция с площадкой', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'info').mockImplementation(() => undefined);
  });

  it('берёт язык у площадки, а игрока — молча гостем при отказе', async () => {
    const fake = fakeSdk({
      getPlayer: async () => {
        throw new Error('не авторизован');
      },
    });
    const platform = new YandexPlatform(fake.sdk);
    await platform.init();

    expect(platform.lang()).toBe('en');
    // Гость — норма: облако просто недоступно, игра работает.
    expect(await platform.load()).toBeNull();
    await expect(platform.save({ version: 1 } as never)).resolves.toBeUndefined();
  });

  it('сообщает площадке о готовности и о геймплее', async () => {
    const fake = fakeSdk();
    const platform = new YandexPlatform(fake.sdk);
    platform.ready();
    platform.gameplayStart();
    platform.gameplayStop();

    const features = fake.sdk.features as unknown as {
      LoadingAPI: { ready: ReturnType<typeof vi.fn> };
      GameplayAPI: { start: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };
    };
    expect(features.LoadingAPI.ready).toHaveBeenCalledOnce();
    expect(features.GameplayAPI.start).toHaveBeenCalledOnce();
    expect(features.GameplayAPI.stop).toHaveBeenCalledOnce();
  });

  it('старый SDK без features не роняет запуск', () => {
    const fake = fakeSdk({ features: undefined });
    const platform = new YandexPlatform(fake.sdk);
    expect(() => {
      platform.ready();
      platform.gameplayStart();
      platform.gameplayStop();
    }).not.toThrow();
  });

  it('награда выдаётся только по onRewarded, а не по закрытию ролика', async () => {
    const fake = fakeSdk();
    const platform = new YandexPlatform(fake.sdk);

    const skipped = platform.showRewarded('lure');
    fake.rewardedCallbacks.onClose?.();
    expect(await skipped).toBe(false);

    const watched = platform.showRewarded('lure');
    fake.rewardedCallbacks.onRewarded?.();
    fake.rewardedCallbacks.onClose?.();
    expect(await watched).toBe(true);
  });

  it('отказ рекламы не подвешивает обещание', async () => {
    const fake = fakeSdk();
    const platform = new YandexPlatform(fake.sdk);

    const rewarded = platform.showRewarded('double');
    fake.rewardedCallbacks.onError?.(new Error('нет заказов'));
    expect(await rewarded).toBe(false);

    const interstitial = platform.showInterstitial();
    fake.interstitialCallbacks.onError?.(new Error('нет заказов'));
    await expect(interstitial).resolves.toBeUndefined();
  });

  it('сейв уходит в облако и читается обратно', async () => {
    const fake = fakeSdk();
    const platform = new YandexPlatform(fake.sdk);
    await platform.init();

    await platform.save({ version: 10, money: 700 } as never);
    expect(await platform.load()).toEqual({ version: 10, money: 700 });
  });

  it('мусор вместо сейва читается как «сейва нет»', async () => {
    const fake = fakeSdk();
    const platform = new YandexPlatform(fake.sdk);
    await platform.init();
    fake.saved.save = 'не объект';
    expect(await platform.load()).toBeNull();
  });

  it('каталог и незавершённые покупки приводятся к виду игры', async () => {
    const platform = new YandexPlatform(fakeSdk().sdk);
    expect(await platform.products()).toEqual([{ id: 'no_ads', price: '99 ₽' }]);
    expect(await platform.pendingPurchases()).toEqual([{ productId: 'no_ads', token: 'tok' }]);
  });

  it('отменённая покупка — не ошибка, а просто «не купили»', async () => {
    const fake = fakeSdk({
      getPayments: async () => ({
        getCatalog: async () => [],
        getPurchases: async () => [],
        purchase: async () => {
          throw new Error('игрок закрыл окно');
        },
        consumePurchase: async () => undefined,
      }),
    });
    const platform = new YandexPlatform(fake.sdk);
    expect(await platform.purchase('no_ads')).toBeNull();
  });

  it('игра без покупок не падает на старте платежей', async () => {
    const fake = fakeSdk({
      getPayments: async () => {
        throw new Error('покупки не подключены');
      },
    });
    const platform = new YandexPlatform(fake.sdk);
    expect(await platform.products()).toEqual([]);
    expect(await platform.purchase('no_ads')).toBeNull();
    await expect(platform.consumePurchase('tok')).resolves.toBeUndefined();
  });

  it('результат в таблицу уходит целым и неотрицательным', async () => {
    const fake = fakeSdk();
    const platform = new YandexPlatform(fake.sdk);
    await platform.submitScore('best', 12.7);
    await platform.submitScore('best', -5);
    expect(fake.scores).toEqual([
      ['best', 13],
      ['best', 0],
    ]);
  });

  it('недоступный метод таблиц пропускается молча', async () => {
    const fake = fakeSdk({ isAvailableMethod: async () => false });
    const platform = new YandexPlatform(fake.sdk);
    await platform.submitScore('best', 10);
    expect(fake.scores).toEqual([]);
  });

  it('окно оценки: спрашиваем разрешения и только потом открываем', async () => {
    const platform = new YandexPlatform(fakeSdk().sdk);
    expect(await platform.canReview()).toBe(true);
    expect(await platform.requestReview()).toBe(true);

    const denied = new YandexPlatform(
      fakeSdk({ feedback: { canReview: async () => ({ value: false }) } }).sdk,
    );
    expect(await denied.canReview()).toBe(false);
  });
});
