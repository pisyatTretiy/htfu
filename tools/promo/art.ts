/**
 * Промо-иллюстрации: иконка и обложка.
 *
 * Рисуются вектором в том же языке форм, что и игра, — гранёные плоскости
 * без обводок и градиентных переливов. Скриншотом иконка быть не имеет права
 * (требование площадки), а «просто картинкой» — не должна: по ней игрок
 * решает, о чём игра. Поэтому на ней ровно то, ради чего в игру заходят:
 * рыба на леске, вода и солнце.
 */

const SKY_TOP = '#bfe4f7';
const SKY_LOW = '#7cc4ec';
const SEA_TOP = '#3f7fa8';
const SEA_MID = '#2d5f83';
const SEA_LOW = '#1e3752';
const GOLD = '#ffd166';
const GOLD_DARK = '#e3a83c';
const GOLD_DEEP = '#c98a2a';
const DARK = '#123041';
const FOAM = '#eef7fb';

/**
 * Гранёная рыба в прыжке.
 *
 * Голова смотрит вправо-вверх, тело собрано из двух плоскостей: верхняя
 * светлее нижней. Это тот же приём, что и в игре, — форма читается гранями,
 * а не обводкой.
 */
function fish(x: number, y: number, size: number, rotation: number): string {
  const s = size / 100;
  return `
    <g transform="translate(${x} ${y}) rotate(${rotation}) scale(${s})">
      <polygon points="-46,0 -94,-32 -86,0 -94,28" fill="${GOLD_DEEP}"/>
      <polygon points="-46,0 -94,-32 -86,0" fill="${GOLD_DARK}"/>
      <polygon points="0,-32 16,-58 30,-28" fill="${GOLD_DEEP}"/>
      <polygon points="4,28 18,50 32,26" fill="${GOLD_DEEP}"/>
      <polygon points="-46,0 -8,-34 34,-26 72,0" fill="${GOLD}"/>
      <polygon points="-46,0 72,0 34,28 -8,36" fill="${GOLD_DARK}"/>
      <polygon points="-8,-34 34,-26 30,-4 -6,-6" fill="#ffe4a8"/>
      <polygon points="26,-24 34,0 20,24" fill="${GOLD_DEEP}" opacity="0.45"/>
      <circle cx="48" cy="-9" r="8.5" fill="${FOAM}"/>
      <circle cx="50" cy="-9" r="4.2" fill="${DARK}"/>
    </g>`;
}

/** Крючок с леской, уходящей за верхний край кадра. */
function hook(x: number, y: number, size: number, fromX: number): string {
  const s = size / 100;
  return `
    <g>
      <path d="M ${fromX} -10 L ${x} ${y - 40 * s}" stroke="${DARK}" stroke-width="${3 * s}"
        fill="none" stroke-linecap="round" opacity="0.85"/>
      <path d="M ${x} ${y - 40 * s} L ${x} ${y} q 0 ${18 * s} ${-16 * s} ${18 * s}
        q ${-16 * s} 0 ${-16 * s} ${-14 * s}" stroke="${DARK}" stroke-width="${5 * s}"
        fill="none" stroke-linecap="round"/>
    </g>`;
}

/** Низкополигональные волны: две ломаные ступени вместо градиента. */
function sea(width: number, top: number, height: number, step: number): string {
  const crest = (offset: number, amp: number): string => {
    const points: string[] = [`0,${top + offset + amp}`];
    for (let x = 0, i = 0; x <= width + step; x += step, i++) {
      points.push(`${x},${top + offset + (i % 2 === 0 ? 0 : amp)}`);
    }
    points.push(`${width},${top + height}`, `0,${top + height}`);
    return points.join(' ');
  };
  return `
    <polygon points="${crest(0, step * 0.22)}" fill="${SEA_TOP}"/>
    <polygon points="${crest(height * 0.3, step * 0.18)}" fill="${SEA_MID}"/>
    <polygon points="${crest(height * 0.62, step * 0.14)}" fill="${SEA_LOW}"/>`;
}

/** Брызги: гранёные осколки, а не круглые точки. */
function splash(x: number, y: number, size: number): string {
  const s = size / 100;
  const shard = (dx: number, dy: number, scale: number): string =>
    `<polygon points="${x + dx},${y + dy} ${x + dx + 13 * s * scale},${y + dy - 9 * s * scale} ${
      x + dx + 5 * s * scale
    },${y + dy + 12 * s * scale}" fill="${FOAM}"/>`;
  return [
    shard(-46 * s, -6 * s, 1.1),
    shard(-18 * s, -34 * s, 0.8),
    shard(22 * s, -14 * s, 1),
    shard(46 * s, -40 * s, 0.7),
  ].join('');
}

