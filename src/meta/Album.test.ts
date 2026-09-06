import { describe, expect, it } from 'vitest';
import { Album } from './Album';
import { CATCH_ENTRIES } from '../content/catalog';
import { BOSSES } from './Bosses';
import { RARITIES } from '../gameplay/Rarity';

const FIRST = CATCH_ENTRIES[0]!.id;
const SECOND = CATCH_ENTRIES[1]!.id;

describe('альбом', () => {
  it('различает первую встречу вида и первый вариант', () => {
    const album = new Album();

    const first = album.record(FIRST, 'common');
    expect(first.firstEver).toBe(true);
    expect(first.firstVariant).toBe(true);

    const again = album.record(FIRST, 'common');
    expect(again.firstEver).toBe(false);
    expect(again.firstVariant).toBe(false);

    const rare = album.record(FIRST, 'rare');
    expect(rare.firstEver).toBe(false);
    expect(rare.firstVariant).toBe(true);
  });

  it('вид считается собранным только со всеми тремя вариантами', () => {
    const album = new Album();
    album.record(FIRST, 'common');
    album.record(FIRST, 'rare');
    expect(album.isComplete(FIRST)).toBe(false);

    const done = album.record(FIRST, 'gold');
    expect(done.speciesCompleted).toBe(true);
    expect(album.isComplete(FIRST)).toBe(true);

    // Повторная поимка не «пересобирает» вид второй раз.
    expect(album.record(FIRST, 'gold').speciesCompleted).toBe(false);
  });

  it('собранный вид даёт прибавку к своей цене, остальные — нет', () => {
    const album = new Album();
    for (const rarity of RARITIES) album.record(FIRST, rarity);

    expect(album.priceMultiplierFor(FIRST)).toBeCloseTo(1.25);
    expect(album.priceMultiplierFor(SECOND)).toBe(1);
  });

  it('бонусы растут ступенями по заполнению', () => {
    const album = new Album();
    expect(album.priceMultiplier).toBe(1);
    expect(album.lineStrengthMultiplier).toBe(1);

    // Заполняем ровно четверть всех вариантов.
    const quarter = Math.ceil((CATCH_ENTRIES.length * RARITIES.length) / 4);
    let filled = 0;
    for (const entry of CATCH_ENTRIES) {
      for (const rarity of RARITIES) {
        if (filled >= quarter) break;
        album.record(entry.id, rarity);
        filled += 1;
      }
    }

    expect(album.fillPercent).toBeGreaterThanOrEqual(25);
    expect(album.priceMultiplier).toBeCloseTo(1.05);
    expect(album.lineStrengthMultiplier).toBeCloseTo(1.03);
  });

  it('полное заполнение даёт максимальные бонусы', () => {
    const album = new Album();
    for (const entry of CATCH_ENTRIES) {
      for (const rarity of RARITIES) album.record(entry.id, rarity);
    }
    expect(album.fillPercent).toBe(100);
    expect(album.completed).toBe(CATCH_ENTRIES.length);
    expect(album.priceMultiplier).toBeCloseTo(1.2);
    expect(album.lineStrengthMultiplier).toBeCloseTo(1.12);
  });

  it('читает старый плоский формат сейва как обычные варианты', () => {
    const album = new Album();
    album.restore({ [FIRST]: 7 } as never);

    expect(album.countOf(FIRST)).toBe(7);
    expect(album.hasVariant(FIRST, 'common')).toBe(true);
    expect(album.hasVariant(FIRST, 'gold')).toBe(false);
    expect(album.isComplete(FIRST)).toBe(false);
  });

  it('переживает сохранение и загрузку', () => {
    const album = new Album();
    album.record(FIRST, 'gold');
    album.record(SECOND, 'rare');
    album.record(SECOND, 'rare');

    const restored = new Album();
    restored.restore(album.serialize());

    expect(restored.countOf(FIRST, 'gold')).toBe(1);
    expect(restored.countOf(SECOND, 'rare')).toBe(2);
    expect(restored.discovered).toBe(2);
  });
});

describe('счёт видов и трофеи', () => {
  it('трофей босса не считается видом из каталога', () => {
    // Боссы пишутся в свой список и показываются отдельным разделом. Пока они
    // попадали в альбом наравне с рыбой, нижняя строка у собравшего всё
    // игрока показывала «57 из 52».
    const album = new Album();
    for (const entry of CATCH_ENTRIES) album.record(entry.id, 'common');
    expect(album.discovered).toBe(album.total);

    for (const boss of BOSSES) album.record(boss.id, 'common');
    expect(album.discovered).toBe(album.total);
    expect(album.fillPercent).toBeLessThanOrEqual(100);
  });
});
