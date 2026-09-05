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
  'daily.title': { ru: 'Дела на сегодня', en: "Today's tasks" },
  'daily.open': { ru: 'Дела', en: 'Tasks' },
  'daily.claim': { ru: 'Забрать', en: 'Claim' },
  'daily.claimed': { ru: 'Забрано +{reward} ₽ · серия {streak} дн.', en: 'Claimed +{reward} ₽ · {streak}-day streak' },
  'daily.done': { ru: 'Дело выполнено: {title}', en: 'Task complete: {title}' },
  'daily.taken': { ru: 'Готово', en: 'Done' },
  'daily.streak': { ru: 'Серия {days} дн. · награды ×{mult}', en: '{days}-day streak · rewards ×{mult}' },
  'quest.chain': { ru: 'Цепочка причала', en: 'Dock chain' },
  'gauge.power': { ru: 'Сила заброса', en: 'Cast power' },
  'gauge.tension': { ru: 'Натяжение лески', en: 'Line tension' },
  'gauge.patience': { ru: 'Улов вырывается', en: 'The catch is escaping' },
  'map.open': { ru: 'Карта', en: 'Map' },
  'map.title': { ru: 'Архипелаг', en: 'Archipelago' },
  'map.here': { ru: 'Вы здесь', en: 'You are here' },
  'map.go': { ru: 'Плыть', en: 'Sail' },
  'map.depth': { ru: 'до {depth} м', en: 'to {depth} m' },
  'map.needQuests': { ru: 'Нужно заданий: {value}', en: 'Quests needed: {value}' },
  'map.needMoney': { ru: 'Нужно {value} ₽', en: 'Needs {value} ₽' },
  'map.needBoss': { ru: 'Победить: {name}', en: 'Defeat: {name}' },
  'album.trophies': { ru: 'Трофеи', en: 'Trophies' },
  'album.noTrophy': { ru: 'Не побеждён', en: 'Not defeated' },
  'toast.boss': { ru: '{name} повержен! Трофей: {trophy}', en: '{name} defeated! Trophy: {trophy}' },
  'quest.done': { ru: 'Все задания причала выполнены', en: 'All dock quests done' },
  'quest.reward': { ru: 'Задание выполнено: {title} · +{reward} ₽', en: 'Quest complete: {title} · +{reward} ₽' },
  'toast.newSpecies': { ru: 'Новый вид в альбоме!', en: 'New species in the album!' },
  'toast.newVariant': { ru: 'Новый вариант в альбоме!', en: 'New variant in the album!' },
  'toast.speciesDone': { ru: '{name}: все варианты собраны! +25 % к цене', en: '{name}: all variants collected! +25% price' },
  'album.bonus': { ru: 'Собрано {percent} % · цена +{price} % · леска +{line} %', en: 'Filled {percent}% · price +{price}% · line +{line}%' },
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
