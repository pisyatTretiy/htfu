import { Texture } from 'pixi.js';
import { Rng } from '../core/Rng';

/**
 * Декор первой локации — «Причал новичка».
 *
 * Рисуется кодом, как и вся графика спайка: пока художник не подключился, это
 * задаёт лицо локации и проверяет композицию. Когда придут рисованные ассеты,
 * они подменят текстуры здесь, не трогая сцену.
 *
 * Регистр — из ADR-0003: толстые контуры, плоские заливки, крупные формы.
 */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const el = document.createElement('canvas');
  el.width = Math.max(1, Math.round(w));
  el.height = Math.max(1, Math.round(h));
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('2d-контекст недоступен');
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  return [el, ctx];
}

function outlined(
  ctx: CanvasRenderingContext2D,
  draw: () => void,
  fill: string,
  outline: string,
  width: number,
): void {
  draw();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.strokeStyle = outline;
  ctx.stroke();
}

/** Настил причала с досками и сваями, уходящими под воду. */
export function pierTexture(width = 340, height = 220): Texture {
  const [el, ctx] = canvas(width, height);
  const deckY = 44;
  const plank = '#c98a4b';
  const dark = '#5a2f14';

  // Сваи: три штуки, уходят вниз за срез текстуры.
  for (const x of [width * 0.28, width * 0.58, width * 0.86]) {
    outlined(
      ctx,
      () => {
        ctx.beginPath();
        ctx.rect(x - 11, deckY + 8, 22, height - deckY - 8);
      },
      '#8b5a2b',
      dark,
      5,
    );
  }

  // Настил.
  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.rect(0, deckY - 18, width, 26);
    },
    plank,
    dark,
    5,
  );
  ctx.strokeStyle = 'rgba(90,47,20,.5)';
  ctx.lineWidth = 2;
  for (let x = 18; x < width; x += 26) {
    ctx.beginPath();
    ctx.moveTo(x, deckY - 16);
    ctx.lineTo(x, deckY + 6);
    ctx.stroke();
  }

  // Столбик с фонарём в начале причала — точка притяжения взгляда.
  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.rect(width * 0.1 - 6, deckY - 74, 12, 60);
    },
    '#8b5a2b',
    dark,
    4,
  );
  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.ellipse(width * 0.1, deckY - 82, 13, 15, 0, 0, Math.PI * 2);
    },
    '#ffd166',
    dark,
    4,
  );

  // Ящик и ведро на настиле.
  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.rect(width * 0.42, deckY - 50, 40, 34);
    },
    '#a9713c',
    dark,
    4,
  );
  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(width * 0.68, deckY - 16);
      ctx.lineTo(width * 0.7, deckY - 40);
      ctx.lineTo(width * 0.79, deckY - 40);
      ctx.lineTo(width * 0.81, deckY - 16);
      ctx.closePath();
    },
    '#4fb3d9',
    '#153f52',
    4,
  );

  // Сваи растворяются в глубине: иначе они обрезаны прямой линией.
  const fade = ctx.createLinearGradient(0, height * 0.55, 0, height);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = fade;
  ctx.fillRect(0, height * 0.55, width, height * 0.45);
  ctx.globalCompositeOperation = 'source-over';

  return Texture.from(el);
}

/** Островок с сараем механика на горизонте: сюжет игры виден из лодки. */
export function shoreTexture(width = 260, height = 120): Texture {
  const [el, ctx] = canvas(width, height);

  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.quadraticCurveTo(width * 0.2, height * 0.42, width * 0.5, height * 0.4);
      ctx.quadraticCurveTo(width * 0.82, height * 0.38, width, height);
      ctx.closePath();
    },
    '#5fae62',
    '#204d29',
    5,
  );

  // Сарай: коробка и двускатная крыша.
  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.rect(width * 0.42, height * 0.22, 54, 34);
    },
    '#d9a05b',
    '#4a2a10',
    4,
  );
  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(width * 0.4, height * 0.23);
      ctx.lineTo(width * 0.49, height * 0.06);
      ctx.lineTo(width * 0.58, height * 0.23);
      ctx.closePath();
    },
    '#c0563b',
    '#4a2a10',
    4,
  );

  return Texture.from(el);
}

