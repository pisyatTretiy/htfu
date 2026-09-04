import type { IPlatform } from './IPlatform';
import { LocalPlatform } from './LocalPlatform';

/**
 * На площадке SDK подключается тегом <script src="/sdk.js"> и кладёт в window
 * объект YaGames. Локально его нет — берём заглушку.
 *
 * YandexPlatform появится в фазе 2 вместе с интеграцией SDK; до тех пор
 * игровой код уже пишется против интерфейса, а не против window.
 */
export async function createPlatform(): Promise<IPlatform> {
  const platform: IPlatform = new LocalPlatform();
  await platform.init();
  return platform;
}

export type { IPlatform, SaveData } from './IPlatform';
