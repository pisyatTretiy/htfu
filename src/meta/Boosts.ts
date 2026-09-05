/** Сколько минут работает приманка. */
export const LURE_MINUTES = 5;
/** Во сколько раз чаще попадаются редкие варианты под приманкой. */
export const LURE_LUCK = 1.3;

export interface BoostState {
  /** Момент, когда приманка перестаёт действовать. */
  lureUntil: number;
}

/**
 * Временные бонусы. Пока их один — приманка из docs/03, § 3.7.
 *
 * Правило площадки и здравого смысла: бонус за ролик всегда сверх обычного
 * прохождения и никогда не открывает то, что без него закрыто. Приманка
 * только повышает шанс редкого варианта — поймать можно и без неё.
 */
export class Boosts {
  private lureUntil = 0;

  /** Повторный ролик продлевает приманку, а не начинает её заново. */
  activateLure(now = Date.now()): void {
    const from = Math.max(this.lureUntil, now);
    this.lureUntil = from + LURE_MINUTES * 60_000;
  }

  isLureActive(now = Date.now()): boolean {
    return this.lureUntil > now;
  }

  secondsLeft(now = Date.now()): number {
    return Math.max(0, Math.ceil((this.lureUntil - now) / 1000));
  }

  /** Множитель к шансу редкого варианта. */
  luck(now = Date.now()): number {
    return this.isLureActive(now) ? LURE_LUCK : 1;
  }

  restore(state: BoostState | undefined): void {
    if (!state) return;
    const until = Number(state.lureUntil);
    this.lureUntil = Number.isFinite(until) && until > 0 ? until : 0;
  }

  serialize(): BoostState {
    return { lureUntil: this.lureUntil };
  }
}
