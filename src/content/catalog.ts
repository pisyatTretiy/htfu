import table from './catches.json';
import { i18n } from '../services/I18n';
import type { CatchEntry, CatchTable } from './types';

/** Единая точка доступа к пулу заброса: пул, альбом и интерфейс берут его отсюда. */
export const CATCH_ENTRIES: CatchEntry[] = (table as unknown as CatchTable).entries;

export function entryName(entry: CatchEntry): string {
  return i18n.pick(entry.name);
}
