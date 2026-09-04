import { clamp } from '../core/world';
import { Rng } from '../core/Rng';
import type { CatchEntry, FightPhase } from '../content/types';

/** Базовый порог обрыва. Прокачка удилища его поднимает. */
const BASE_BREAK_AT = 1;
/** Скорость роста натяжения от самой подмотки, без учёта рывков. */
const REEL_TENSION = 0.34;
/** Скорость падения натяжения, когда игрок отпустил. */
const RELAX = 0.62;
/**
 * Через столько секунд улов срывается сам. Без этого бой не имеет давления:
 * можно просто не тянуть, и рыба будет висеть на крючке бесконечно.
 */
const PATIENCE = 28;
/** У боссов бой длиннее по замыслу, поэтому и терпения больше. */
const BOSS_PATIENCE = 70;

export type FightOutcome = 'fighting' | 'landed' | 'snapped' | 'escaped';

export interface FightSetup {
  /** Фазы боя: на порогах усталости меняются рывки. Только у боссов. */
  phases?: FightPhase[];
}

export interface FightModifiers {
  /** Множитель к тому, как быстро рыба выдыхается (катушка). */
  reelPower: number;
  /** Во сколько раз выше порог обрыва (удилище). */
  lineStrength: number;
}

const NO_MODIFIERS: FightModifiers = { reelPower: 1, lineStrength: 1 };

/**
 * Бой с рыбой: натяжение против усталости.
 *
 * Система детерминированная и считается фиксированным шагом. Леска, изгиб
 * удилища и тряска камеры её только показывают — правило из ADR-0001, § 2.1.
 * Иначе на слабом устройстве игрок проигрывал бы из-за просадки FPS, а
 * лидерборды считали бы нечестные рекорды.
 */
export class FightSystem {
  /** 0 — леска свободна, 1 — обрыв. */
  tension = 0;
  /** 1 — рыба полна сил, 0 — сдалась. */
  stamina = 1;
  /** Игрок держит палец: идёт подмотка. */
  reeling = false;
  outcome: FightOutcome = 'fighting';

  /** Сила текущего рывка 0..1 — для тряски камеры и звука. */
  surge = 0;

  /** Сколько терпения улова осталось, 0..1. */
  get patienceLeft(): number {
    return clamp(1 - this.time / this.patience, 0, 1);
  }

  private time = 0;
  private readonly rng: Rng;

  private readonly breakAt: number;
  private readonly reelPower: number;
  private readonly phases: FightPhase[];
  private readonly patience: number;

  /** Номер текущей фазы боя. У обычной рыбы всегда 0. */
  phase = 0;
  /** Взводится на переходе между фазами: сцена превращает это в тряску и звук. */
  phaseJustChanged = false;

  constructor(
    private readonly entry: CatchEntry,
    seed: number,
    modifiers: FightModifiers = NO_MODIFIERS,
    setup: FightSetup = {},
  ) {
    this.rng = new Rng(seed);
    this.stamina = entry.fight.stamina;
    this.breakAt = BASE_BREAK_AT * modifiers.lineStrength;
    this.reelPower = modifiers.reelPower;
    this.phases = setup.phases ?? [];
    this.patience = this.phases.length > 0 ? BOSS_PATIENCE : PATIENCE;
  }

  get isBoss(): boolean {
    return this.phases.length > 0;
  }

  /** Параметры текущей фазы: у босса они меняются по ходу боя. */
  private get params(): {
    drain: number;
    pull: number;
    burst: number;
    rhythm: number;
    recover: number;
  } {
    const phase = this.phases[this.phase];
    return phase ?? this.entry.fight;
  }

  private updatePhase(): void {
    if (this.phases.length === 0) return;
    let next = this.phase;
    for (let i = this.phases.length - 1; i >= 0; i--) {
      if (this.stamina <= (this.phases[i]?.from ?? 1)) {
        next = i;
        break;
      }
    }
    if (next !== this.phase) {
      this.phase = next;
      this.phaseJustChanged = true;
    }
  }

  /** Натяжение в долях от порога обрыва — именно это рисует полоска. */
  get tensionRatio(): number {
    return clamp(this.tension / this.breakAt, 0, 1);
  }

  get isJunk(): boolean {
    return this.entry.kind === 'junk';
  }

  step(dt: number): FightOutcome {
    if (this.outcome !== 'fighting') return this.outcome;

    this.time += dt;
    this.updatePhase();
    const { drain, pull, burst, rhythm, recover } = this.params;

    // Рывки: пила по фазе даёт резкий бросок и медленный откат — рыба дёргает,
    // а не тянет ровно. Уставшая рыба дёргает слабее.
    const phase = (this.time * rhythm) % 1;
    const shape = phase < 0.22 ? phase / 0.22 : Math.pow(1 - (phase - 0.22) / 0.78, 1.7);
    this.surge = shape * this.stamina;

    const pullNow = pull * (1 + (burst - 1) * shape) * this.stamina;

    if (this.reeling) {
      this.tension += (REEL_TENSION + pullNow) * dt;
      this.stamina = clamp(this.stamina - drain * this.reelPower * dt, 0, 1);
    } else {
      this.tension -= RELAX * dt;
      this.stamina = clamp(this.stamina + recover * dt, 0, 1);
    }
    this.tension = clamp(this.tension, 0, this.breakAt);

    if (this.tension >= this.breakAt) {
      this.outcome = 'snapped';
    } else if (this.stamina <= 0) {
      this.outcome = 'landed';
    } else if (this.time >= this.patience) {
      this.outcome = 'escaped';
    }
    return this.outcome;
  }

  /** Цена улова с учётом того, как он был взят. */
  reward(trickShot: boolean): number {
    const size = 0.8 + this.rng.next() * 0.6;
    const quality = trickShot ? 1.25 : 1;
    return Math.round(this.entry.price * size * quality);
  }
}
