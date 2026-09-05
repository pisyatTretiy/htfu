import type { IPlatform, SaveData } from '../platform';
import { ONBOARDING_CHAIN, type OnboardingState } from '../meta/Onboarding';

const KEY = 'htfu.save';
/** Текущая версия схемы. Растёт вместе с миграциями. */
export const SAVE_VERSION = 7;
/** Лимит площадки: setData — 100 запросов за 5 минут. Дебаунс держит запас. */
const CLOUD_DEBOUNCE_MS = 10000;

export interface GameSave extends SaveData {
  version: number;
  updatedAt: number;
  money: number;
  upgrades: Record<string, number>;
  album: Record<string, Record<string, number>>;
  quests: { index: number; progress: number };
  zone: string;
  bosses: { trophies: string[]; catches: Record<string, number> };
  dailies: {
    day: number;
    progress: Record<string, number>;
    claimed: string[];
    streak: number;
    lastCompletedDay: number;
  };
  /** Самый дорогой улов за всё время — он же результат в лидерборде. */
  bestCatch: number;
  /** Пройденные шаги обучения: игрока не учат дважды. */
  onboarding: OnboardingState;
}

export function emptySave(): GameSave {
  return {
    version: SAVE_VERSION,
    updatedAt: 0,
    money: 0,
    upgrades: {},
    album: {},
    quests: { index: 0, progress: 0 },
    zone: 'dock',
    bosses: { trophies: [], catches: {} },
    dailies: { day: 0, progress: {}, claimed: [], streak: 0, lastCompletedDay: -1 },
    bestCatch: 0,
    onboarding: { step: 0, seen: [] },
  };
}

type Migration = (data: GameSave) => GameSave;

/**
 * Миграции схемы сейва. Ключ — версия, из которой мигрируем.
 * Чистые функции: их легко покрыть тестом и невозможно случайно сломать
 * прогресс живым игрокам.
 */
const MIGRATIONS: Record<number, Migration> = {
  0: (data) => ({ ...emptySave(), ...data, version: 1 }),
  // v2 добавила цепочку заданий. Старые игроки начинают её с начала —
  // прогресс по деньгам и альбому при этом не трогается.
  1: (data) => ({ ...data, quests: { index: 0, progress: 0 }, version: 2 }),
  // v3 добавила локации. Все существующие игроки стоят у причала.
  2: (data) => ({ ...data, zone: 'dock', version: 3 }),
  // v4 добавила боссов. Никто из старых игроков их ещё не побеждал.
  3: (data) => ({ ...data, bosses: { trophies: [], catches: {} }, version: 4 }),
  // v5 добавила варианты редкости. Всё пойманное раньше считается обычным —
  // разбор старого формата живёт в Album.restore.
  4: (data) => ({ ...data, version: 5 }),
  // v6 добавила ежедневные дела и рекорд улова.
  5: (data) => ({
    ...data,
    dailies: { day: 0, progress: {}, claimed: [], streak: 0, lastCompletedDay: -1 },
    bestCatch: 0,
    version: 6,
  }),
  // v7 добавила обучение первых десяти минут. Тем, кто уже играл, оно не
  // нужно: сейв этой версии есть только у них.
  6: (data) => ({
    ...data,
    onboarding: { step: ONBOARDING_CHAIN.length, seen: ['subdue', 'retry'] },
    version: 7,
  }),
};

export function migrate(raw: Partial<GameSave> | null): GameSave {
  if (!raw || typeof raw !== 'object') return emptySave();

  let data = { ...emptySave(), ...raw } as GameSave;
  let guard = 0;
  while (data.version < SAVE_VERSION && guard < 16) {
    const step = MIGRATIONS[data.version];
    if (!step) break;
    data = step(data);
    guard += 1;
  }
  // Сейв из будущей версии игры (игрок откатился) — не ломаем, берём как есть.
  data.version = Math.max(data.version, SAVE_VERSION);
  return data;
}

/**
 * Сохранение прогресса.
 *
 * Локальный кэш — источник правды в рантайме, облако — синхронизация: у
 * площадки жёсткие лимиты на частоту записи, поэтому в облако пишем по
 * дебаунсу и обязательно сбрасываем перед рекламой и уходом со страницы
 * (docs/02, § 2.6).
 */
export class SaveService {
  private pending: GameSave | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly platform: IPlatform) {}

  async load(): Promise<GameSave> {
    const local = this.readLocal();
    const cloud = (await this.platform.load()) as Partial<GameSave> | null;

    const localSave = migrate(local);
    const cloudSave = migrate(cloud);
    if (!local) return cloudSave;
    if (!cloud) return localSave;

    // Конфликт разрешаем в пользу игрока: берём свежий сейв, но деньги и
    // альбом — по максимуму из двух, чтобы прогресс не пропал.
    const fresher = cloudSave.updatedAt > localSave.updatedAt ? cloudSave : localSave;
    const other = fresher === cloudSave ? localSave : cloudSave;
    return {
      ...fresher,
      money: Math.max(fresher.money, other.money),
      bestCatch: Math.max(fresher.bestCatch ?? 0, other.bestCatch ?? 0),
      album: mergeCounts(fresher.album, other.album),
    };
  }

  /** Быстрое сохранение: локально сразу, в облако — по дебаунсу. */
  save(data: GameSave): void {
    const stamped = { ...data, version: SAVE_VERSION, updatedAt: Date.now() };
    this.pending = stamped;
    this.writeLocal(stamped);

    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flush();
    }, CLOUD_DEBOUNCE_MS);
  }

  /** Немедленная запись в облако: перед рекламой и уходом со страницы. */
  async flush(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const data = this.pending;
    if (!data) return;
    this.pending = null;
    await this.platform.save(data);
  }

  private readLocal(): Partial<GameSave> | null {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as Partial<GameSave>) : null;
    } catch {
      return null;
    }
  }

  private writeLocal(data: GameSave): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      // Приватный режим браузера: играем на памяти, облако остаётся.
    }
  }
}

/** Конфликт альбома разрешаем в пользу игрока: берём максимум по каждому варианту. */
function mergeCounts(
  a: Record<string, Record<string, number>>,
  b: Record<string, Record<string, number>>,
): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = { ...a };
  for (const [id, counts] of Object.entries(b)) {
    const existing = result[id] ?? {};
    const merged: Record<string, number> = { ...existing };
    for (const [rarity, count] of Object.entries(counts ?? {})) {
      merged[rarity] = Math.max(merged[rarity] ?? 0, count);
    }
    result[id] = merged;
  }
  return result;
}
