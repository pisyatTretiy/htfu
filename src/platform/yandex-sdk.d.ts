/**
 * Минимальные типы SDK Яндекс Игр — только то, что мы реально вызываем.
 * Официального npm-пакета с типами нет, SDK приходит тегом <script>.
 * Документация: https://yandex.ru/dev/games/doc/ru/sdk/sdk-about
 */
declare global {
  interface Window {
    YaGames?: {
      init(options?: { signed?: boolean }): Promise<YandexSdk>;
    };
  }
}

export interface YandexAdvCallbacks {
  onOpen?: () => void;
  onClose?: (wasShown: boolean) => void;
  onError?: (error: unknown) => void;
  onRewarded?: () => void;
}

export interface YandexPlayer {
  isAuthorized(): boolean;
  getUniqueID(): string;
  getName(): string;
  getData(keys?: string[]): Promise<Record<string, unknown>>;
  setData(data: Record<string, unknown>, flush?: boolean): Promise<void>;
}

export interface YandexPurchase {
  productID: string;
  purchaseToken: string;
}

export interface YandexProduct {
  id: string;
  title: string;
  description: string;
  imageURI: string;
  price: string;
  priceValue: string;
  priceCurrencyCode: string;
}

export interface YandexPayments {
  purchase(options: { id: string; developerPayload?: string }): Promise<YandexPurchase>;
  getPurchases(): Promise<YandexPurchase[]>;
  getCatalog(): Promise<YandexProduct[]>;
  consumePurchase(token: string): Promise<void>;
}

export interface YandexSdk {
  environment: { i18n: { lang: string }; app?: { id?: string } };
  deviceInfo: { isMobile(): boolean; isTV(): boolean; isDesktop(): boolean };
  features?: {
    LoadingAPI?: { ready(): void };
    GameplayAPI?: { start(): void; stop(): void };
  };
  adv: {
    showFullscreenAdv(options?: { callbacks?: YandexAdvCallbacks }): void;
    showRewardedVideo(options?: { callbacks?: YandexAdvCallbacks }): void;
    showBannerAdv(): Promise<unknown>;
    hideBannerAdv(): Promise<unknown>;
  };
  leaderboards?: {
    setScore(name: string, score: number, extraData?: string): Promise<void>;
  };
  feedback?: {
    canReview(): Promise<{ value: boolean; reason?: string }>;
    requestReview(): Promise<{ feedbackSent: boolean }>;
  };
  getPlayer(options?: { scopes?: boolean }): Promise<YandexPlayer>;
  getPayments(options?: { signed?: boolean }): Promise<YandexPayments>;
  isAvailableMethod(name: string): Promise<boolean>;
}

export {};
