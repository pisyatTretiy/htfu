import data from './products.json';
import type { Localized } from '../services/I18n';

export interface ProductGrant {
  /** Сколько денег начислить. */
  money?: number;
  /** На сколько уровней поднять удилище. */
  rod?: number;
  /** Убрать полноэкранную рекламу и баннер. */
  noAds?: boolean;
}

export interface ProductEntry {
  id: string;
  /** consumable списывается после выдачи, durable остаётся у игрока навсегда. */
  kind: 'consumable' | 'durable';
  title: Localized;
  note: Localized;
  grant: ProductGrant;
}

export const PRODUCTS: readonly ProductEntry[] = (
  data as unknown as { products: ProductEntry[] }
).products;

export function productById(id: string): ProductEntry | undefined {
  return PRODUCTS.find((product) => product.id === id);
}
