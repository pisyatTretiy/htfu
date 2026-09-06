import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STRINGS, i18n, type Localized } from './I18n';
import { CATCH_ENTRIES } from '../content/catalog';
import { ZONES } from '../meta/Zones';
import { BOSSES } from '../meta/Bosses';
import { QUESTS } from '../meta/Quests';
import { PRANKS } from '../gameplay/Mischief';
import { PRODUCTS } from '../content/products';
import { ONBOARDING_ASIDES, ONBOARDING_CHAIN } from '../meta/Onboarding';
import { Dailies } from '../meta/Dailies';
import { Progression } from '../meta/Progression';

/** Все языки, на которых игра обещает говорить (docs/03, § 3.1). */
const LANGS = ['ru', 'en'] as const;

/** {placeholder} из строки: подстановки обязаны совпадать во всех языках. */
function slots(text: string): string[] {
  return [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] as string).sort();
}

function checkAll(where: string, values: (Localized | undefined)[]): void {
  for (const value of values) {
    expect(value, where).toBeDefined();
    for (const lang of LANGS) {
      expect(value?.[lang]?.trim(), `${where}.${lang}`).toBeTruthy();
    }
  }
}

describe('полнота перевода', () => {
  it('в словаре у каждой строки есть оба языка', () => {
    for (const [key, value] of Object.entries(STRINGS)) checkAll(key, [value]);
  });

  it('подстановки в переводе те же, что в оригинале', () => {
    // Разъехавшиеся плейсхолдеры — это не опечатка, а пустое место в
    // интерфейсе: «Bought:  lv. » вместо названия и уровня.
    for (const [key, value] of Object.entries(STRINGS)) {
      expect(slots(value.en ?? ''), key).toEqual(slots(value.ru ?? ''));
    }
  });

  it('весь контент переведён: улов, локации, боссы, задания, товары', () => {
    for (const entry of CATCH_ENTRIES) checkAll(`catch.${entry.id}`, [entry.name]);
    for (const zone of ZONES) checkAll(`zone.${zone.id}`, [zone.name, zone.note]);
    for (const boss of BOSSES) {
      checkAll(`boss.${boss.id}`, [boss.name, boss.trophy, boss.taunt]);
    }
    for (const quest of QUESTS) checkAll(`quest.${quest.id}`, [quest.title, quest.npc]);
    for (const task of new Dailies().tasks) checkAll(`daily.${task.id}`, [task.title]);
    for (const branch of new Progression().branches) {
      checkAll(`branch.${branch.id}`, [branch.name, branch.hint, branch.unit]);
    }
    for (const product of PRODUCTS) {
      checkAll(`product.${product.id}`, [product.title, product.note]);
    }
    for (const hint of [...ONBOARDING_CHAIN, ...ONBOARDING_ASIDES]) {
      checkAll(`onboarding.${hint.id}`, [hint.text]);
    }
  });

  it('английский не отдаёт русский текст', () => {
    i18n.setLang('en');
    const cyrillic = /[А-Яа-я]/;
    for (const key of Object.keys(STRINGS)) {
      expect(cyrillic.test(i18n.t(key)), key).toBe(false);
    }
    for (const entry of CATCH_ENTRIES) {
      expect(cyrillic.test(i18n.pick(entry.name)), entry.id).toBe(false);
    }
    i18n.setLang('ru');
  });

  it('язык площадки определяется по коду, а не по стране', () => {
    for (const code of ['ru', 'be', 'kk', 'uk', 'uz', 'ru-RU']) {
      i18n.setLang(code);
      expect(i18n.current, code).toBe('ru');
    }
    for (const code of ['en', 'tr', 'es', 'en-US']) {
      i18n.setLang(code);
      expect(i18n.current, code).toBe('en');
    }
    i18n.setLang('ru');
  });
});

