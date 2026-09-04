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
  /** Полноэкранные и локальные фильтры — только на десктопе. */
  filters: boolean;
  godrays: number;
  motes: number;
  /** Сегментов в линии поверхности воды. */
  waveSegments: number;
  targetFps: number;
}

const PROFILES: Record<QualityTier, QualityProfile> = {
  low: {
    tier: 'low',
    maxResolution: 1.5,
    filters: false,
    godrays: 2,
    motes: 60,
    waveSegments: 24,
    targetFps: 30,
  },
  high: {
    tier: 'high',
    maxResolution: 2,
    filters: true,
    godrays: 4,
    motes: 200,
    waveSegments: 48,
    targetFps: 50,
  },
};

function detectTier(): QualityTier {
  const forced = new URLSearchParams(location.search).get('q');
  if (forced === 'low' || forced === 'high') return forced;

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
