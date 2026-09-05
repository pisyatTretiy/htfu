import dailies from '../content/dailies.json';
import { Rng } from '../core/Rng';
import type { Localized } from '../services/I18n';
import type { CatchEntry } from '../content/types';
import type { Rarity } from '../gameplay/Rarity';

type DailyGoal =
  | { type: 'catch_any'; count: number }
  | { type: 'catch_kind'; kind: string; count: number }
  | { type: 'catch_rarity'; rarity: Rarity; count: number }
  | { type: 'trickshot'; count: number }
  | { type: 'reach_depth'; count: number }
  | { type: 'subdue'; count: number }
  | { type: 'earn'; count: number };

export interface DailyTask {
  id: string;
  title: Localized;
  goal: DailyGoal;
  reward: number;
}

const POOL = (dailies as unknown as { tasks: DailyTask[] }).tasks;
/** Сколько дел выдаётся в день. */
const PER_DAY = 3;
/** Награда за стрик: множитель к сумме дневных наград. */
const STREAK_BONUS = 0.15;
const MAX_STREAK_BONUS = 1.0;

export interface DailiesState {
  day: number;
  progress: Record<string, number>;
  claimed: string[];
  streak: number;
  lastCompletedDay: number;
}

/** Номер дня по UTC: у всех игроков сутки начинаются одновременно. */
export function currentDay(now = Date.now()): number {
  return Math.floor(now / 86_400_000);
}

/**
 * Ежедневные дела. Набор на день выбирается по номеру дня, а не случайно при
 * заходе: так он одинаков у всех, переживает перезагрузку и проверяется тестом.
 *
 * Стрик считает дни подряд, в которые закрыто хотя бы одно дело, и добавляет
 * к наградам до +100 %.
 */
export class Dailies {
  private day = currentDay();
  private progress: Record<string, number> = {};
  private claimed = new Set<string>();
  private streak = 0;
  private lastCompletedDay = -1;

  /** Три дела на сегодня. */
  get tasks(): DailyTask[] {
    const rng = new Rng(this.day * 2654435761);
    const pool = [...POOL];
    const picked: DailyTask[] = [];
    for (let i = 0; i < PER_DAY && pool.length > 0; i++) {
      picked.push(pool.splice(rng.int(0, pool.length - 1), 1)[0] as DailyTask);
    }
    return picked;
  }

  get currentStreak(): number {
    return this.streak;
  }

  /** Множитель наград от стрика: 0 дней — ×1, семь дней — ×2. */
  get streakMultiplier(): number {
    return 1 + Math.min(MAX_STREAK_BONUS, this.streak * STREAK_BONUS);
  }

  progressOf(task: DailyTask): number {
    return Math.min(task.goal.count, this.progress[task.id] ?? 0);
  }

  isDone(task: DailyTask): boolean {
    return this.progressOf(task) >= task.goal.count;
  }

  isClaimed(task: DailyTask): boolean {
    return this.claimed.has(task.id);
  }

  get allDone(): boolean {
    return this.tasks.every((task) => this.isDone(task));
  }

  /** Смена суток: прогресс сбрасывается, стрик — только при пропуске дня. */
  rollOver(now = Date.now()): boolean {
    const today = currentDay(now);
    if (today === this.day) return false;

    // Стрик держится, только если отыгран ровно вчерашний день. Пропуск даже
    // одного дня его обнуляет — иначе «серия» перестаёт что-либо значить.
    if (this.lastCompletedDay !== today - 1) this.streak = 0;
    this.day = today;
    this.progress = {};
    this.claimed.clear();
    return true;
  }

  private bump(id: string, amount: number): void {
    this.progress[id] = (this.progress[id] ?? 0) + amount;
  }

  /** Прогресс от улова. Возвращает дела, которые именно сейчас закрылись. */
  onCatch(entry: CatchEntry, rarity: Rarity, reward: number, subdued: boolean): DailyTask[] {
    const before = this.tasks.filter((task) => this.isDone(task)).map((task) => task.id);

    for (const task of this.tasks) {
      const goal = task.goal;
      if (goal.type === 'catch_any') this.bump(task.id, 1);
      else if (goal.type === 'catch_kind' && goal.kind === entry.kind) this.bump(task.id, 1);
      else if (goal.type === 'catch_rarity' && goal.rarity === rarity) this.bump(task.id, 1);
      else if (goal.type === 'earn') this.bump(task.id, reward);
      else if (goal.type === 'subdue' && subdued) this.bump(task.id, 1);
    }
    return this.newlyDone(before);
  }

  onTrickShot(): DailyTask[] {
    const before = this.tasks.filter((task) => this.isDone(task)).map((task) => task.id);
    for (const task of this.tasks) {
      if (task.goal.type === 'trickshot') this.bump(task.id, 1);
    }
    return this.newlyDone(before);
  }

  onDepth(meters: number): DailyTask[] {
    const before = this.tasks.filter((task) => this.isDone(task)).map((task) => task.id);
    for (const task of this.tasks) {
      if (task.goal.type !== 'reach_depth') continue;
      const reached = Math.floor(meters);
      if (reached > (this.progress[task.id] ?? 0)) this.progress[task.id] = reached;
    }
    return this.newlyDone(before);
  }

  private newlyDone(beforeIds: string[]): DailyTask[] {
    const done = this.tasks.filter((task) => this.isDone(task) && !beforeIds.includes(task.id));
    if (done.length > 0) this.lastCompletedDay = this.day;
    return done;
  }

  /** Забрать награду. @returns начисленная сумма с учётом стрика */
  claim(task: DailyTask): number {
    if (!this.isDone(task) || this.claimed.has(task.id)) return 0;
    this.claimed.add(task.id);

    // Стрик растёт на первой награде за день, а не на каждой.
    if (this.claimed.size === 1) this.streak += 1;
    return Math.round(task.reward * this.streakMultiplier);
  }

  serialize(): DailiesState {
    return {
      day: this.day,
      progress: { ...this.progress },
      claimed: [...this.claimed],
      streak: this.streak,
      lastCompletedDay: this.lastCompletedDay,
    };
  }

  restore(saved: DailiesState | undefined, now = Date.now()): void {
    if (!saved) return;
    this.day = saved.day ?? currentDay(now);
    this.progress = { ...(saved.progress ?? {}) };
    this.claimed = new Set(saved.claimed ?? []);
    this.streak = Math.max(0, saved.streak ?? 0);
    this.lastCompletedDay = saved.lastCompletedDay ?? -1;
    this.rollOver(now);
  }
}
