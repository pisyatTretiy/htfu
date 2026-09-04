import { describe, expect, it } from 'vitest';
import { Zones, zoneCatchIds, ZONES } from './Zones';
import { poolAt } from '../gameplay/CatchPool';
import { rollCatch } from '../gameplay/CatchPool';
import { Rng } from '../core/Rng';

describe('локации', () => {
  it('первая локация открыта сразу, остальные — нет', () => {
    const zones = new Zones();
    const fresh = { money: 0, questsDone: 0 };
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

  it('в закрытую локацию не переехать, в открытую — можно', () => {
    const zones = new Zones();
    expect(zones.travelTo('abyss', { money: 0, questsDone: 0 })).toBe(false);
    expect(zones.current.id).toBe('dock');

    expect(zones.travelTo('bay', { money: 0, questsDone: 5 })).toBe(true);
    expect(zones.current.id).toBe('bay');
  });

  it('битый сейв с несуществующей локацией не ломает игру', () => {
    const zones = new Zones();
    zones.restore('atlantis');
    expect(zones.current.id).toBe('dock');
  });
});
