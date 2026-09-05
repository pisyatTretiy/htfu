import type { Rng } from '../core/Rng';
import { CATCH_ENTRIES } from '../content/catalog';
import type { CatchEntry } from '../content/types';

const CATCHES = CATCH_ENTRIES;

/**
 * Доля не-рыбы в пуле (ADR-0003, носитель № 1).
 *
 * Категория выбирается ДО вида — иначе доля мусора плавает вместе с тем,
 * сколько видов рыбы живёт на этой глубине: в первой версии на 100 м она
 * доходила до 77 %. Так правило выполняется по построению на любой глубине.
 */
export const JUNK_SHARE = 0.25;

function pickWeighted(pool: CatchEntry[], rng: Rng): CatchEntry | null {
  if (pool.length === 0) return null;
  const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
  let ticket = rng.next() * total;
  for (const entry of pool) {
    ticket -= entry.weight;
    if (ticket <= 0) return entry;
  }
  return pool[pool.length - 1] ?? null;
}

function atDepth(depthMeters: number, allowed?: readonly string[]): CatchEntry[] {
  const pool = allowed ? CATCHES.filter((entry) => allowed.includes(entry.id)) : CATCHES;
  return pool.filter(
    (entry) => depthMeters >= entry.depth[0] && depthMeters <= entry.depth[1],
  );
}

/**
 * Что клюнет. Клёв гарантирован, пока крючок в воде — находка оригинала:
 * игрок никогда не ждёт поплавка (docs/01, § «Кор-луп»).
 */
export function rollCatch(
  depthMeters: number,
  rng: Rng,
  allowed?: readonly string[],
  junkShare = JUNK_SHARE,
): CatchEntry {
  const available = atDepth(depthMeters, allowed);
  const pool = available.length > 0 ? available : atDepth(depthMeters);
  const wantJunk = rng.next() < junkShare;

  const primary = pool.filter((entry) => (entry.kind === 'junk') === wantJunk);
  const fallback = pool.filter((entry) => (entry.kind === 'junk') !== wantJunk);

  const picked = pickWeighted(primary, rng) ?? pickWeighted(fallback, rng);
  if (!picked) throw new Error('Пул заброса пуст');
  return picked;
}

/** Виды, доступные на глубине — используется тестами баланса. */
export function poolAt(depthMeters: number, allowed?: readonly string[]): CatchEntry[] {
  return atDepth(depthMeters, allowed);
}
