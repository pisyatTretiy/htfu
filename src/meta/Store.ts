import { PRODUCTS, productById, type ProductEntry, type ProductGrant } from '../content/products';
import type { Purchase } from '../platform';

export interface StoreState {
  /** Купленные непотребляемые товары: их не выдают дважды. */
  owned: string[];
}

/** Что покупка добавляет игроку. Начисляет вызывающий: Store ничего не знает про кошелёк. */
export interface Granted {
  money: number;
  rod: number;
  noAds: boolean;
  /** Расходуемую покупку нужно списать на площадке. */
  consume: boolean;
}

const NOTHING: Granted = { money: 0, rod: 0, noAds: false, consume: false };

/**
 * Внутриигровые покупки (docs/03, § 3.7).
 *
 * Главное правило площадки: **незавершённые покупки обрабатываются при каждом
 * запуске**. Игрок мог закрыть вкладку между оплатой и выдачей — деньги ушли,
 * товар не пришёл. Поэтому выдача идёт не из ответа на покупку, а из списка
 * незавершённых, и один и тот же список безопасно обрабатывать сколько угодно
 * раз: непотребляемый товар выдаётся один раз, расходуемый — списывается.
 */
export class Store {
  private readonly owned = new Set<string>();

  get all(): readonly ProductEntry[] {
    return PRODUCTS;
  }

  isOwned(id: string): boolean {
    return this.owned.has(id);
  }

  get noAds(): boolean {
    return PRODUCTS.some(
      (product) => product.grant.noAds === true && this.owned.has(product.id),
    );
  }

  /**
   * Разобрать одну незавершённую покупку.
   *
   * Незнакомый товар (например, из будущей версии игры) не списываем: пусть
   * дождётся версии, которая умеет его выдать, — иначе оплата пропадёт.
   */
  redeem(purchase: Purchase): Granted {
    const product = productById(purchase.productId);
    if (!product) return NOTHING;

    if (product.kind === 'durable') {
      if (this.owned.has(product.id)) return NOTHING;
      this.owned.add(product.id);
      return { ...fromGrant(product.grant), consume: false };
    }
    return { ...fromGrant(product.grant), consume: true };
  }

  restore(state: StoreState | undefined): void {
    for (const id of state?.owned ?? []) {
      if (productById(id)) this.owned.add(id);
    }
  }

  serialize(): StoreState {
    return { owned: [...this.owned] };
  }
}

function fromGrant(grant: ProductGrant): Omit<Granted, 'consume'> {
  return {
    money: Math.max(0, Math.round(grant.money ?? 0)),
    rod: Math.max(0, Math.round(grant.rod ?? 0)),
    noAds: grant.noAds === true,
  };
}
