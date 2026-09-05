import { i18n } from '../services/I18n';
import type { Zone } from '../meta/Zones';

/**
 * Карта архипелага.
 *
 * Список строк не даёт главного: где игрок находится и куда ведёт путь.
 * Карта рисуется вектором из тех же данных, что и локации, — цвет острова
 * берётся из палитры зоны, поэтому «Ледяная банка» на карте белёсая, а
 * «Гниль» — тёмно-зелёная, ещё до того, как игрок туда попал.
 */

const WIDTH = 320;
const HEIGHT = 168;

/** Расположение островов. Пять точек, разведённых по кадру, — маршрут читается. */
const SPOTS: readonly { x: number; y: number; r: number }[] = [
  { x: 52, y: 118, r: 26 },
  { x: 118, y: 62, r: 23 },
  { x: 176, y: 122, r: 25 },
  { x: 238, y: 58, r: 22 },
  { x: 284, y: 124, r: 27 },
];

export interface MapZoneView {
  zone: Zone;
  unlocked: boolean;
  current: boolean;
}

export function archipelagoSvg(views: readonly MapZoneView[]): string {
  const route = views
    .map((_, index) => SPOTS[index])
    .filter((spot): spot is { x: number; y: number; r: number } => Boolean(spot))
    .map((spot, index) => `${index === 0 ? 'M' : 'L'} ${spot.x} ${spot.y}`)
    .join(' ');

  const islands = views
    .map((view, index) => island(view, SPOTS[index]))
    .join('');

  return `<svg class="map-art" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img"
      aria-label="${i18n.t('map.title')}">
    <defs>
      <linearGradient id="mapSea" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2b5f80"/>
        <stop offset="1" stop-color="#16374d"/>
      </linearGradient>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#mapSea)"/>
    ${waves()}
    <path d="${route}" stroke="#eafffb" stroke-opacity="0.35" stroke-width="2"
      stroke-dasharray="5 6" fill="none"/>
    ${islands}
  </svg>`;
}

/** Пунктир волн: без него море на карте — просто заливка. */
function waves(): string {
  const rows: string[] = [];
  for (let y = 22; y < HEIGHT; y += 26) {
    for (let x = 14 + (y % 52 === 22 ? 0 : 16); x < WIDTH - 10; x += 44) {
      rows.push(
        `<path d="M ${x} ${y} q 6 -4 12 0 q 6 4 12 0" stroke="#ffffff" stroke-opacity="0.12"
          stroke-width="2" fill="none"/>`,
      );
    }
  }
  return rows.join('');
}

function island(view: MapZoneView, spot?: { x: number; y: number; r: number }): string {
  if (!spot) return '';
  const { zone, unlocked, current } = view;
  const sand = unlocked ? zone.sand : '#54646c';
  const land = unlocked ? zone.foliage : '#3d4b52';
  const label = unlocked ? i18n.pick(zone.name) : '???';

  // Остров — гранёный многоугольник, а не круг: та же грамматика формы, что и
  // всё остальное в игре.
  const facets = (radius: number, seed: number): string =>
    Array.from({ length: 7 }, (_, i) => {
      const angle = (i / 7) * Math.PI * 2;
      const wobble = 0.78 + ((Math.sin(seed + i * 2.3) + 1) / 2) * 0.34;
      return `${(spot.x + Math.cos(angle) * radius * wobble).toFixed(1)},${(
        spot.y +
        Math.sin(angle) * radius * wobble * 0.72
      ).toFixed(1)}`;
    }).join(' ');

  // Острова верхнего ряда подписываются сверху: снизу подпись «Скалистая
  // бухта» наезжала на соседний остров нижнего ряда и на кольцо «вы здесь».
  const labelY = spot.y < HEIGHT / 2 ? spot.y - spot.r - 8 : spot.y + spot.r + 16;

  return `
    <g class="map-island${current ? ' current' : ''}${unlocked ? '' : ' locked'}"
       data-zone="${zone.id}" tabindex="${unlocked && !current ? '0' : '-1'}"
       role="${unlocked && !current ? 'button' : 'img'}" aria-label="${label}">
      <polygon points="${facets(spot.r, zone.id.length)}" fill="${sand}"/>
      <polygon points="${facets(spot.r * 0.72, zone.id.length + 3)}" fill="${land}"/>
      ${current ? `<circle cx="${spot.x}" cy="${spot.y}" r="${spot.r + 6}" fill="none"
        stroke="#ffd166" stroke-width="2.5"/>` : ''}
      ${unlocked ? '' : `<text x="${spot.x}" y="${spot.y + 5}" text-anchor="middle"
        font-size="15">🔒</text>`}
      <text x="${spot.x}" y="${labelY}" text-anchor="middle" font-size="11"
        fill="#eafffb" font-weight="600">${label}</text>
    </g>`;
}
