import type { Localized } from '../services/I18n';

/** Типы контента. Данные лежат в JSON, код только читает — docs/04, § 4.2. */

export type CatchKind = 'fish' | 'junk';

/** Что вытащенное вытворяет на настиле (ADR-0003, носитель № 2). */
export type Mischief = 'flop' | 'grab' | 'steal' | 'none';

export interface FightPhase {
  /** Фаза включается, когда запас сил падает до этого значения. */
  from: number;
  drain: number;
  pull: number;
  burst: number;
  rhythm: number;
  recover: number;
}

export interface FightParams {
  /** Запас сил, всегда 1 — множители веса и размера идут отдельно. */
  stamina: number;
  /** Сколько сил тратится за секунду подмотки. */
  drain: number;
  /** Базовая сила рывка: сколько натяжения добавляет в секунду. */
  pull: number;
  /** Пиковая сила рывка в момент броска. */
  burst: number;
  /** Рывков в секунду. */
  rhythm: number;
  /** Сколько сил возвращается за секунду, пока игрок не тянет. */
  recover: number;
  /**
   * Через сколько секунд улов срывается сам. Считается по длине честного боя
   * (tools/tune-patience.ts), а не берётся с потолка: одинаковое терпение для
   * всех видов означало бы, что вялую рыбу невозможно вытащить в срок, а
   * бойкую — невозможно упустить.
   */
  patience?: number;
}

export interface BodyParams {
  length: number;
  /** Длин волны по телу — крупнее число, мельче извивы. */
  wave: number;
  /** Амплитуда изгиба в долях высоты. */
  amp: number;
  fill: string;
  outline: string;
}

export interface CatchEntry {
  id: string;
  /** Локализовано: модерация требует полного перевода на заявленные языки. */
  name: Localized;
  kind: CatchKind;
  /** Вес в пуле случайного выбора. */
  weight: number;
  /** Диапазон глубин в метрах, где встречается. */
  depth: [number, number];
  price: number;
  fight: FightParams;
  body: BodyParams;
  mischief: Mischief;
}

export interface CatchTable {
  entries: CatchEntry[];
}

/**
 * Босс локации. Бой идёт фазами, трофей отделён от обычного улова: в
 * оригинале путаница между трофеем и «мясом» стоила игрокам часов
 * (docs/01, § «Гейтинг прогресса»).
 */
export interface BossEntry {
  id: string;
  zone: string;
  name: Localized;
  trophy: Localized;
  /** Реплика перед боем: игрок должен понять, что это не обычная рыба. */
  taunt: Localized;
  /** Сколько уловов в локации нужно сделать, прежде чем босс клюнет. */
  requiresCatches: number;
  reward: number;
  body: BodyParams;
  phases: FightPhase[];
  /** Через сколько секунд босс уходит. Считается по длине боя со стартовой снастью. */
  patience?: number;
}

export interface BossTable {
  bosses: BossEntry[];
}
