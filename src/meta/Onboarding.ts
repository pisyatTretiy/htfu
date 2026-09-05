import type { Localized } from '../services/I18n';

/**
 * События игры, на которые реагирует обучение. Список намеренно короткий:
 * обучение не должно знать ни про сцену, ни про интерфейс.
 */
export type OnboardingSignal =
  | 'cast'
  | 'bite'
  | 'landed'
  | 'snapped'
  | 'subdued'
  | 'bought'
  | 'quest'
  | 'traveled';

/** Что игра знает о моменте, когда решает — показывать подсказку или нет. */
export interface OnboardingContext {
  /** Состояние сцены: idle, sinking, fighting, onboard и так далее. */
  state: string;
  /** Хватает денег хотя бы на один апгрейд. */
  canAfford: boolean;
  /** Есть открытая локация, кроме текущей. */
  hasNewZone: boolean;
  /** Открыта панель: поверх неё подсказка не нужна. */
  panelOpen: boolean;
}

export interface OnboardingHint {
  id: string;
  /** Текст в одну строку — правило из docs/03, § 3.6. */
  text: Localized;
  /** Состояния сцены, в которых подсказка уместна. */
  states: readonly string[];
  /** Сигнал, закрывающий подсказку навсегда. */
  done: OnboardingSignal;
  /** Дополнительное условие: без него подсказка молчит, но не пропускается. */
  gate?: (context: OnboardingContext) => boolean;
}

/**
 * Основная цепочка первых десяти минут: заброс → клёв → бой → снасти →
 * задание → карта. Порядок жёсткий, шаг закрывается только своим сигналом.
 */
export const ONBOARDING_CHAIN: readonly OnboardingHint[] = [
  {
    id: 'cast',
    text: { ru: 'Зажми экран и отпусти — заброс', en: 'Hold the screen, release to cast' },
    states: ['idle'],
    done: 'cast',
  },
  {
    id: 'steer',
    text: { ru: 'Веди крючок к рыбе', en: 'Steer the hook toward a fish' },
    states: ['sinking'],
    done: 'bite',
  },
  {
    id: 'fight',
    text: { ru: 'Тяни рывками: красное — обрыв', en: 'Reel in bursts: red means snap' },
    states: ['fighting'],
    done: 'landed',
  },
  {
    id: 'shop',
    text: { ru: 'Снасти внизу: леска станет крепче', en: 'Gear below: a stronger line' },
    states: ['idle'],
    done: 'bought',
    gate: (context) => context.canAfford,
  },
  {
    id: 'quest',
    text: { ru: 'Строка сверху — задание скупщика', en: 'The bar on top is your quest' },
    states: ['idle'],
    done: 'quest',
  },
  {
    id: 'map',
    text: { ru: 'Карта: открылась новая вода', en: 'Map: new waters are open' },
    states: ['idle'],
    done: 'traveled',
    gate: (context) => context.hasNewZone,
  },
];

/**
 * Разовые подсказки «по случаю». Они вне цепочки: рыба-хулиган или обрыв
 * лески могут случиться в любой момент, а могут не случиться вовсе.
 */
export const ONBOARDING_ASIDES: readonly (OnboardingHint & { arm?: OnboardingSignal })[] = [
  {
    id: 'subdue',
    text: { ru: 'Улов буянит: тапай по нему', en: 'The catch is thrashing: tap it' },
    states: ['onboard'],
    done: 'subdued',
  },
  {
    id: 'retry',
    text: { ru: 'Отпускай, пока леска не покраснела', en: 'Ease off before the line reddens' },
    states: ['idle'],
    done: 'landed',
    arm: 'snapped',
  },
];

export interface OnboardingState {
  /** Индекс шага цепочки. Равен длине цепочки — обучение пройдено. */
  step: number;
  /** Закрытые разовые подсказки. */
  seen: string[];
}

/**
 * Обучение первых десяти минут (docs/03, § 3.6).
 *
 * Ни одного модального окна: игра ведёт одной строкой, которая появляется
 * ровно в том состоянии, где подсказка что-то значит, и исчезает, как только
 * игрок сделал нужное действие. Логика чистая — сцена и интерфейс о ней не
 * знают, поэтому её целиком закрывают тесты.
 */
export class Onboarding {
  private index = 0;
  private readonly seen = new Set<string>();
  private readonly armed = new Set<string>();

  constructor() {
    for (const aside of ONBOARDING_ASIDES) if (!aside.arm) this.armed.add(aside.id);
  }

  get finished(): boolean {
    return this.index >= ONBOARDING_CHAIN.length;
  }

  /** Текущий шаг цепочки или null, если она пройдена. */
  get step(): OnboardingHint | null {
    return ONBOARDING_CHAIN[this.index] ?? null;
  }

  /** Что показать прямо сейчас. Разовая подсказка важнее шага цепочки. */
  hint(context: OnboardingContext): Localized | null {
    if (context.panelOpen) return null;

    for (const aside of ONBOARDING_ASIDES) {
      if (this.seen.has(aside.id) || !this.armed.has(aside.id)) continue;
      if (!aside.states.includes(context.state)) continue;
      if (aside.gate && !aside.gate(context)) continue;
      return aside.text;
    }

    const step = this.step;
    if (!step) return null;
    if (!step.states.includes(context.state)) return null;
    if (step.gate && !step.gate(context)) return null;
    return step.text;
  }

  /**
   * Событие игры. Возвращает true, если что-то закрылось — вызывающему это
   * нужно, чтобы перерисовать строку подсказки.
   */
  signal(kind: OnboardingSignal): boolean {
    let changed = false;

    for (const aside of ONBOARDING_ASIDES) {
      if (aside.arm === kind && !this.seen.has(aside.id) && !this.armed.has(aside.id)) {
        this.armed.add(aside.id);
        changed = true;
      }
      if (aside.done === kind && this.armed.has(aside.id) && !this.seen.has(aside.id)) {
        this.seen.add(aside.id);
        changed = true;
      }
    }

    // Сигнал закрывает текущий шаг или перепрыгивает вперёд: игрок мог сам
    // купить снасть раньше, чем игра успела про неё намекнуть.
    const ahead = ONBOARDING_CHAIN.findIndex(
      (step, at) => at >= this.index && step.done === kind,
    );
    if (ahead >= 0) {
      this.index = ahead + 1;
      changed = true;
    }
    return changed;
  }

  /** Обучение целиком: для игроков, которые пришли из старой версии. */
  skipAll(): void {
    this.index = ONBOARDING_CHAIN.length;
    for (const aside of ONBOARDING_ASIDES) this.seen.add(aside.id);
  }

  restore(state: OnboardingState | undefined): void {
    if (!state) return;
    this.index = clampIndex(state.step);
    for (const id of state.seen ?? []) this.seen.add(id);
  }

  serialize(): OnboardingState {
    return { step: this.index, seen: [...this.seen] };
  }
}

function clampIndex(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.min(Math.floor(value), ONBOARDING_CHAIN.length);
}
