import table from './catches.json';
import { i18n } from '../services/I18n';
import type { CatchEntry, CatchShape, CatchTable } from './types';

/** Единая точка доступа к пулу заброса: пул, альбом и интерфейс берут его отсюда. */
export const CATCH_ENTRIES: CatchEntry[] = (table as unknown as CatchTable).entries;

export function entryName(entry: CatchEntry): string {
  return i18n.pick(entry.name);
}

/**
 * Что это за существо для подписи в альбоме.
 *
 * `kind` делит улов на съедобное и мусор — этим живёт геймплей (задание
 * «достань что-нибудь несъедобное» смотрит именно туда). Но краб, медуза,
 * осьминог и морская звезда там числятся рыбой, и альбом честно подписывал
 * краба «рыба». Категория для глаз считается по форме, не по `kind`.
 */
const CRITTERS: ReadonlySet<CatchShape> = new Set<CatchShape>(['crab', 'jelly', 'squid', 'star']);

export function catchCategory(entry: CatchEntry): 'fish' | 'critter' | 'junk' {
  if (entry.kind === 'junk') return 'junk';
  return CRITTERS.has(entry.body.shape ?? 'fish') ? 'critter' : 'fish';
}
