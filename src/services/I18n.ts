type Lang = 'ru' | 'en';

export type Localized = Record<string, string>;

const STRINGS: Record<string, Localized> = {
  'shop.title': { ru: 'Снасти', en: 'Gear' },
  'shop.open': { ru: 'Снасти', en: 'Gear' },
  'shop.close': { ru: 'Закрыть', en: 'Close' },
  'shop.buy': { ru: 'Купить', en: 'Buy' },
  'shop.max': { ru: 'Максимум', en: 'Maxed' },
  'shop.locked': { ru: 'Не хватает', en: 'Not enough' },
  'hud.money': { ru: '₽', en: '₽' },
  'hud.album': { ru: 'Виды', en: 'Species' },
  'toast.bought': { ru: 'Куплено: {name} ур. {level}', en: 'Bought: {name} lv. {level}' },
};

/**
 * Локализация. Язык площадка отдаёт сама (ysdk.environment.i18n.lang) — это
 * требование модерации, автоопределение обязательно.
 *
 * Русский для ru/be/kk/uk/uz, английский для остальных.
 */
export class I18n {
  private lang: Lang = 'ru';

  setLang(code: string): void {
    this.lang = ['ru', 'be', 'kk', 'uk', 'uz'].includes(code.slice(0, 2)) ? 'ru' : 'en';
  }

  get current(): Lang {
    return this.lang;
  }

  /** Строка из словаря с подстановкой {placeholder}. */
  t(key: string, params: Record<string, string | number> = {}): string {
    const entry = STRINGS[key];
    const raw = entry?.[this.lang] ?? entry?.ru ?? key;
    return raw.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
  }

  /** Локализованное поле прямо из контента. */
  pick(value: Localized): string {
    return value[this.lang] ?? value.ru ?? '';
  }
}

export const i18n = new I18n();
