import type { IPlatform, Product, Purchase, SaveData } from './IPlatform';
import { PRODUCTS } from '../content/products';

const SAVE_KEY = 'htfu.save';
const PURCHASE_KEY = 'htfu.purchases';

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

  async canReview(): Promise<boolean> {
    return true;
  }

  async requestReview(): Promise<boolean> {
    console.info('[platform] окно оценки — заглушка');
    return false;
  }

  // --- покупки: заглушка, повторяющая поведение площадки -------------------

  async products(): Promise<Product[]> {
    return PRODUCTS.map((product) => ({ id: product.id, price: '— ₽' }));
  }

  /**
   * Незавершённые покупки живут в localStorage: так локально воспроизводится
   * главный сценарий модерации — игра закрылась между оплатой и выдачей.
   */
  async pendingPurchases(): Promise<Purchase[]> {
    try {
      const raw = localStorage.getItem(PURCHASE_KEY);
      return raw ? (JSON.parse(raw) as Purchase[]) : [];
    } catch {
      return [];
    }
  }

  async purchase(productId: string): Promise<Purchase | null> {
    if (!PRODUCTS.some((product) => product.id === productId)) return null;
    const record: Purchase = { productId, token: `local-${productId}-${Date.now()}` };
    const pending = await this.pendingPurchases();
    this.writePurchases([...pending, record]);
    console.info(`[platform] покупка «${productId}» — заглушка, оплата пройдена`);
    return record;
  }

  async consumePurchase(token: string): Promise<void> {
    const pending = await this.pendingPurchases();
    this.writePurchases(pending.filter((record) => record.token !== token));
  }

  private writePurchases(records: Purchase[]): void {
    try {
      localStorage.setItem(PURCHASE_KEY, JSON.stringify(records));
    } catch {
      // Приватный режим: покупки живут только в этой вкладке.
    }
  }
}
