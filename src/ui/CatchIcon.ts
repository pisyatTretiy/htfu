import type { CatchEntry } from '../content/types';

/**
 * Значок улова для альбома.
 *
 * Рисуется из тех же данных, что и модель в игре: длина, цвет, «волнистость»
 * тела. Поэтому окунь в альбоме толще и синее уклейки, а не отличается от неё
 * подписью.
 *
 * Нераскрытый вид показывается силуэтом: игрок видит, чего ему не хватает, —
 * это и есть коллекция. Пустой квадрат с «???» коллекцией не ощущается.
 */
const WIDTH = 64;
const HEIGHT = 34;

export function catchIcon(entry: CatchEntry, known: boolean): string {
  // Силуэт светлее фона карточки, а не темнее: на тёмной панели тёмная тень
  // не читается вовсе, и альбом выглядит пустым, а не собираемым.
  const fill = known ? entry.body.fill : '#66889a';
  const dark = known ? entry.body.outline : '#4d6b7a';
  const shape = entry.kind === 'fish' ? fishShape(entry, fill, dark, known) : junkShape(fill, dark);
  return `<svg class="album-icon" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}"
    height="${HEIGHT}" aria-hidden="true">${shape}</svg>`;
}

function fishShape(entry: CatchEntry, fill: string, dark: string, known: boolean): string {
  // Длина вида в сантиметрах превращается в высоту тела: мелкая рыба узкая,
  // крупная — заметно выше, и по одному силуэту видно, кто перед тобой.
  const size = Math.max(0.55, Math.min(1.35, entry.body.length / 120));
  const half = 9 * size;
  const nose = 54;
  const tail = 14;
  const belly = 17 + half;
  const back = 17 - half;
  // «Волнистость» тела разводит спинной плавник: у вертлявой рыбы он ближе к
  // хвосту, у спокойной — к середине.
  const finX = 26 + Math.min(10, entry.body.wave * 2.2);

  return `
    <polygon points="${tail},17 ${tail - 10},${back - 3} ${tail - 6},17 ${tail - 10},${
      belly + 3
    }" fill="${dark}"/>
    <path d="M ${tail} 17 Q ${(tail + nose) / 2} ${back} ${nose} 17
      Q ${(tail + nose) / 2} ${belly} ${tail} 17 Z" fill="${fill}"/>
    <polygon points="${finX},${back + 2} ${finX + 7},${back - 6} ${finX + 12},${
      back + 3
    }" fill="${dark}"/>
    ${known ? `<circle cx="47" cy="15.5" r="2.4" fill="#0d1c22"/>` : ''}`;
}

function junkShape(fill: string, dark: string): string {
  // Мусор не рыба, и притворяться ею не должен: мешок с торчащим углом.
  return `
    <path d="M 20 27 L 24 12 L 42 12 L 46 27 Z" fill="${fill}"/>
    <path d="M 24 12 L 28 6 L 38 6 L 42 12 Z" fill="${dark}"/>
    <path d="M 20 27 L 46 27 L 44 30 L 22 30 Z" fill="${dark}"/>`;
}
