import { describe, expect, it } from 'vitest';
import { Bosses, bossAsCatch, BOSSES } from './Bosses';
import { FightSystem } from '../gameplay/FightSystem';
import { COMPETENT, gearForZone, simulateFight } from '../gameplay/Simulate';
import { ZONES } from './Zones';
import type { BossEntry } from '../content/types';

/**
 * Доля побед вменяемого игрока со стартовой снастью. Модель — общая с
 * симулятором баланса (`npm run balance`).
 */
function landRate(boss: BossEntry, runs = 6): number {
  // Снасть на шаг позади его локации: игрок мог не докупить последнее.
  const index = BOSSES.indexOf(boss);
  let landed = 0;
  for (let seed = 1; seed <= runs; seed++) {
    const result = simulateFight(bossAsCatch(boss), seed * 1409, COMPETENT, {
      ...gearForZone(index - 1),
      phases: boss.phases,
    });
    if (result.outcome === 'landed') landed += 1;
  }
  return landed / runs;
}

/** Сколько фаз босс успевает показать за бой. */
function phasesSeen(boss: BossEntry): number {
  const fight = new FightSystem(bossAsCatch(boss), 11, gearForZone(BOSSES.indexOf(boss)), {
    phases: boss.phases,
    ...(boss.patience === undefined ? {} : { patience: boss.patience }),
  });
  const step = 1 / 120;
  let maxPhase = 0;
  for (let i = 0; i < 120 * 200; i++) {
    if (fight.tension > 0.62) fight.reeling = false;
    else if (fight.tension < 0.24) fight.reeling = true;
    const outcome = fight.step(step);
    maxPhase = Math.max(maxPhase, fight.phase);
    if (outcome !== 'fighting') break;
  }
  return maxPhase + 1;
}

function playGreedily(boss: BossEntry): string {
  const fight = new FightSystem(bossAsCatch(boss), 11, { reelPower: 1, lineStrength: 1 }, {
    phases: boss.phases,
    ...(boss.patience === undefined ? {} : { patience: boss.patience }),
  });
  fight.reeling = true;
  const step = 1 / 120;
  for (let i = 0; i < 120 * 200; i++) {
    const outcome = fight.step(step);
    if (outcome !== 'fighting') return outcome;
  }
  return 'timeout';
}

describe('боссы', () => {
  it('у каждой локации ровно один босс', () => {
    for (const zone of ZONES) {
      const found = BOSSES.filter((boss) => boss.zone === zone.id);
      expect(found.length, zone.id).toBe(1);
    }
  });

  it('бой идёт тремя фазами и выигрывается вменяемым ритмом', () => {
    for (const boss of BOSSES) {
      // Отставший на шаг по снасти игрок всё ещё должен побеждать: половина
      // побед — порог, ниже которого босс превращается в стену.
      expect(landRate(boss), boss.name.ru).toBeGreaterThanOrEqual(0.5);
      expect(phasesSeen(boss), `${boss.name.ru}: фазы`).toBe(boss.phases.length);
    }
  });

  it('зажатый палец рвёт леску на любом боссе', () => {
    for (const boss of BOSSES) {
      expect(playGreedily(boss), boss.name.ru).toBe('snapped');
    }
  });

  it('боссы становятся сложнее по цепочке локаций', () => {
    const order = ZONES.map((zone) => BOSSES.find((boss) => boss.zone === zone.id));
    for (let i = 1; i < order.length; i++) {
      const previous = order[i - 1];
      const current = order[i];
      expect(current?.reward, current?.id).toBeGreaterThan(previous?.reward ?? 0);
      expect(current?.requiresCatches, current?.id).toBeGreaterThanOrEqual(
        previous?.requiresCatches ?? 0,
      );
    }
  });

  it('босс приходит после нужного числа уловов и только один раз', () => {
    const bosses = new Bosses();
    const boss = bosses.bossOf('dock');
    expect(boss).not.toBeNull();

    for (let i = 0; i < (boss?.requiresCatches ?? 0) - 1; i++) {
      bosses.countCatch('dock');
      expect(bosses.isReady('dock')).toBe(false);
    }
    bosses.countCatch('dock');
    expect(bosses.isReady('dock')).toBe(true);

    bosses.defeat(boss!.id);
    expect(bosses.isReady('dock')).toBe(false);
    expect(bosses.isDefeated(boss!.id)).toBe(true);
  });

  it('сорвавшийся босс возвращается, но не сразу', () => {
    const bosses = new Bosses();
    const boss = bosses.bossOf('dock');
    for (let i = 0; i < (boss?.requiresCatches ?? 0); i++) bosses.countCatch('dock');
    expect(bosses.isReady('dock')).toBe(true);

    bosses.escaped('dock');
    expect(bosses.isReady('dock')).toBe(false);
    bosses.countCatch('dock');
    bosses.countCatch('dock');
    bosses.countCatch('dock');
    expect(bosses.isReady('dock')).toBe(true);
  });

  it('битый сейв с чужими трофеями игнорируется', () => {
    const bosses = new Bosses();
    bosses.restore({ trophies: ['boss_som', 'boss_dragon'], catches: {} });
    expect(bosses.trophyCount).toBe(1);
    expect(bosses.isDefeated('boss_som')).toBe(true);
  });
});
