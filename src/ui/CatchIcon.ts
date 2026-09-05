import type { CatchEntry, CatchShape } from '../content/types';

/**
 * Значок улова для альбома.
 *
 * Рисуется из тех же данных, что и модель в игре: форма, длина, цвет,
 * «волнистость» тела. Поэтому окунь в альбоме толще и синее уклейки, а краб
 * не притворяется рыбой.
 *
 * Нераскрытый вид показывается силуэтом: игрок видит, чего ему не хватает, —
 * это и есть коллекция. Пустой квадрат с «???» коллекцией не ощущается.
 */
const WIDTH = 64;
const HEIGHT = 40;
const CX = 32;
const CY = 20;

/** Что рисовать: у вида есть форма, а у старых записей — только вид улова. */
function shapeOf(entry: CatchEntry): CatchShape {
  return entry.body.shape ?? (entry.kind === 'fish' ? 'fish' : 'junk');
}

export function catchIcon(entry: CatchEntry, known: boolean): string {
  // Силуэт светлее фона карточки, а не темнее: на тёмной панели тёмная тень
  // не читается вовсе, и альбом выглядит пустым, а не собираемым.
  const fill = known ? entry.body.fill : '#66889a';
  const dark = known ? entry.body.outline : '#4d6b7a';
  const draw = DRAWINGS[shapeOf(entry)] ?? DRAWINGS.junk!;

  return `<svg class="album-icon" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}"
    height="${HEIGHT}" aria-hidden="true">${draw({ entry, fill, dark, known })}</svg>`;
}

interface Ink {
  entry: CatchEntry;
  fill: string;
  dark: string;
  known: boolean;
}

/**
 * Толщина тела по длине вида: мелкая рыба узкая, крупная — заметно выше, и по
 * одному силуэту видно, кто перед тобой.
 */
function bulk(entry: CatchEntry): number {
  return Math.max(0.55, Math.min(1.35, entry.body.length / 120));
}

/** Глаз рисуем только у раскрытого вида: силуэт не смотрит. */
function eye(known: boolean, x: number, y = CY - 1.5, r = 2.4): string {
  return known ? `<circle cx="${x}" cy="${y}" r="${r}" fill="#0d1c22"/>` : '';
}

/** Хвостовая вилка, обращённая влево. */
function forkedTail(x: number, spread: number, dark: string): string {
  return `<polygon points="${x},${CY} ${x - 10},${CY - spread} ${x - 6},${CY} ${x - 10},${
    CY + spread
  }" fill="${dark}"/>`;
}

/**
 * Значки по формам.
 *
 * До этой таблицы альбом знал ровно два рисунка — рыбу и мешок. Пятьдесят
 * два вида делили их на двоих: удильщик, краб, якорь и холодильник
 * отличались в коллекции только цветом заливки.
 */
