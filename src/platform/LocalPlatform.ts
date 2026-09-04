import type { IPlatform, SaveData } from './IPlatform';

const SAVE_KEY = 'htfu.save';

/**
 * Заглушка для локальной разработки: реклама — пауза на две секунды в консоли,
 * сохранения — localStorage. Позволяет писать игру, не открывая портал.
 */
export class LocalPlatform implements IPlatform {
  readonly name = 'local';

  async init(): Promise<void> {
    console.info('[platform] LocalPlatform: SDK площадки не найден, работаем локально');
  }

  ready(): void {
    console.info('[platform] ready()');
  }

  gameplayStart(): void {
    console.debug('[platform] gameplay start');
  }

  gameplayStop(): void {
    console.debug('[platform] gameplay stop');
  }

  lang(): string {
    return navigator.language.slice(0, 2) || 'ru';
  }

  isTV(): boolean {
    return false;
  }

  async showRewarded(placement: string): Promise<boolean> {
    console.info(`[platform] rewarded «${placement}» — заглушка, награда выдана`);
    await new Promise((resolve) => setTimeout(resolve, 400));
    return true;
  }

  async showInterstitial(): Promise<void> {
    console.info('[platform] interstitial — заглушка');
    await new Promise((resolve) => setTimeout(resolve, 400));
  }

  async showBanner(): Promise<void> {}
  async hideBanner(): Promise<void> {}

  async load(): Promise<SaveData | null> {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      return raw ? (JSON.parse(raw) as SaveData) : null;
    } catch {
      return null;
    }
  }

  async save(data: SaveData): Promise<void> {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // Приватный режим браузера — молча продолжаем на памяти.
    }
  }

  async submitScore(board: string, value: number): Promise<void> {
    console.info(`[platform] score «${board}» = ${value} — заглушка`);
  }
}
