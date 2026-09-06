/**
 * Профиль качества. Игра живёт в браузере, включая мобильные — на бюджетном
 * телефоне полноэкранные фильтры съедают кадр, поэтому эффекты у профилей разные.
 *
 * Профиль форсируется через ?q=low|high — без этого мобильный профиль на
 * десктопе не протестировать.
 */
export type QualityTier = 'low' | 'high';

export interface QualityProfile {
  tier: QualityTier;
  /** Верхняя граница devicePixelRatio: на 3x-экранах рендерить в 3x не нужно. */
  maxResolution: number;
  /** Сглаживание и тени — только там, где хватает сил. */
  filters: boolean;
  /**
   * Сторона сетки поверхности воды.
   *
   * Мелкая рябь живёт во фрагментном шейдере, поэтому геометрии нужно
   * представить только длинную зыбь: четырёх-восьми четырёхугольников на
   * длину волны хватает. При 190 сегментах вода одна давала 72 тысячи
   * треугольников — девять десятых всей сцены.
   */
  waterSegments: number;
  targetFps: number;
}

const PROFILES: Record<QualityTier, QualityProfile> = {
  low: {
    tier: 'low',
    maxResolution: 1.5,
    filters: false,
    waterSegments: 80,
    targetFps: 30,
  },
  high: {
    tier: 'high',
    maxResolution: 2,
    filters: true,
    waterSegments: 140,
    targetFps: 50,
  },
};

/** Ключ выбора игрока. Это настройка устройства, а не прогресс: в облако не идёт. */
const CHOICE_KEY = 'htfu.quality';

/** Что выбрал игрок в настройках. null — «как решит игра». */
export function chosenTier(): QualityTier | null {
  try {
    const value = localStorage.getItem(CHOICE_KEY);
    return value === 'low' || value === 'high' ? value : null;
  } catch {
    return null;
  }
}

/** Запомнить выбор. Применяется он перезагрузкой: рендерер собирается один раз. */
export function chooseTier(tier: QualityTier | null): void {
  try {
    if (tier) localStorage.setItem(CHOICE_KEY, tier);
    else localStorage.removeItem(CHOICE_KEY);
  } catch {
    // Приватный режим: выбор живёт до конца вкладки.
  }
}

function detectTier(): QualityTier {
  const forced = new URLSearchParams(location.search).get('q');
  if (forced === 'low' || forced === 'high') return forced;

  // Выбор игрока важнее догадки: автоопределение по числу ядер ошибается на
  // флагманах, где тени и полное разрешение тянутся легко.
  const chosen = chosenTier();
  if (chosen) return chosen;

  const coarse = matchMedia('(pointer: coarse)').matches;
  const cores = navigator.hardwareConcurrency ?? 4;
  const narrow = Math.min(screen.width, screen.height) <= 480;

  // Тач + мало ядер, либо маленький экран — считаем бюджетным устройством.
  if (coarse && (cores <= 4 || narrow)) return 'low';
  return coarse ? 'low' : 'high';
}

export function resolveQuality(): QualityProfile {
  return PROFILES[detectTier()];
}