describe('род названий', () => {
  /**
   * Род однословного русского названия предсказуем по окончанию, и на этом
   * строится проверка: «а/я» — женский, «о/е» — средний, согласная — мужской.
   * Мягкий знак неоднозначен (сельдь — она, угорь — он), составные названия
   * тоже: у «Рыбы-шар» и «Краба-Клешни» главное слово стоит первым, а у
   * «Бутылки с запиской» последнее слово вовсе в творительном падеже. Такие
   * названия проверить окончанием нельзя, и они оставлены данным.
   */
  function expectedGender(name: string): 'm' | 'f' | 'n' | null {
    if (/[\s-]/.test(name)) return null;
    const last = name.slice(-1).toLowerCase();
    if (last === 'ь') return null;
    if ('ая'.includes(last)) return 'f';
    if ('ое'.includes(last)) return 'n';
    return 'm';
  }

  it('у каждого вида и босса указан род', () => {
    for (const entry of CATCH_ENTRIES) {
      expect(entry.gender, entry.id).toMatch(/^[mfn]$/);
    }
    for (const boss of BOSSES) {
      expect(boss.gender, boss.id).toMatch(/^[mfn]$/);
    }
  });

  it('род сходится с окончанием там, где окончание однозначно', () => {
    for (const entry of CATCH_ENTRIES) {
      const expected = expectedGender(entry.name.ru ?? '');
      if (expected) expect(entry.gender, `${entry.id}: ${entry.name.ru}`).toBe(expected);
    }
  });

  it('прилагательное редкости есть во всех трёх родах', () => {
    for (const rarity of ['rare', 'gold']) {
      for (const gender of ['m', 'f', 'n']) {
        const line = STRINGS[`rarity.${rarity}.${gender}`];
        expect(line, `rarity.${rarity}.${gender}`).toBeDefined();
        expect(line?.ru).toContain('{name}');
      }
    }
  });

  it('в подписях улова нет глаголов прошедшего времени: они требуют рода', () => {
    // Прошедшее время в русском согласуется с подлежащим («сапог вернулся»,
    // «плотва вернулась»), а подлежащее здесь — имя из данных. Настоящее
    // время рода не имеет, поэтому подходит любому виду.
    // Сеть, а не разбор языка: ловим окончания прошедшего времени (-л и его
    // формы, включая возвратные -лся/-лась), горстку неправильных форм без
    // «л» и краткие причастия («усмирён»), которые согласуются так же.
    // Возвратное «-ся» само по себе в список не входит: «вцепляется» —
    // настоящее время и рода не имеет.
    //
    // Граница слова \b в JavaScript считает словом только латиницу и цифры,
    // поэтому после кириллической буквы её попросту нет — с ней проверка
    // молча пропускала всё подряд. Конец слова ищем взглядом вперёд.
    const past =
      /\{name\}\s+[а-яё]*(?:лся|лась|лось|лись|ел|ёл|ил|ул|ал|ял|ыл|ол|ла|ло|нёс|вёз|мог|шиб|тёр|ён|ен|ан|ян)(?![а-яё])/i;
    const lines: [string, Localized][] = [
      ...Object.entries(STRINGS),
      ...Object.entries(PRANKS).flatMap(([kind, list]) =>
        list.map((line, index): [string, Localized] => [`prank.${kind}.${index}`, line]),
      ),
    ];
    for (const [key, line] of lines) {
      if (!line.ru?.includes('{name}')) continue;
      expect(line.ru, key).not.toMatch(past);
    }
  });
});

describe('название игры', () => {
  /**
   * «Название одинаково во всех материалах и на всех языках» — отдельный пункт
   * проверки при модерации. До этого теста русское имя писалось тремя
   * способами сразу: «Клёв! Остров рыбака» в заголовке вкладки, «Клёв!» на
   * экране загрузки и «Клёв!» в словаре.
   */
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

  it('имя в словаре, в заголовке вкладки и на экране загрузки — одно и то же', () => {
    const name = STRINGS['boot.title']?.ru;
    expect(name).toBeTruthy();
    expect(html).toContain(`<title>${name}</title>`);
    expect(html).toContain(`<div class="t">${name}</div>`);
  });

  it('английское имя объявлено и не повторяет русское', () => {
    const line = STRINGS['boot.title'];
    expect(line?.en).toBeTruthy();
    expect(line?.en).not.toBe(line?.ru);
  });
});
