import zones from '../content/zones.json';
import { CATCH_ENTRIES } from '../content/catalog';
import type { Localized } from '../services/I18n';

export interface ZoneDecor {
  pier: boolean;
  shore: boolean;
  shelf: boolean;
}

export interface ZoneUnlock {
  type: 'start' | 'quests' | 'money';
  value: number;
}

export interface Zone {
  id: string;
  name: Localized;
  note: Localized;
  /** Глубже этого в локации не опуститься, даже с длинной леской. */
  maxDepth: number;
  unlock: ZoneUnlock;
  decor: ZoneDecor;
  sky: string[];
  water: string[];
  tint: string;
  catches: string[];
}

export const ZONES = (zones as unknown as { zones: Zone[] }).zones;

export interface UnlockContext {
  money: number;
  questsDone: number;
}

/**
 * Локации архипелага. Новая локация — это объект в zones.json: палитра, декор,
 * пул заброса и условие открытия. Сцена и код прокачки об этом не знают.
 *
 * Гейт по боссу появится вместе с боссами; пока открывают деньги и задания.
 */
export class Zones {
  private currentId = ZONES[0]?.id ?? 'dock';

  get all(): Zone[] {
    return ZONES;
  }

  get current(): Zone {
    return ZONES.find((zone) => zone.id === this.currentId) ?? (ZONES[0] as Zone);
  }

  isUnlocked(zone: Zone, context: UnlockContext): boolean {
    switch (zone.unlock.type) {
      case 'start':
        return true;
      case 'quests':
        return context.questsDone >= zone.unlock.value;
      case 'money':
        return context.money >= zone.unlock.value;
      default:
        return false;
    }
  }

  /** @returns удалось ли переехать */
  travelTo(id: string, context: UnlockContext): boolean {
    const zone = ZONES.find((entry) => entry.id === id);
    if (!zone || !this.isUnlocked(zone, context)) return false;
    this.currentId = zone.id;
    return true;
  }

  serialize(): string {
    return this.currentId;
  }

  restore(saved: string | undefined): void {
    if (saved && ZONES.some((zone) => zone.id === saved)) this.currentId = saved;
  }
}

/** Виды, которые водятся в локации. Проверяется тестом, что пул непустой. */
export function zoneCatchIds(zone: Zone): string[] {
  const known = new Set(CATCH_ENTRIES.map((entry) => entry.id));
  return zone.catches.filter((id) => known.has(id));
}
