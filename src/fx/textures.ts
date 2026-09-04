import { Texture } from 'pixi.js';
import { Rng } from '../core/Rng';

/**
 * Процедурные текстуры. На спайке нет ни одного файла-ассета: всё рисуется в
 * canvas на старте. Так спайк весит килобайты и не ждёт художника, а замеры
 * FPS остаются честными — рендерятся ровно те же спрайты и блендинги.
 */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const el = document.createElement('canvas');
  el.width = Math.max(1, Math.round(w));
  el.height = Math.max(1, Math.round(h));
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('2d-контекст недоступен');
  return [el, ctx];
}

/**
 * Растворяет нижний край силуэта в воде. Без этого видно прямоугольник
 * текстуры: скалы висят в толще воды и ни на что не опираются.
 */
function fadeBottom(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  portion: number,
): void {
  const from = height * (1 - portion);
  const grad = ctx.createLinearGradient(0, from, 0, height);
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalCompositeOperation = 'destination-in';
  ctx.fillStyle = grad;
  ctx.fillRect(0, from, width, height - from);
  ctx.globalCompositeOperation = 'source-over';
}

export interface GradientStop {
  at: number;
  color: string;
}

/** Вертикальный градиент — колонна воды от поверхности до разлома. */
export function gradientTexture(stops: readonly GradientStop[], height = 1024): Texture {
  const [el, ctx] = canvas(8, height);
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  for (const stop of stops) grad.addColorStop(stop.at, stop.color);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, height);
  return Texture.from(el);
}

/** Мягкое пятно света: godray, фонарь, свечение глубоководных. */
export function radialTexture(size = 256, inner = '#ffffff', softness = 1): Texture {
  const [el, ctx] = canvas(size, size);
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, inner);
  grad.addColorStop(Math.min(0.9, 0.25 * softness), 'rgba(255,255,255,0.28)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return Texture.from(el);
}

/**
 * Бесшовный тайл каустик. Пятна дублируются по краям, поэтому тайл стыкуется
 * сам с собой — иначе на скролле видны швы.
 */
export function causticsTexture(size = 256, seed = 7): Texture {
  const [el, ctx] = canvas(size, size);
  const rng = new Rng(seed);
  ctx.globalCompositeOperation = 'lighter';

  const blobs = 46;
  for (let i = 0; i < blobs; i++) {
    const x = rng.range(0, size);
    const y = rng.range(0, size);
    const rx = rng.range(size * 0.03, size * 0.085);
    const ry = rx * rng.range(0.2, 0.42);
    const alpha = rng.range(0.06, 0.18);
    const angle = rng.range(0, Math.PI);

    // Девять копий: центральная плюс восемь сдвигов на размер тайла.
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const cx = x + ox * size;
        const cy = y + oy * size;
        if (cx < -size * 0.3 || cx > size * 1.3 || cy < -size * 0.3 || cy > size * 1.3) continue;
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
        grad.addColorStop(0, `rgba(190, 255, 245, ${alpha})`);
        grad.addColorStop(1, 'rgba(190, 255, 245, 0)');
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.scale(1, ry / rx);
        ctx.translate(-cx, -cy);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, rx, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }
  return Texture.from(el);
}

/** Луч света: узкая полоса, гаснущая книзу и по краям. */
export function godrayTexture(width = 96, height = 512): Texture {
  const [el, ctx] = canvas(width, height);
  const vertical = ctx.createLinearGradient(0, 0, 0, height);
  vertical.addColorStop(0, 'rgba(255,255,255,0.55)');
  vertical.addColorStop(0.55, 'rgba(255,255,255,0.16)');
  vertical.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = vertical;
  ctx.fillRect(0, 0, width, height);

  // Гасим боковые кромки, чтобы луч не читался как прямоугольник.
  ctx.globalCompositeOperation = 'destination-in';
  const horizontal = ctx.createLinearGradient(0, 0, width, 0);
  horizontal.addColorStop(0, 'rgba(0,0,0,0)');
  horizontal.addColorStop(0.5, 'rgba(0,0,0,1)');
  horizontal.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = horizontal;
  ctx.fillRect(0, 0, width, height);
  return Texture.from(el);
}

/** Силуэт скалы: рваный контур, заливка одним цветом — один draw call. */
export function rockTexture(width: number, height: number, seed: number, color = '#000000'): Texture {
  const [el, ctx] = canvas(width, height);
  const rng = new Rng(seed);
  const steps = rng.int(5, 9);

  ctx.beginPath();
  ctx.moveTo(0, height);
  let x = 0;
  // Края гряды опускаются к низу текстуры: иначе на месте её границы виден
  // вертикальный срез, и силуэт читается как прямоугольник.
  let y = height * 0.98;
  ctx.lineTo(x, y);
  for (let i = 0; i < steps; i++) {
    const nx = ((i + 1) / steps) * width;
    const edge = i === steps - 1;
    const ny = edge ? height * 0.98 : height * rng.range(0.18, 0.7);
    const cx = (x + nx) / 2 + rng.range(-width * 0.06, width * 0.06);
    const cy = Math.min(y, ny) - rng.range(height * 0.05, height * 0.22);
    ctx.quadraticCurveTo(cx, cy, nx, ny);
    x = nx;
    y = ny;
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  fadeBottom(ctx, width, height, 0.45);
  return Texture.from(el);
}

/** Прядь водорослей — вертикальная волнистая лента. */
export function kelpTexture(height: number, seed: number, color = '#000000'): Texture {
  const width = Math.max(24, Math.round(height * 0.16));
  const [el, ctx] = canvas(width, height);
  const rng = new Rng(seed);
  const sway = rng.range(width * 0.18, width * 0.34);
  const phase = rng.range(0, Math.PI * 2);
  const thickness = rng.range(width * 0.1, width * 0.2);

  ctx.beginPath();
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    const px = width / 2 + Math.sin(phase + t * 4.2) * sway * t;
    const py = height - t * height;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.lineCap = 'round';
  ctx.stroke();
  fadeBottom(ctx, width, height, 0.3);
  return Texture.from(el);
}

/** Текстура лески: мягкая горизонтальная нить для MeshRope. */
export function lineTexture(thickness = 4): Texture {
  const [el, ctx] = canvas(8, thickness);
  const grad = ctx.createLinearGradient(0, 0, 0, thickness);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 8, thickness);
  return Texture.from(el);
}