/** Облако из трёх плоскостей. */
function cloud(x: number, y: number, size: number): string {
  const s = size / 100;
  return `
    <g transform="translate(${x} ${y}) scale(${s})">
      <polygon points="-60,12 -34,-16 -4,-22 26,-6 54,10 54,14 -60,14" fill="#ffffff"/>
      <polygon points="-34,-16 -4,-22 6,-4 -22,0" fill="#eef6fc"/>
    </g>`;
}

/** Причал сбоку: настил над водой и сваи, уходящие под неё. */
function pier(x: number, y: number, size: number): string {
  const s = size / 100;
  const piles = [-108, -66, -24, 18]
    .map((px) => `<rect x="${px}" y="6" width="11" height="70" fill="#4a3527"/>`)
    .join('');
  return `
    <g transform="translate(${x} ${y}) scale(${s})">
      ${piles}
      <rect x="-124" y="-10" width="160" height="16" fill="#7a5a40"/>
      <rect x="-124" y="-10" width="160" height="5" fill="#96704f"/>
      <rect x="24" y="-30" width="12" height="24" fill="#4a3527"/>
    </g>`;
}

/** Пара чаек: те же две плоскости, что и в игре. */
function gulls(x: number, y: number, size: number): string {
  const s = size / 100;
  const bird = (dx: number, dy: number, scale: number): string =>
    `<path d="M ${x + dx - 16 * s * scale} ${y + dy} q ${8 * s * scale} ${-9 * s * scale} ${
      16 * s * scale
    } 0 q ${8 * s * scale} ${-9 * s * scale} ${16 * s * scale} 0" fill="none"
      stroke="${DARK}" stroke-width="${3 * s * scale}" stroke-linecap="round" opacity="0.55"/>`;
  return bird(0, 0, 1) + bird(38 * s, 18 * s, 0.75) + bird(-34 * s, 26 * s, 0.6);
}

export function iconSvg(size: number): string {
  const sea_top = size * 0.6;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"
      viewBox="0 0 ${size} ${size}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${SKY_TOP}"/>
        <stop offset="1" stop-color="${SKY_LOW}"/>
      </linearGradient>
    </defs>
    <rect width="${size}" height="${size}" fill="url(#sky)"/>
    <circle cx="${size * 0.18}" cy="${size * 0.16}" r="${size * 0.1}" fill="#ffeaa0"/>
    ${cloud(size * 0.66, size * 0.15, size * 0.26)}
    ${sea(size, sea_top, size - sea_top, size * 0.13)}
    ${splash(size * 0.32, sea_top + size * 0.03, size * 0.4)}
    ${fish(size * 0.47, size * 0.52, size * 0.38, -24)}
    <!-- Крючок держим правее морды: он не должен перекрывать глаз — по глазу
         иконка и читается на маленьком размере. -->
    ${hook(size * 0.79, size * 0.31, size * 0.28, size)}
  </svg>`;
}

export function coverSvg(width: number, height: number): string {
  const sea_top = height * 0.58;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"
      viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${SKY_TOP}"/>
        <stop offset="1" stop-color="${SKY_LOW}"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#sky)"/>
    <circle cx="${width * 0.13}" cy="${height * 0.2}" r="${height * 0.12}" fill="#ffeaa0"/>
    ${cloud(width * 0.32, height * 0.16, height * 0.34)}
    ${cloud(width * 0.72, height * 0.11, height * 0.24)}
    <polygon points="0,${sea_top} ${width * 0.22},${sea_top - height * 0.1} ${width * 0.42},${
      sea_top
    }" fill="#7f9e6a"/>
    <polygon points="${width * 0.06},${sea_top} ${width * 0.22},${sea_top - height * 0.1} ${
      width * 0.3
    },${sea_top}" fill="#96b57c"/>
    ${sea(width, sea_top, height - sea_top, width * 0.075)}
    ${pier(width * 0.17, sea_top + height * 0.09, height * 0.42)}
    ${gulls(width * 0.36, height * 0.2, height * 0.3)}
    ${splash(width * 0.5, sea_top + height * 0.05, height * 0.44)}
    ${fish(width * 0.63, height * 0.52, height * 0.4, -20)}
    ${hook(width * 0.8, height * 0.34, height * 0.28, width)}
  </svg>`;
}
