import { describe, expect, it } from 'vitest';
import { STRINGS, i18n, type Localized } from './I18n';
import { CATCH_ENTRIES } from '../content/catalog';
import { ZONES } from '../meta/Zones';
import { BOSSES } from '../meta/Bosses';
import { QUESTS } from '../meta/Quests';
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
