import type { IPlatform } from './IPlatform';
import { LocalPlatform } from './LocalPlatform';
import { YandexPlatform } from './YandexPlatform';

const SDK_URL = '/sdk.js';
const SDK_TIMEOUT_MS = 6000;

/**
 * На локальном сервере /sdk.js отдаёт 404, и браузер честно пишет ошибку в
 * консоль — а наш дымовой тест падает на любой ошибке. Поэтому на localhost
 * SDK даже не пробуем: там всегда заглушка.
 */
function looksLikePlatform(): boolean {
  const host = location.hostname;
  return host !== '' && host !== 'localhost' && host !== '127.0.0.1' && host !== '[::1]';
}

/** Динамическая загрузка SDK — второй способ подключения из документации. */
function loadSdkScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    const timer = setTimeout(() => reject(new Error('SDK не загрузился вовремя')), SDK_TIMEOUT_MS);
    script.addEventListener('load', () => {
      clearTimeout(timer);
      resolve();
    });
    script.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('SDK не загрузился'));
    });
    document.head.appendChild(script);
  });
}

/**
 * Выбор площадки. Игра обязана запускаться и без SDK — иначе локальная
 * разработка невозможна, а любой сбой загрузки означал бы чёрный экран.
 */
export async function createPlatform(): Promise<IPlatform> {
  let platform: IPlatform = new LocalPlatform();

  if (looksLikePlatform()) {
    try {
      if (!window.YaGames) await loadSdkScript();
      const sdk = await window.YaGames?.init();
      if (sdk) platform = new YandexPlatform(sdk);
    } catch (error) {
      console.warn('[platform] SDK площадки недоступен, работаем локально', error);
    }
  }

  await platform.init();
  return platform;
}

export type { IPlatform, SaveData } from './IPlatform';
