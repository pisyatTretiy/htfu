type Lang = 'ru' | 'en';

export type Localized = Record<string, string>;

/** Словарь целиком: экспортирован, чтобы тест мог проверить его на полноту. */
export const STRINGS: Record<string, Localized> = {
  'shop.title': { ru: 'Снасти', en: 'Gear' },
  'shop.open': { ru: 'Снасти', en: 'Gear' },
  'shop.close': { ru: 'Закрыть', en: 'Close' },
  'shop.buy': { ru: 'Купить', en: 'Buy' },
  'shop.max': { ru: 'Максимум', en: 'Maxed' },
  'shop.locked': { ru: 'Не хватает', en: 'Not enough' },
  'hud.money': { ru: '₽', en: '₽' },
  'hud.streak': { ru: 'серия ×{mult}', en: 'streak ×{mult}' },
  'hud.album': { ru: 'Виды', en: 'Species' },
  'toast.bought': { ru: 'Куплено: {name} ур. {level}', en: 'Bought: {name} lv. {level}' },
  'album.open': { ru: 'Альбом', en: 'Album' },
  'album.title': { ru: 'Альбом', en: 'Album' },
  'album.unknown': { ru: 'Не пойман', en: 'Not caught yet' },
  'album.times': { ru: '{count} шт.', en: '×{count}' },
  'album.kind.fish': { ru: 'рыба', en: 'fish' },
  'album.kind.critter': { ru: 'живность', en: 'critter' },
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
  'gauge.depth': { ru: 'Глубина {depth} из {limit} м', en: 'Depth {depth} of {limit} m' },
  'gauge.tension': { ru: 'Натяжение лески', en: 'Line tension' },
  'gauge.stamina': { ru: 'Рыба выдыхается', en: 'The fish is tiring' },
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
  'toast.boss': { ru: 'Награда: {reward} ₽', en: 'Reward: {reward} ₽' },
  'quest.done': { ru: 'Все задания причала выполнены', en: 'All dock quests done' },
  'quest.reward': { ru: 'Задание выполнено: {title} · +{reward} ₽', en: 'Quest complete: {title} · +{reward} ₽' },
  'toast.newSpecies': { ru: 'Новый вид в альбоме!', en: 'New species in the album!' },
  'toast.newVariant': { ru: 'Новый вариант в альбоме!', en: 'New variant in the album!' },
  'toast.speciesDone': { ru: '{name}: все варианты собраны! +25 % к цене', en: '{name}: all variants collected! +25% price' },
  'album.bonus': { ru: 'Собрано {percent} % · цена +{price} % · леска +{line} %', en: 'Filled {percent}% · price +{price}% · line +{line}%' },
  // Прилагательное согласуется с родом названия. В английском форма одна,
  // но ключи парные: подстановка не должна знать, какой язык сейчас включён.
  'rarity.rare.m': { ru: 'Редкий {name}', en: 'Rare {name}' },
  'rarity.rare.f': { ru: 'Редкая {name}', en: 'Rare {name}' },
  'rarity.rare.n': { ru: 'Редкое {name}', en: 'Rare {name}' },
  'rarity.gold.m': { ru: 'Золотой {name}', en: 'Golden {name}' },
  'rarity.gold.f': { ru: 'Золотая {name}', en: 'Golden {name}' },
  'rarity.gold.n': { ru: 'Золотое {name}', en: 'Golden {name}' },
  'boot.noWebgl': {
    ru: 'Браузер не поддерживает трёхмерную графику. Попробуйте другой браузер или устройство.',
    en: 'This browser has no 3D graphics support. Try another browser or device.',
  },
  'boot.failed': {
    ru: 'Не удалось запустить игру. Прогресс сохранён — попробуйте перезагрузить страницу.',
    en: 'The game failed to start. Progress is saved — try reloading the page.',
  },
  'lost.text': {
    ru: 'Браузер освободил видеопамять, пока вкладка была в фоне. Прогресс сохранён.',
    en: 'The browser reclaimed video memory while the tab was in the background. Progress is saved.',
  },
  'lost.reload': { ru: 'Продолжить', en: 'Continue' },
  'boss.tag': { ru: 'Хозяин этих вод', en: 'Master of these waters' },
  'boss.won': { ru: 'Трофей добыт', en: 'Trophy taken' },
  'settings.title': { ru: 'Настройки', en: 'Settings' },
  'settings.sound': { ru: 'Звук', en: 'Sound' },
  'settings.quality': { ru: 'Графика', en: 'Graphics' },
  // Подсказка описывает то, что включено сейчас: кнопка показывает текущий
  // режим, и общая на два режима подпись «тени и полное разрешение» рядом с
  // кнопкой «Бюджетная» читалась как обещание того, чего нет.
  'settings.qualityHighHint': {
    ru: 'Тени и полное разрешение. Переключение перезагрузит страницу',
    en: 'Shadows and full resolution. Switching reloads the page',
  },
  'settings.qualityLowHint': {
    ru: 'Без теней, разрешение ниже — для слабых устройств. Переключение перезагрузит страницу',
    en: 'No shadows, lower resolution — for weak devices. Switching reloads the page',
  },
  'settings.on': { ru: 'Вкл', en: 'On' },
  'settings.off': { ru: 'Выкл', en: 'Off' },
  'settings.high': { ru: 'Высокая', en: 'High' },
  'settings.low': { ru: 'Бюджетная', en: 'Budget' },
  'sound.toggle': { ru: 'Звук', en: 'Sound' },
  // Название игры. Одно и то же в <title>, на экране загрузки и в консоли
  // разработчика: расхождение — отдельный пункт проверки при модерации, а до
  // этой правки оно писалось тремя разными способами.
  'boot.title': { ru: 'Клёв! Остров рыбака', en: 'Hook & Home' },
  'toast.bite': { ru: 'Клюёт!', en: 'A bite!' },
  'toast.trick': { ru: 'Трюк-шот!', en: 'Trick shot!' },
  'toast.trickStreak': { ru: 'Трюк-шот ×{count}', en: 'Trick shot ×{count}' },
  'toast.phase': { ru: 'Он разозлился! Фаза {phase}', en: 'It got angry! Phase {phase}' },
  'toast.snapped': { ru: 'Леска лопнула!', en: 'The line snapped!' },
  'toast.escaped': { ru: 'Улов сорвался!', en: 'It got away!' },
  'toast.returned': { ru: '{name} снова на крючке!', en: '{name} is back on!' },
  'toast.caught': { ru: '{name}! +{reward} ₽', en: '{name}! +{reward} ₽' },
  'toast.inBoat': { ru: '{name} на настиле!', en: '{name} is on the deck!' },
  'toast.subdued': { ru: '{name} больше не буянит! +{reward} ₽', en: '{name} settles down! +{reward} ₽' },
  'toast.overboard': { ru: '{name} уходит в воду!', en: '{name} slips into the water!' },
  'toast.doubled': { ru: 'Улов удвоен! +{reward} ₽', en: 'Catch doubled! +{reward} ₽' },
  'offer.double': { ru: 'Удвоить ×2 · {reward} ₽', en: 'Double ×2 · {reward} ₽' },
  'offer.retry': { ru: 'Вторая попытка · {name}', en: 'Second try · {name}' },
  'offer.chest': { ru: 'Сундук дня ×3 · +{reward} ₽', en: 'Daily chest ×3 · +{reward} ₽' },
  'toast.chest': { ru: 'Сундук дня: +{reward} ₽', en: 'Daily chest: +{reward} ₽' },
  'store.title': { ru: 'За деньги', en: 'Paid extras' },
  'store.buy': { ru: 'Купить', en: 'Buy' },
  'store.granted': { ru: 'Получено: {name}', en: 'Granted: {name}' },
  'lure.title': { ru: 'Приманка', en: 'Lure' },
  'lure.hint': {
    ru: 'Пять минут повышенного шанса на редкий вариант',
    en: 'Five minutes of a better shot at rare variants',
  },
  'lure.watch': { ru: 'Ролик', en: 'Watch' },
  'lure.extend': { ru: 'Продлить', en: 'Extend' },
  'lure.left': { ru: 'Приманка {time}', en: 'Lure {time}' },
  'toast.lure': { ru: 'Приманка на {minutes} мин!', en: 'Lure for {minutes} min!' },
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
