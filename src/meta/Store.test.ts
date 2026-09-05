import { describe, expect, it } from 'vitest';
import { Store } from './Store';
import { PRODUCTS } from '../content/products';

const durable = PRODUCTS.find((product) => product.kind === 'durable')!;
const consumable = PRODUCTS.find((product) => product.kind === 'consumable')!;
const noAdsProduct = PRODUCTS.find((product) => product.grant.noAds)!;

describe('внутриигровые покупки', () => {
  it('каталог не пуст и у каждого товара есть содержимое', () => {
    expect(PRODUCTS.length).toBeGreaterThan(0);
    for (const product of PRODUCTS) {
      const grant = product.grant;
      const empty = !grant.money && !grant.rod && !grant.noAds;
      expect(empty, product.id).toBe(false);
      expect(product.title.ru, product.id).toBeTruthy();
      expect(product.title.en, product.id).toBeTruthy();
    }
  });

  it('расходуемый товар выдаётся каждый раз и списывается', () => {
    const store = new Store();
    const first = store.redeem({ productId: consumable.id, token: 'a' });
    const second = store.redeem({ productId: consumable.id, token: 'b' });

    expect(first.consume).toBe(true);
    expect(first.money).toBeGreaterThan(0);
    expect(second.money).toBe(first.money);
  });

  it('непотребляемый товар выдаётся ровно один раз', () => {
    const store = new Store();
    const first = store.redeem({ productId: durable.id, token: 'a' });
    const second = store.redeem({ productId: durable.id, token: 'a' });

    expect(first.consume).toBe(false);
    expect(store.isOwned(durable.id)).toBe(true);
    expect(second).toEqual({ money: 0, rod: 0, noAds: false, consume: false });
  });

  it('незнакомый товар не выдаётся и не списывается', () => {
    const store = new Store();
    const granted = store.redeem({ productId: 'из_будущей_версии', token: 'a' });

    // Не списываем: пусть покупка дождётся версии, которая умеет её выдать.
    expect(granted.consume).toBe(false);
    expect(granted.money).toBe(0);
  });

  it('«без рекламы» переживает перезагрузку', () => {
    const store = new Store();
    store.redeem({ productId: noAdsProduct.id, token: 'a' });
    expect(store.noAds).toBe(true);

    const restored = new Store();
    restored.restore(store.serialize());
    expect(restored.noAds).toBe(true);
    // И повторная обработка той же покупки ничего не начисляет заново.
    expect(restored.redeem({ productId: noAdsProduct.id, token: 'a' }).money).toBe(0);
  });

  it('битый сейв не даёт товаров', () => {
    const store = new Store();
    store.restore({ owned: ['ничего_такого'] });
    expect(store.noAds).toBe(false);
    expect(store.isOwned('ничего_такого')).toBe(false);
  });
});
