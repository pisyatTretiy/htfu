/**
 * Граница между игрой и площадкой. Игровой код знает только этот интерфейс —
 * ни одного обращения к window.YaGames за пределами YandexPlatform.
 *
 * Зачем: локальная разработка идёт без портала, а порт на другую площадку
 * становится вопросом одного файла. Подробности — docs/adr/0001-stack.md.
 */
export interface SaveData {
  version: number;
  updatedAt: number;
  [key: string]: unknown;
}

/** Товар из каталога площадки. Цену форматирует площадка, не игра. */
export interface Product {
  id: string;
  price: string;
}

/** Покупка, которую игра ещё не обработала. */
export interface Purchase {
  productId: string;
  token: string;
}

export interface IPlatform {
  readonly name: string;

  init(): Promise<void>;

  /** Ресурсы загружены, интерфейс интерактивен (LoadingAPI.ready на площадке). */
  ready(): void;

  /** Разметка активного геймплея (GameplayAPI на площадке). */
  gameplayStart(): void;
  gameplayStop(): void;

  lang(): string;
  isTV(): boolean;

  /** true — просмотр засчитан и награду нужно выдать. */
  showRewarded(placement: string): Promise<boolean>;
  showInterstitial(): Promise<void>;
  showBanner(): Promise<void>;
  hideBanner(): Promise<void>;

  load(): Promise<SaveData | null>;
  save(data: SaveData): Promise<void>;

  submitScore(board: string, value: number): Promise<void>;

  /** Каталог площадки. Пустой список — покупки недоступны, магазин прячем. */
  products(): Promise<Product[]>;
  /**
   * Покупки, не выданные игроку. Обрабатывать при каждом запуске — без этого
   * модерация не пропускает (docs/02, § 2.5).
   */
  pendingPurchases(): Promise<Purchase[]>;
  /** null — игрок отменил покупку или она не прошла. */
  purchase(productId: string): Promise<Purchase | null>;
  /** Пометить расходуемую покупку выданной. */
  consumePurchase(token: string): Promise<void>;
}
