import bosses from '../content/bosses.json';
import type { BossEntry, BossTable, CatchEntry } from '../content/types';

export const BOSSES = (bosses as unknown as BossTable).bosses;

/**
 * Боссы локаций. Босс клюёт не случайно: он ждёт, пока игрок наловит своё в
 * этой локации, и появляется один раз. Победа даёт трофей — отдельный предмет,
 * который не уходит вместе с обычным уловом.
 */
export class Bosses {
  /** Трофеи по id босса: они же ключи к следующим локациям. */
  private trophies = new Set<string>();
  /** Сколько уловов сделано в каждой локации после последнего боя с боссом. */
  private catchesInZone: Record<string, number> = {};

  bossOf(zoneId: string): BossEntry | null {
    return BOSSES.find((boss) => boss.zone === zoneId) ?? null;
  }

  isDefeated(bossId: string): boolean {
    return this.trophies.has(bossId);
  }

  get trophyCount(): number {
    return this.trophies.size;
  }

  countCatch(zoneId: string): void {
    this.catchesInZone[zoneId] = (this.catchesInZone[zoneId] ?? 0) + 1;
  }

  progressIn(zoneId: string): number {
    return this.catchesInZone[zoneId] ?? 0;
  }

  /** Пора ли боссу клюнуть в этой локации. */
  isReady(zoneId: string): boolean {
    const boss = this.bossOf(zoneId);
    if (!boss || this.isDefeated(boss.id)) return false;
    return this.progressIn(zoneId) >= boss.requiresCatches;
  }

  defeat(bossId: string): void {
    this.trophies.add(bossId);
    const boss = BOSSES.find((entry) => entry.id === bossId);
    if (boss) this.catchesInZone[boss.zone] = 0;
  }

  /** Проигранный бой откатывает счётчик: босс придёт снова, но не сразу. */
  escaped(zoneId: string): void {
    const boss = this.bossOf(zoneId);
    if (boss) this.catchesInZone[zoneId] = Math.max(0, boss.requiresCatches - 3);
  }

  serialize(): { trophies: string[]; catches: Record<string, number> } {
    return { trophies: [...this.trophies], catches: { ...this.catchesInZone } };
  }

  restore(saved: { trophies?: string[]; catches?: Record<string, number> } | undefined): void {
    if (!saved) return;
    const known = new Set(BOSSES.map((boss) => boss.id));
    this.trophies = new Set((saved.trophies ?? []).filter((id) => known.has(id)));
    this.catchesInZone = { ...(saved.catches ?? {}) };
  }
}

/**
 * Босс в виде обычного улова: так вся цепочка — бой, вид, награда — работает
 * без исключений, а особенным его делают фазы и трофей.
 */
export function bossAsCatch(boss: BossEntry): CatchEntry {
  const first = boss.phases[0];
  return {
    id: boss.id,
    gender: boss.gender,
    name: boss.name,
    kind: 'fish',
    weight: 0,
    depth: [0, 250],
    price: boss.reward,
    body: boss.body,
    mischief: 'none',
    fight: {
      stamina: 1,
      drain: first?.drain ?? 0.3,
      pull: first?.pull ?? 0.4,
      burst: first?.burst ?? 2,
      rhythm: first?.rhythm ?? 1,
      recover: first?.recover ?? 0.06,
    },
  };
}
