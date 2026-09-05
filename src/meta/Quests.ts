import quests from '../content/quests.json';
import type { CatchEntry, CatchKind } from '../content/types';
import type { Localized } from '../services/I18n';

type Goal =
  | { type: 'catch_any'; count: number }
  | { type: 'catch_id'; id: string; count: number }
  | { type: 'catch_kind'; kind: CatchKind; count: number }
  | { type: 'reach_depth'; depth: number };

export interface Quest {
  id: string;
  title: Localized;
  npc: Localized;
  goal: Goal;
  reward: number;
}

/** Цепочка заданий целиком. Экспортирована для проверки полноты перевода. */
export const QUESTS: readonly Quest[] = (quests as unknown as { quests: Quest[] }).quests;

const CHAIN = QUESTS;

export interface QuestState {
  index: number;
  progress: number;
}

/**
 * Задания NPC. Идут цепочкой, одно активное за раз: так первые десять минут
 * ведут игрока за руку, не превращаясь в список дел (docs/03, § 3.6).
 */
export class Quests {
  private index = 0;
  private progress = 0;

  get active(): Quest | null {
    return CHAIN[this.index] ?? null;
  }

  get done(): boolean {
    return this.index >= CHAIN.length;
  }

  get total(): number {
    return CHAIN.length;
  }

  get completedCount(): number {
    return Math.min(this.index, CHAIN.length);
  }

  /** Сколько нужно для текущей цели: для глубины — метры, иначе штуки. */
  get target(): number {
    const goal = this.active?.goal;
    if (!goal) return 0;
    return goal.type === 'reach_depth' ? goal.depth : goal.count;
  }

  get current(): number {
    return this.progress;
  }

  /** @returns выполненное задание, если этот улов его закрыл */
  onCatch(entry: CatchEntry): Quest | null {
    const goal = this.active?.goal;
    if (!goal) return null;

    const counts =
      (goal.type === 'catch_any') ||
      (goal.type === 'catch_id' && goal.id === entry.id) ||
      (goal.type === 'catch_kind' && goal.kind === entry.kind);
    if (!counts) return null;

    this.progress += 1;
    return this.checkComplete();
  }

  /** @returns выполненное задание, если игрок достал до нужной глубины */
  onDepth(meters: number): Quest | null {
    const goal = this.active?.goal;
    if (goal?.type !== 'reach_depth') return null;
    if (meters <= this.progress) return null;

    this.progress = Math.min(meters, goal.depth);
    return this.checkComplete();
  }

  private checkComplete(): Quest | null {
    const quest = this.active;
    if (!quest || this.progress < this.target) return null;
    this.index += 1;
    this.progress = 0;
    return quest;
  }

  serialize(): QuestState {
    return { index: this.index, progress: this.progress };
  }

  restore(saved: QuestState | undefined): void {
    if (!saved) return;
    this.index = Math.max(0, Math.min(CHAIN.length, Math.floor(saved.index ?? 0)));
    this.progress = Math.max(0, saved.progress ?? 0);
  }
}
