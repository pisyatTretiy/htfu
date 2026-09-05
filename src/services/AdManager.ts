import type { IPlatform } from '../platform';

/**
 * Полноэкранную рекламу не показываем чаще, чем раз в три минуты, и только
 * между сессиями. Площадка сама ограничивает частоту, но полагаться на это
 * нельзя: модерация проверяет, что игрок не ловит рекламу посреди действия.
 */
export const INTERSTITIAL_COOLDOWN_MS = 180_000;

export interface AdHooks {
  /** Пауза геймплея и глушение звука — требование модерации. */
  pause(): void;
  resume(): void;
  /** Сброс сейва в облако перед рекламой: игрок может уйти прямо из ролика. */
  flush(): Promise<void>;
}

/**
 * Показ рекламы по правилам площадки (docs/02, § 2.4).
 *
 * Rewarded — всегда добровольно и всегда сверх обычного прохождения: без
 * единого просмотра игра проходится полностью.
 */
export class AdManager {
  private lastInterstitial: number;
  private busy = false;
  private adFree = false;
  private bannerVisible = false;

  constructor(
    private readonly platform: IPlatform,
    private readonly hooks: AdHooks,
    private readonly now: () => number = () => Date.now(),
  ) {
    // Отсчёт идёт от старта сессии: первые три минуты игрок не должен ловить
    // рекламу вообще — он ещё разбирается, что здесь происходит.
    this.lastInterstitial = this.now();
  }

  /**
   * Купленное «без рекламы». Ролики за награду это не отменяет: они
   * добровольные и остаются доступными — игрок платил за то, чтобы реклама не
   * приходила сама, а не за отказ от бонусов.
   */
  setAdFree(value: boolean): void {
    this.adFree = value;
    if (value && this.bannerVisible) void this.banner(false);
  }

  /**
   * Стики-баннер живёт только в мета-экранах: магазин, альбом, карта, дела.
   * В игровой сцене его нет — это и требование площадки, и здравый смысл:
   * баннер поверх воды закрывает ровно то, по чему игрок целится.
   */
  async banner(show: boolean): Promise<void> {
    const wanted = show && !this.adFree;
    if (wanted === this.bannerVisible) return;
    this.bannerVisible = wanted;
    if (wanted) await this.platform.showBanner();
    else await this.platform.hideBanner();
  }

  /** Реклама уже шла недавно — показывать рано. */
  get interstitialReady(): boolean {
    if (this.adFree) return false;
    return !this.busy && this.now() - this.lastInterstitial >= INTERSTITIAL_COOLDOWN_MS;
  }

  /** @returns был ли показ */
  async interstitial(): Promise<boolean> {
    if (!this.interstitialReady) return false;
    this.busy = true;
    this.hooks.pause();
    await this.hooks.flush();
    try {
      await this.platform.showInterstitial();
      this.lastInterstitial = this.now();
      return true;
    } finally {
      this.hooks.resume();
      this.busy = false;
    }
  }

  /** @returns засчитан ли просмотр — награду выдаём только при true */
  async rewarded(placement: string): Promise<boolean> {
    if (this.busy) return false;
    this.busy = true;
    this.hooks.pause();
    await this.hooks.flush();
    try {
      return await this.platform.showRewarded(placement);
    } finally {
      this.hooks.resume();
      this.busy = false;
    }
  }
}
