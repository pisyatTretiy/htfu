import { describe, expect, it, vi } from 'vitest';
import { AdManager, INTERSTITIAL_COOLDOWN_MS } from './AdManager';
import type { IPlatform, SaveData } from '../platform';

function fakePlatform(rewarded = true): IPlatform & { interstitials: number; banners: number } {
  return {
    interstitials: 0,
    banners: 0,
    name: 'fake',
    async init() {},
    ready() {},
    gameplayStart() {},
    gameplayStop() {},
    lang: () => 'ru',
    isTV: () => false,
    async showRewarded() {
      return rewarded;
    },
    async showInterstitial() {
      this.interstitials += 1;
    },
    async showBanner() {
      this.banners += 1;
    },
    async hideBanner() {
      this.banners -= 1;
    },
    async canReview() {
      return false;
    },
    async requestReview() {
      return false;
    },
    async products() {
      return [];
    },
    async pendingPurchases() {
      return [];
    },
    async purchase() {
      return null;
    },
    async consumePurchase() {},
    async load(): Promise<SaveData | null> {
      return null;
    },
    async save() {},
    async submitScore() {},
  } as IPlatform & { interstitials: number; banners: number };
}

function hooks() {
  return { pause: vi.fn(), resume: vi.fn(), flush: vi.fn().mockResolvedValue(undefined) };
}

describe('показ рекламы', () => {
  it('не показывает рекламу в первые минуты сессии', async () => {
    const platform = fakePlatform();
    let now = 0;
    const ads = new AdManager(platform, hooks(), () => now);

    expect(await ads.interstitial()).toBe(false);

    now += INTERSTITIAL_COOLDOWN_MS;
    expect(await ads.interstitial()).toBe(true);
    expect(platform.interstitials).toBe(1);
  });

  it('держит паузу между полноэкранными блоками', async () => {
    const platform = fakePlatform();
    let now = INTERSTITIAL_COOLDOWN_MS;
    const ads = new AdManager(platform, hooks(), () => now);

    now += INTERSTITIAL_COOLDOWN_MS;
    expect(await ads.interstitial()).toBe(true);
    expect(await ads.interstitial()).toBe(false);

    now += INTERSTITIAL_COOLDOWN_MS - 1;
    expect(await ads.interstitial()).toBe(false);

    now += 1;
    expect(await ads.interstitial()).toBe(true);
    expect(platform.interstitials).toBe(2);
  });

  it('ставит геймплей на паузу и сбрасывает сейв перед показом', async () => {
    const events = hooks();
    const ads = new AdManager(fakePlatform(), events);

    await ads.rewarded('double');

    expect(events.pause).toHaveBeenCalledTimes(1);
    expect(events.flush).toHaveBeenCalledTimes(1);
    expect(events.resume).toHaveBeenCalledTimes(1);
  });

  it('возвращает награду только при засчитанном просмотре', async () => {
    const granted = new AdManager(fakePlatform(true), hooks());
    const skipped = new AdManager(fakePlatform(false), hooks());

    expect(await granted.rewarded('double')).toBe(true);
    expect(await skipped.rewarded('double')).toBe(false);
  });

  it('снимает паузу, даже если показ упал с ошибкой', async () => {
    const events = hooks();
    const platform = fakePlatform();
    platform.showRewarded = async () => {
      throw new Error('сеть отвалилась');
    };
    const ads = new AdManager(platform, events);

    await expect(ads.rewarded('double')).rejects.toThrow();
    expect(events.resume).toHaveBeenCalledTimes(1);
  });

  it('баннер показывается только в мета-экранах и только один раз', async () => {
    const platform = fakePlatform();
    const ads = new AdManager(platform, hooks());

    await ads.banner(true);
    await ads.banner(true);
    expect(platform.banners).toBe(1);

    await ads.banner(false);
    await ads.banner(false);
    expect(platform.banners).toBe(0);
  });

  it('купленное «без рекламы» убирает и баннер, и полноэкранную', async () => {
    const platform = fakePlatform();
    let now = 0;
    const ads = new AdManager(platform, hooks(), () => now);

    await ads.banner(true);
    expect(platform.banners).toBe(1);

    // Кулдаун давно прошёл: без покупки реклама была бы готова к показу.
    now = INTERSTITIAL_COOLDOWN_MS * 3;
    expect(ads.interstitialReady).toBe(true);

    ads.setAdFree(true);
    await Promise.resolve();
    expect(platform.banners).toBe(0);
    expect(ads.interstitialReady).toBe(false);
    expect(await ads.interstitial()).toBe(false);

    await ads.banner(true);
    expect(platform.banners).toBe(0);
  });
});
describe('отказы вокруг показа', () => {
  it('не сбросившийся сейв не отменяет награду', async () => {
    // Сброс сейва перед роликом — предосторожность на случай, что вкладку
    // закроют во время показа. Если облако молчит, ролик всё равно должен
    // состояться: иначе икота сети стоит игроку награды.
    const events = hooks();
    events.flush.mockRejectedValue(new Error('облако недоступно'));
    const ads = new AdManager(fakePlatform(true), events);

    await expect(ads.rewarded('double')).resolves.toBe(true);
    expect(events.resume).toHaveBeenCalledTimes(1);
  });
});
