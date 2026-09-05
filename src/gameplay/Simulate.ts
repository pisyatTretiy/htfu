import { FightSystem } from './FightSystem';
import { Rng } from '../core/Rng';
import type { CatchEntry, FightPhase } from '../content/types';

/** Шаг симуляции боя — тот же, что в сцене: бой считается детерминированно. */
const STEP = 1 / 120;
/** Задержка реакции живого игрока: без неё модель играет идеально и врёт. */
const REACTION_S = 0.15;

export interface PlayerModel {
  /** Начинает подматывать, когда натяжение ниже этого. */
  hold: number;
  /** Отпускает, когда натяжение выше этого. */
  release: number;
  /** Задержка реакции, секунды. */
  reaction: number;
  /** Читает рывки рыбы и не тянет на пике — то самое умение из docs/03, § 3.3. */
  readsSurge?: boolean;
}

/** Игрок, который понял правила: тянет в паузах, отпускает на подходе к обрыву. */
export const COMPETENT: PlayerModel = { hold: 0.24, release: 0.62, reaction: REACTION_S };
/** Читает рывки: тянет только в паузах между потяжками. */
export const MASTER: PlayerModel = {
  hold: 0.5,
  release: 0.8,
  reaction: REACTION_S,
  readsSurge: true,
};
/** Разбирается по ходу: отпускает поздновато, реагирует небыстро. */
export const LEARNING: PlayerModel = { hold: 0.42, release: 0.75, reaction: 0.25 };
/** Осторожный: отпускает рано и подматывает редко — рыба успевает отдохнуть. */
export const TIMID: PlayerModel = { hold: 0.12, release: 0.35, reaction: 0.2 };
/** Новичок: тянет почти всегда и отпускает поздно. */
export const ROOKIE: PlayerModel = { hold: 0.55, release: 0.86, reaction: 0.35 };

/**
 * Снасть, с которой игрок приходит к боссу N-й локации.
 *
 * Гейт по снасти отстаёт от прогресса на шаг: до пятой локации доходят,
 * победив четырёх боссов и продав трофеи, — предполагать, что игрок при этом
 * ни разу не зашёл в магазин, странно. Но и полной прокачки требовать нельзя.
 * Значения общие для подгонки данных (tools/tune-fights.ts), отчёта по
 * балансу и тестов: иначе данные подгонялись бы под одну снасть, а
 * проверялись бы другой.
 */
export function gearForZone(index: number): { reelPower: number; lineStrength: number } {
  const level = 1 + Math.max(0, index) * 0.12;
  return { reelPower: level, lineStrength: level };
}

export interface FightResult {
  outcome: 'landed' | 'snapped' | 'escaped';
  seconds: number;
}

export interface FightSetupForSim {
  reelPower?: number;
  lineStrength?: number;
  phases?: FightPhase[];
}

/**
 * Прогнать один бой моделью игрока.
 *
 * Считается тем же `FightSystem`, что и в игре: балансировать по формуле на
 * бумаге бессмысленно — рывки, откат и задержка реакции складываются в
 * поведение, которое проще измерить, чем вывести.
 */
export function simulateFight(
  entry: CatchEntry,
  seed: number,
  player: PlayerModel = COMPETENT,
  setup: FightSetupForSim = {},
): FightResult {
  const fight = new FightSystem(
    entry,
    seed,
    { reelPower: setup.reelPower ?? 1, lineStrength: setup.lineStrength ?? 1 },
    setup.phases ? { phases: setup.phases } : {},
  );

  let time = 0;
  let nextDecision = 0;
  let outcome: FightResult['outcome'] | 'fighting' = 'fighting';

  while (outcome === 'fighting' && time < 120) {
    if (time >= nextDecision) {
      const tension = fight.tensionRatio;
      if (player.readsSurge) {
        // Мастер смотрит не на шкалу, а на рыбу: тянет в паузе между рывками.
        fight.reeling = fight.surge < 0.3 && tension < player.release;
      } else if (fight.reeling && tension > player.release) {
        fight.reeling = false;
      } else if (!fight.reeling && tension < player.hold) {
        fight.reeling = true;
      }
      nextDecision = time + player.reaction;
    }
    const step = fight.step(STEP);
    outcome = step === 'fighting' ? 'fighting' : step;
    time += STEP;
  }

  return { outcome: outcome === 'fighting' ? 'escaped' : outcome, seconds: time };
}

export interface SpeciesStats {
  id: string;
  landed: number;
  snapped: number;
  escaped: number;
  averageSeconds: number;
}

/** Статистика по виду за N боёв: доля побед и средняя длина боя. */
export function simulateSpecies(
  entry: CatchEntry,
  runs = 200,
  player: PlayerModel = COMPETENT,
  setup: FightSetupForSim = {},
): SpeciesStats {
  const rng = new Rng(entry.id.length * 7919 + runs);
  const stats: SpeciesStats = {
    id: entry.id,
    landed: 0,
    snapped: 0,
    escaped: 0,
    averageSeconds: 0,
  };

  let total = 0;
  for (let i = 0; i < runs; i++) {
    const result = simulateFight(entry, rng.int(1, 1 << 20), player, setup);
    stats[result.outcome] += 1;
    total += result.seconds;
  }
  stats.averageSeconds = total / runs;
  return stats;
}
