/** Типы контента. Данные лежат в JSON, код только читает — docs/04, § 4.2. */

export type CatchKind = 'fish' | 'junk';

/** Что вытащенное вытворяет в лодке (ADR-0003, носитель № 2). */
export type Mischief = 'flop' | 'grab' | 'steal' | 'none';

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
  name: string;
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
