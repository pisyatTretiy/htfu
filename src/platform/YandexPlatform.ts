import type { IPlatform, SaveData } from './IPlatform';
import type { YandexPlayer, YandexSdk } from './yandex-sdk';

/** Ключ, под которым сейв лежит в облаке площадки. */
const SAVE_KEY = 'save';

/**
 * Реальная интеграция с площадкой. Весь код SDK живёт только здесь: игровая
 * логика знает лишь интерфейс IPlatform (ADR-0001, § 4.3).
 *
 * ⚠️ Проверено только против заглушки. Настоящий прогон возможен лишь на
 * черновике в консоли разработчика — там живая реклама, авторизация и
 * облачные сохранения (docs/02, § 2.7).
 */
export class YandexPlatform implements IPlatform {
  readonly name = 'yandex';

  private player: YandexPlayer | null = null;
  private locale = 'ru';

  constructor(private readonly sdk: YandexSdk) {}

  async init(): Promise<void> {
    this.locale = this.sdk.environment.i18n.lang || 'ru';
    try {
      // Гостевой режим — норма: диалог авторизации показываем только по
      // осознанному действию игрока, этого требует площадка.
      this.player = await this.sdk.getPlayer({ scopes: false });
    } catch (error) {
      console.warn('[platform] игрок недоступен, продолжаем гостем', error);
    }
  }

  ready(): void {
    this.sdk.features?.LoadingAPI?.ready();
  }

  gameplayStart(): void {
    this.sdk.features?.GameplayAPI?.start();
  }

  gameplayStop(): void {
    this.sdk.features?.GameplayAPI?.stop();
  }

  lang(): string {
    return this.locale;
  }

  isTV(): boolean {
    try {
      return this.sdk.deviceInfo.isTV();
    } catch {
      return false;
    }
  }

  /** @returns true только если просмотр засчитан. */
  showRewarded(placement: string): Promise<boolean> {
    return new Promise((resolve) => {
      let rewarded = false;
      this.sdk.adv.showRewardedVideo({
        callbacks: {
          // Награду выдаём строго здесь, а не в onClose: закрыть ролик можно
          // и досрочно.
          onRewarded: () => {
            rewarded = true;
          },
          onClose: () => resolve(rewarded),
          onError: (error) => {
            console.warn(`[adv] rewarded «${placement}» не показан`, error);
            resolve(false);
          },
        },
      });
    });
  }

  showInterstitial(): Promise<void> {
    return new Promise((resolve) => {
      this.sdk.adv.showFullscreenAdv({
        callbacks: {
          onClose: () => resolve(),
          onError: (error) => {
            console.warn('[adv] полноэкранная реклама не показана', error);
            resolve();
          },
        },
      });
    });
  }

  async showBanner(): Promise<void> {
    try {
      await this.sdk.adv.showBannerAdv();
    } catch (error) {
      console.warn('[adv] баннер не показан', error);
    }
  }

  async hideBanner(): Promise<void> {
    try {
      await this.sdk.adv.hideBannerAdv();
    } catch (error) {
      console.warn('[adv] баннер не спрятан', error);
    }
  }

  async load(): Promise<SaveData | null> {
    if (!this.player) return null;
    try {
      const data = await this.player.getData([SAVE_KEY]);
      const raw = data[SAVE_KEY];
      return raw && typeof raw === 'object' ? (raw as SaveData) : null;
    } catch (error) {
      console.warn('[save] облачный сейв не прочитан', error);
      return null;
    }
  }

  async save(data: SaveData): Promise<void> {
    if (!this.player) return;
    try {
      await this.player.setData({ [SAVE_KEY]: data }, true);
    } catch (error) {
      console.warn('[save] облачный сейв не записан', error);
    }
  }

  async submitScore(board: string, value: number): Promise<void> {
    try {
      if (!(await this.sdk.isAvailableMethod('leaderboards.setScore'))) return;
      await this.sdk.leaderboards?.setScore(board, Math.max(0, Math.round(value)));
    } catch (error) {
      console.warn(`[leaderboard] результат «${board}» не отправлен`, error);
    }
  }
}
