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
  'album.open': { ru: 'Альбом', en: 'Album' },
  'album.title': { ru: 'Альбом', en: 'Album' },
  'album.unknown': { ru: 'Не пойман', en: 'Not caught yet' },
  'album.times': { ru: '{count} шт.', en: '×{count}' },
  'album.kind.fish': { ru: 'рыба', en: 'fish' },
  'album.kind.junk': { ru: 'мусор', en: 'junk' },
  'quest.label': { ru: 'Задание', en: 'Quest' },
  'quest.done': { ru: 'Все задания причала выполнены', en: 'All dock quests done' },
  'quest.reward': { ru: 'Задание выполнено: {title} · +{reward} ₽', en: 'Quest complete: {title} · +{reward} ₽' },
  'toast.newSpecies': { ru: 'Новый вид в альбоме!', en: 'New species in the album!' },
  'toast.doubled': { ru: 'Улов удвоен! +{reward} ₽', en: 'Catch doubled! +{reward} ₽' },
  'offer.double': { ru: 'Удвоить ×2 · {reward} ₽', en: 'Double ×2 · {reward} ₽' },
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
