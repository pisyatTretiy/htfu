import { describe, expect, it } from 'vitest';
import { Zones, zoneCatchIds, ZONES } from './Zones';
import { BOSSES } from './Bosses';
import { poolAt } from '../gameplay/CatchPool';
import { rollCatch } from '../gameplay/CatchPool';
import { Rng } from '../core/Rng';

describe('локации', () => {
  it('первая локация открыта сразу, остальные — нет', () => {
    const zones = new Zones();
    const fresh = { money: 0, questsDone: 0, trophies: [] };
    expect(zones.isUnlocked(ZONES[0]!, fresh)).toBe(true);
    for (const zone of ZONES.slice(1)) {
      expect(zones.isUnlocked(zone, fresh), zone.id).toBe(false);
    }
  });

  it('глубина локаций растёт по цепочке', () => {
    for (let i = 1; i < ZONES.length; i++) {
      expect(ZONES[i]!.maxDepth, ZONES[i]!.id).toBeGreaterThan(ZONES[i - 1]!.maxDepth);
    }
  });

  it('в рабочих глубинах локации есть и рыба, и мусор', () => {
    for (const zone of ZONES) {
      const allowed = zoneCatchIds(zone);
      expect(allowed.length, zone.id).toBeGreaterThan(2);

      // У самой поверхности рыбы может не быть — там плавает мусор, и это
      // нормально. Проверяем рабочую часть столба воды.
      const depths = [0.3, 0.6, 1].map((share) => Math.floor(zone.maxDepth * share));
      for (const depth of depths) {
        const pool = poolAt(depth, allowed);
        expect(pool.some((entry) => entry.kind === 'fish'), `${zone.id} рыба на ${depth} м`).toBe(
          true,
        );
        expect(pool.some((entry) => entry.kind === 'junk'), `${zone.id} мусор на ${depth} м`).toBe(
          true,
        );
      }
    }
  });

  it('на любой глубине локации что-то да клюёт', () => {
    for (const zone of ZONES) {
      const allowed = zoneCatchIds(zone);
      for (let depth = 0; depth <= zone.maxDepth; depth += 5) {
        expect(poolAt(depth, allowed).length, `${zone.id} на ${depth} м`).toBeGreaterThan(0);
      }
    }
  });

  it('пул заброса не выдаёт видов из чужой локации', () => {
    for (const zone of ZONES) {
      const allowed = zoneCatchIds(zone);
      const rng = new Rng(zone.maxDepth);
      for (let i = 0; i < 300; i++) {
        const depth = (i / 300) * zone.maxDepth;
        const entry = rollCatch(depth, rng, allowed);
        expect(allowed, `${zone.id} на ${depth.toFixed(0)} м`).toContain(entry.id);
      }
    }
  });

  it('локации открываются трофеями боссов по цепочке', () => {
    const zones = new Zones();
    const nothing = { money: 999999, questsDone: 99, trophies: [] as string[] };

    // Ни деньги, ни задания не открывают локацию: нужен трофей.
    expect(zones.travelTo('bay', nothing)).toBe(false);
    expect(zones.current.id).toBe('dock');

    expect(zones.travelTo('bay', { ...nothing, trophies: ['boss_som'] })).toBe(true);
    expect(zones.current.id).toBe('bay');
    expect(zones.travelTo('wreck', { ...nothing, trophies: ['boss_som'] })).toBe(false);
  });

  it('у каждой закрытой локации есть свой босс-ключ', () => {
    for (const zone of ZONES.slice(1)) {
      expect(zone.unlock.type, zone.id).toBe('boss');
      expect(BOSSES.some((boss) => boss.id === zone.unlock.boss), zone.id).toBe(true);
    }
  });

  it('битый сейв с несуществующей локацией не ломает игру', () => {
    const zones = new Zones();
    zones.restore('atlantis');
    expect(zones.current.id).toBe('dock');
  });

  it('у каждой локации, кроме первой, есть своя особенность', () => {
    // Причал новичка не удивляет намеренно: там учат. Дальше каждая вода
    // должна отличаться механикой, а не только палитрой (docs/03, § 3.5).
    const [first, ...rest] = ZONES;
    expect(first?.modifiers ?? {}).toEqual({});
    for (const zone of rest) {
      const mods = zone.modifiers ?? {};
      expect(Object.keys(mods).length, zone.id).toBeGreaterThan(0);
    }
  });

  it('особенности локаций остаются в разумных пределах', () => {
    for (const zone of ZONES) {
      const mods = zone.modifiers ?? {};
      if (mods.drift !== undefined) {
        expect(Math.abs(mods.drift), zone.id).toBeLessThanOrEqual(1);
      }
      if (mods.junkShare !== undefined) {
        // Локация мусора остаётся местом рыбалки: больше половины — уже свалка.
        expect(mods.junkShare, zone.id).toBeGreaterThan(0.2);
        expect(mods.junkShare, zone.id).toBeLessThanOrEqual(0.5);
      }
      if (mods.lineStrength !== undefined) {
        expect(mods.lineStrength, zone.id).toBeGreaterThanOrEqual(0.8);
        expect(mods.lineStrength, zone.id).toBeLessThanOrEqual(1.2);
      }
      if (mods.darkness !== undefined) {
        expect(mods.darkness, zone.id).toBeGreaterThan(0);
        expect(mods.darkness, zone.id).toBeLessThanOrEqual(0.7);
      }
    }
  });
});