/**
 * Контур силуэта, а не каждой дуги.
 *
 * Обычный stroke по пути из нескольких кругов обводит и внутренние стыки —
 * облако превращается в олимпийские кольца. Поэтому заливку рисуем в отдельный
 * холст и «раздуваем» её копиями по кругу: получается контур только снаружи.
 */
function unionOutline(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  drawFill: (target: CanvasRenderingContext2D) => void,
  fill: string,
  outline: string,
  thickness: number,
): void {
  const [shape, shapeCtx] = canvas(width, height);
  drawFill(shapeCtx);
  shapeCtx.fillStyle = fill;
  shapeCtx.fill();

  const [silhouette, silhouetteCtx] = canvas(width, height);
  silhouetteCtx.drawImage(shape, 0, 0);
  silhouetteCtx.globalCompositeOperation = 'source-in';
  silhouetteCtx.fillStyle = outline;
  silhouetteCtx.fillRect(0, 0, width, height);

  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2;
    ctx.drawImage(silhouette, Math.cos(angle) * thickness, Math.sin(angle) * thickness);
  }
  ctx.drawImage(shape, 0, 0);
}

/** Мультяшное облако: три круга под одним общим контуром. */
export function cloudTexture(width = 200, seed = 1): Texture {
  const rng = new Rng(seed);
  const height = Math.round(width * 0.52);
  const pad = 6;
  const [el, ctx] = canvas(width + pad * 2, height + pad * 2);
  const big = height * rng.range(0.34, 0.42);

  unionOutline(
    ctx,
    width + pad * 2,
    height + pad * 2,
    (target) => {
      target.beginPath();
      target.arc(pad + width * 0.3, pad + height * 0.62, height * 0.3, 0, Math.PI * 2);
      target.arc(pad + width * 0.5, pad + height * 0.46, big, 0, Math.PI * 2);
      target.arc(pad + width * 0.72, pad + height * 0.64, height * 0.28, 0, Math.PI * 2);
      target.rect(pad + width * 0.3, pad + height * 0.62, width * 0.42, height * 0.28);
    },
    '#ffffff',
    '#bfe4ef',
    4,
  );

  return Texture.from(el);
}

/** Чайка: две дуги. Больше и не нужно — она читается силуэтом. */
export function seagullTexture(width = 46): Texture {
  const height = Math.round(width * 0.5);
  const [el, ctx] = canvas(width, height);

  ctx.strokeStyle = '#2c4a54';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(2, height * 0.7);
  ctx.quadraticCurveTo(width * 0.25, height * 0.15, width * 0.5, height * 0.6);
  ctx.quadraticCurveTo(width * 0.75, height * 0.15, width - 2, height * 0.7);
  ctx.stroke();

  return Texture.from(el);
}

/** Песчаная отмель под причалом: локация читается мелководьем с обрывом. */
export function shelfTexture(width = 620, height = 320): Texture {
  const [el, ctx] = canvas(width, height);

  outlined(
    ctx,
    () => {
      ctx.beginPath();
      ctx.moveTo(0, height);
      ctx.lineTo(0, height * 0.2);
      ctx.quadraticCurveTo(width * 0.3, height * 0.1, width * 0.55, height * 0.24);
      // Обрыв: дальше начинается глубина.
      ctx.quadraticCurveTo(width * 0.8, height * 0.45, width, height);
      ctx.closePath();
    },
    '#e8c98b',
    '#a37b42',
    5,
  );

  // Камешки на песке.
  const rng = new Rng(41);
  ctx.fillStyle = '#c9a76b';
  for (let i = 0; i < 14; i++) {
    const x = rng.range(width * 0.05, width * 0.6);
    const y = rng.range(height * 0.34, height * 0.62);
    ctx.beginPath();
    ctx.ellipse(x, y, rng.range(4, 11), rng.range(3, 7), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Песок уходит в темноту, а не обрывается прямой линией.
  const fade = ctx.createLinearGradient(0, height * 0.55, 0, height);
  fade.addColorStop(0, 'rgba(0,0,0,0)');
  fade.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = fade;
  ctx.fillRect(0, height * 0.55, width, height * 0.45);
  ctx.globalCompositeOperation = 'source-over';

  return Texture.from(el);
}