const DRAWINGS: Record<string, (ink: Ink) => string> = {
  fish: ({ entry, fill, dark, known }) => {
    const half = 11 * bulk(entry);
    const back = CY - half;
    const belly = CY + half;
    // «Волнистость» тела разводит спинной плавник: у вертлявой рыбы он ближе
    // к хвосту, у спокойной — к середине.
    const finX = 26 + Math.min(10, entry.body.wave * 2.2);
    return `
      ${forkedTail(12, half + 4, dark)}
      <path d="M 12 ${CY} Q 34 ${back} 57 ${CY} Q 34 ${belly} 12 ${CY} Z" fill="${fill}"/>
      <polygon points="${finX},${back + 2} ${finX + 7},${back - 6} ${finX + 12},${
        back + 3
      }" fill="${dark}"/>
      ${eye(known, 49)}`;
  },

  eel: ({ entry, fill, dark, known }) => `
    <polygon points="12,${CY} 5,${CY - 6} 5,${CY + 6}" fill="${dark}"/>
    <path d="M 10 ${CY} Q 22 ${CY - 8} 33 ${CY} T 56 ${CY}" fill="none" stroke="${fill}"
      stroke-width="${4.5 * bulk(entry)}" stroke-linecap="round"/>
    ${eye(known, 52, CY - 2, 2)}`,

  round: ({ fill, dark, known }) => `
    ${forkedTail(17, 8, dark)}
    <ellipse cx="35" cy="${CY}" rx="14" ry="15" fill="${fill}"/>
    <polygon points="27,8 38,0 45,10" fill="${dark}"/>
    ${eye(known, 44, CY - 4)}`,

  flat: ({ fill, dark, known }) => `
    ${forkedTail(16, 7, dark)}
    <ellipse cx="34" cy="${CY}" rx="16" ry="14" fill="${fill}"/>
    <path d="M 23 9 L 46 12 L 33 1 Z" fill="${dark}"/>
    ${eye(known, 43, CY - 5)}`,

  needle: ({ fill, dark, known }) => `
    <polygon points="14,${CY} 6,${CY - 5} 6,${CY + 5}" fill="${dark}"/>
    <path d="M 12 ${CY} Q 28 14 42 ${CY} Q 28 26 12 ${CY} Z" fill="${fill}"/>
    <polygon points="40,${CY - 2} 61,${CY} 40,${CY + 2}" fill="${dark}"/>
    ${eye(known, 37, CY - 1, 2)}`,

  puffer: ({ fill, dark, known }) => {
    const spikes = Array.from({ length: 12 }, (_, i) => {
      const angle = (i / 12) * Math.PI * 2;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      const from = { x: CX + dx * 11, y: CY + dy * 11 };
      const to = { x: CX + dx * 17, y: CY + dy * 17 };
      return `<line x1="${from.x.toFixed(1)}" y1="${from.y.toFixed(1)}" x2="${to.x.toFixed(
        1,
      )}" y2="${to.y.toFixed(1)}" stroke="${dark}" stroke-width="2" stroke-linecap="round"/>`;
    }).join('');
    return `${spikes}<circle cx="${CX}" cy="${CY}" r="12" fill="${fill}"/>${eye(known, 39, CY - 3)}`;
  },

  spiny: ({ fill, dark, known }) => {
    const rays = Array.from({ length: 6 }, (_, i) => {
      const x = 20 + i * 5;
      return `<line x1="${x}" y1="13" x2="${x - 4 + i * 1.6}" y2="1" stroke="${dark}"
        stroke-width="1.6" stroke-linecap="round"/>`;
    }).join('');
    return `
      ${rays}
      ${forkedTail(16, 9, dark)}
      <path d="M 16 ${CY} Q 34 10 52 ${CY} Q 34 30 16 ${CY} Z" fill="${fill}"/>
      <line x1="26" y1="28" x2="20" y2="38" stroke="${dark}" stroke-width="1.6"
        stroke-linecap="round"/>
      <line x1="34" y1="29" x2="32" y2="39" stroke="${dark}" stroke-width="1.6"
        stroke-linecap="round"/>
      ${eye(known, 45, CY - 2)}`;
  },

  lure: ({ fill, dark, known }) => `
    <path d="M 27 9 Q 38 2 46 6" fill="none" stroke="${dark}" stroke-width="1.8"/>
    <circle cx="48" cy="6" r="4" fill="#ffe9a8"/>
    ${forkedTail(16, 7, dark)}
    <ellipse cx="33" cy="${CY + 1}" rx="15" ry="13" fill="${fill}"/>
    <polyline points="24,29 27,24 30,29 33,24 36,29 39,24 42,28" fill="none" stroke="#f2f6f0"
      stroke-width="2"/>
    ${eye(known, 41, 15, 2.8)}`,

  jaws: ({ fill, dark, known }) => `
    <polygon points="12,${CY} 4,${CY - 7} 4,${CY + 7}" fill="${dark}"/>
    <path d="M 10 ${CY} Q 26 11 40 ${CY} Q 26 29 10 ${CY} Z" fill="${fill}"/>
    <polygon points="36,${CY} 61,6 61,34" fill="${dark}"/>
    ${eye(known, 36, CY - 4, 2.2)}`,

  stilts: ({ fill, dark, known }) => `
    ${forkedTail(15, 6, dark)}
    <path d="M 14 17 Q 32 8 50 17 Q 32 26 14 17 Z" fill="${fill}"/>
    <line x1="20" y1="21" x2="13" y2="37" stroke="${dark}" stroke-width="1.6"/>
    <line x1="34" y1="23" x2="33" y2="38" stroke="${dark}" stroke-width="1.6"/>
    <line x1="42" y1="21" x2="49" y2="37" stroke="${dark}" stroke-width="1.6"/>
    ${eye(known, 44, 15, 2)}`,

  crab: ({ fill, dark, known }) => `
    <path d="M 14 16 L 8 10" stroke="${dark}" stroke-width="2" fill="none"/>
    <path d="M 50 16 L 56 10" stroke="${dark}" stroke-width="2" fill="none"/>
    <path d="M 8 10 l -3 -4 l 4 -1 l 2 3 z" fill="${dark}"/>
    <path d="M 56 10 l 3 -4 l -4 -1 l -2 3 z" fill="${dark}"/>
    <line x1="18" y1="26" x2="10" y2="33" stroke="${dark}" stroke-width="1.8"/>
    <line x1="25" y1="29" x2="21" y2="37" stroke="${dark}" stroke-width="1.8"/>
    <line x1="46" y1="26" x2="54" y2="33" stroke="${dark}" stroke-width="1.8"/>
    <line x1="39" y1="29" x2="43" y2="37" stroke="${dark}" stroke-width="1.8"/>
    <ellipse cx="${CX}" cy="21" rx="18" ry="10" fill="${fill}"/>
    ${known ? `<circle cx="26" cy="18" r="2" fill="#0d1c22"/>
      <circle cx="38" cy="18" r="2" fill="#0d1c22"/>` : ''}`,

  jelly: ({ fill }) => `
    <path d="M 14 22 A 18 15 0 0 1 50 22 Z" fill="${fill}"/>
    <path d="M 19 23 q 2 6 -1 13" fill="none" stroke="${fill}" stroke-width="2.6"/>
    <path d="M 27 23 q -2 7 1 14" fill="none" stroke="${fill}" stroke-width="2.6"/>
    <path d="M 37 23 q 2 7 -1 14" fill="none" stroke="${fill}" stroke-width="2.6"/>
    <path d="M 45 23 q -2 6 1 13" fill="none" stroke="${fill}" stroke-width="2.6"/>`,

  squid: ({ fill, dark, known }) => `
    <polygon points="6,${CY} 32,10 32,30" fill="${fill}"/>
    <circle cx="36" cy="${CY}" r="9" fill="${fill}"/>
    <line x1="44" y1="16" x2="60" y2="9" stroke="${dark}" stroke-width="2"
      stroke-linecap="round"/>
    <line x1="45" y1="${CY}" x2="61" y2="${CY}" stroke="${dark}" stroke-width="2"
      stroke-linecap="round"/>
    <line x1="44" y1="24" x2="60" y2="31" stroke="${dark}" stroke-width="2"
      stroke-linecap="round"/>
    ${eye(known, 38, 17)}`,

  star: ({ fill, dark }) => {
    const points = Array.from({ length: 10 }, (_, i) => {
      const radius = i % 2 === 0 ? 17 : 7;
      const angle = (i / 10) * Math.PI * 2 - Math.PI / 2;
      return `${(CX + Math.cos(angle) * radius).toFixed(1)},${(
        CY +
        Math.sin(angle) * radius
      ).toFixed(1)}`;
    }).join(' ');
    return `<polygon points="${points}" fill="${fill}"/>
      <circle cx="${CX}" cy="${CY}" r="3" fill="${dark}"/>`;
  },

  ring: ({ fill, dark }) => `
    <circle cx="${CX}" cy="${CY}" r="13" fill="none" stroke="${fill}" stroke-width="8"/>
    <circle cx="${CX}" cy="${CY}" r="6" fill="none" stroke="${dark}" stroke-width="2"/>`,

  can: ({ fill, dark }) => `
    <rect x="29" y="4" width="6" height="8" fill="${dark}"/>
    <path d="M 29 11 L 35 11 L 41 19 L 41 36 L 23 36 L 23 19 Z" fill="${fill}"/>
    <rect x="23" y="23" width="18" height="5" fill="${dark}"/>`,

  boot: ({ fill, dark }) => `
    <path d="M 22 5 L 36 5 L 36 24 L 48 24 L 48 32 L 22 32 Z" fill="${fill}"/>
    <rect x="20" y="31" width="30" height="5" fill="${dark}"/>
    <rect x="21" y="5" width="16" height="4" fill="${dark}"/>`,

  chest: ({ fill, dark }) => `
    <path d="M 16 18 A 16 12 0 0 1 48 18 Z" fill="${fill}"/>
    <rect x="16" y="18" width="32" height="16" fill="${fill}"/>
    <rect x="16" y="16" width="32" height="4" fill="${dark}"/>
    <rect x="30" y="18" width="4" height="7" fill="${dark}"/>
    <rect x="21" y="8" width="3" height="26" fill="${dark}"/>
    <rect x="40" y="8" width="3" height="26" fill="${dark}"/>`,

  anchor: ({ fill, dark }) => `
    <circle cx="${CX}" cy="8" r="4" fill="none" stroke="${fill}" stroke-width="2.5"/>
    <rect x="30" y="11" width="4" height="22" fill="${fill}"/>
    <rect x="20" y="15" width="24" height="3.5" fill="${fill}"/>
    <path d="M 16 25 Q 18 34 32 35 Q 46 34 48 25" fill="none" stroke="${fill}" stroke-width="3.5"/>
    <polygon points="16,21 21,27 12,28" fill="${dark}"/>
    <polygon points="48,21 52,28 43,27" fill="${dark}"/>`,

  umbrella: ({ fill, dark }) => `
    <path d="M 10 21 A 22 17 0 0 1 54 21 Z" fill="${fill}"/>
    <path d="M 10 21 q 6 5 11 0 q 5 5 11 0 q 6 5 11 0 q 5 5 11 0" fill="none" stroke="${dark}"
      stroke-width="1.6"/>
    <rect x="31" y="21" width="2.5" height="12" fill="${dark}"/>
    <path d="M 32 33 q 0 4 -5 3" fill="none" stroke="${dark}" stroke-width="2.5"/>`,

  phone: ({ fill, dark }) => `
    <rect x="23" y="3" width="18" height="34" rx="3" fill="${fill}"/>
    <rect x="26" y="7" width="12" height="25" fill="${dark}"/>
    <circle cx="32" cy="35" r="1.6" fill="${dark}"/>`,

  fridge: ({ fill, dark }) => `
    <rect x="22" y="2" width="21" height="36" rx="2" fill="${fill}"/>
    <rect x="22" y="12" width="21" height="2" fill="${dark}"/>
    <rect x="25" y="5" width="2.5" height="5" fill="${dark}"/>
    <rect x="25" y="17" width="2.5" height="9" fill="${dark}"/>`,

  cone: ({ fill, dark }) => `
    <polygon points="32,4 45,31 19,31" fill="${fill}"/>
    <polygon points="28,17 36,17 38,23 26,23" fill="#f2f6f0"/>
    <rect x="13" y="31" width="38" height="5" rx="2" fill="${dark}"/>`,

  rod: ({ fill, dark }) => `
    <line x1="12" y1="33" x2="56" y2="8" stroke="${fill}" stroke-width="2.5"
      stroke-linecap="round"/>
    <line x1="10" y1="34" x2="21" y2="28" stroke="${dark}" stroke-width="5"
      stroke-linecap="round"/>
    <circle cx="24" cy="30" r="5" fill="${dark}"/>
    <circle cx="24" cy="30" r="1.8" fill="${fill}"/>`,

  // Мусор без своей формы: мешок с торчащим углом.
  junk: ({ fill, dark }) => `
    <path d="M 20 30 L 24 14 L 42 14 L 46 30 Z" fill="${fill}"/>
    <path d="M 24 14 L 28 7 L 38 7 L 42 14 Z" fill="${dark}"/>
    <path d="M 20 30 L 46 30 L 44 34 L 22 34 Z" fill="${dark}"/>`,
};
