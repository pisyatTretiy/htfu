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
  // destination-out стирает там, где рисует: прозрачный сверху — фигура цела,
  // непрозрачный снизу — край растворяется. С destination-in исчезала бы вся
  // часть фигуры выше прямоугольника.
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.globalCompositeOperation = 'destination-out';
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

/**
 * Силуэт скалы: круглые валуны с толстым контуром. Комедийный регистр —
 * никаких рваных реалистичных обводов, только пузатые формы (ADR-0003).
 */
export function rockTexture(
  width: number,
  height: number,
  seed: number,
  fill = '#0b5f8c',
  outline = '#052f4a',
): Texture {
  const pad = 10;
  const [el, ctx] = canvas(width, height + pad);
  const rng = new Rng(seed);
  const lumps = rng.int(3, 5);

  // Все валуны опираются на нижний край текстуры: ни одного вертикального
  // среза, иначе на месте границы виден прямоугольник.
  const base = height + pad;
  ctx.beginPath();
  ctx.moveTo(0, base);
  for (let i = 0; i < lumps; i++) {
    const from = (i / lumps) * width;
    const to = ((i + 1) / lumps) * width;
    const top = height * rng.range(0.16, 0.55);
    ctx.bezierCurveTo(from + (to - from) * 0.12, top, to - (to - from) * 0.12, top, to, base);
  }
  ctx.closePath();

  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(4, width * 0.012);
  ctx.strokeStyle = outline;
  ctx.lineJoin = 'round';
  ctx.stroke();

  fadeBottom(ctx, width, height + pad, 0.26);
  return Texture.from(el);
}

/** Прядь водорослей: яркая лента с тёмным контуром. */
export function kelpTexture(height: number, seed: number, fill = '#3ec55d'): Texture {
  const width = Math.max(34, Math.round(height * 0.22));
  const [el, ctx] = canvas(width, height);
  const rng = new Rng(seed);
  const sway = rng.range(width * 0.16, width * 0.3);
  const phase = rng.range(0, Math.PI * 2);
  const thickness = rng.range(width * 0.16, width * 0.26);

  const trace = (): void => {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const px = width / 2 + Math.sin(phase + t * 4.2) * sway * t;
      const py = height - t * height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
  };

  ctx.lineCap = 'round';
  trace();
  ctx.strokeStyle = '#0b3a22';
  ctx.lineWidth = thickness + 7;
  ctx.stroke();
  trace();
  ctx.strokeStyle = fill;
  ctx.lineWidth = thickness;
  ctx.stroke();

  fadeBottom(ctx, width, height, 0.14);
  return Texture.from(el);
}

/** Пузырь: кольцо с бликом. Мультяшная взвесь вместо «морского снега». */
export function bubbleTexture(size = 48): Texture {
  const [el, ctx] = canvas(size, size);
  const r = size / 2 - 4;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(190, 250, 255, 0.22)';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(232, 255, 255, 0.85)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(size / 2 - r * 0.35, size / 2 - r * 0.35, r * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.fill();
  return Texture.from(el);
}

/**
 * Гротескный силуэт рыбы для фона: огромная голова, куцый хвост, выпученный
 * глаз. Пропорции намеренно неправильные — это и есть регистр (ADR-0003).
 */
export function cartoonFishTexture(
  width: number,
  seed: number,
  fill = '#0d6ea3',
  outline = '#04304c',
): Texture {
  const rng = new Rng(seed);
  const height = Math.round(width * rng.range(0.5, 0.78));
  const pad = 8;
  const [el, ctx] = canvas(width + pad * 2, height + pad * 2);
  const cx = pad + width * 0.42;
  const cy = pad + height / 2;
  const bodyW = width * 0.44;
  const bodyH = height * rng.range(0.34, 0.48);

  ctx.beginPath();
  // Тело — пузатый эллипс, смещённый к морде.
  ctx.ellipse(cx, cy, bodyW, bodyH, 0, 0, Math.PI * 2);
  ctx.closePath();
  // Хвост — треугольник, вдвое мельче головы.
  ctx.moveTo(cx + bodyW * 0.7, cy);
  ctx.lineTo(pad + width, cy - height * rng.range(0.2, 0.34));
  ctx.lineTo(pad + width, cy + height * rng.range(0.2, 0.34));
  ctx.closePath();

  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = Math.max(3.5, width * 0.022);
  ctx.strokeStyle = outline;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // Глаз — крупный, ближе к морде, чем анатомически положено.
  const eyeX = cx - bodyW * 0.52;
  const eyeR = Math.max(4, bodyH * 0.3);
  ctx.beginPath();
  ctx.arc(eyeX, cy - bodyH * 0.22, eyeR, 0, Math.PI * 2);
  ctx.fillStyle = '#f4ffff';
  ctx.fill();
  ctx.lineWidth = Math.max(2.5, width * 0.014);
  ctx.strokeStyle = outline;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(eyeX - eyeR * 0.2, cy - bodyH * 0.22, eyeR * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = outline;
  ctx.fill();

  return Texture.from(el);
}

/**
 * Силуэты мусора. Узнаваемость здесь — не украшение: весь смысл механики
 * «клюёт не всегда рыба» в том, что игрок понимает, что именно он вытащил
 * (ADR-0003, носитель № 1). Поэтому не абстрактные кляксы, а формы.
 */
export function junkTexture(
  id: string,
  width: number,
  fill = '#8b5a3c',
  outline = '#3a1f10',
): Texture {
  const pad = 8;
  const height = Math.round(width * 0.82);
  const [el, ctx] = canvas(width + pad * 2, height + pad * 2);
  const w = width;
  const h = height;
  const ox = pad;
  const oy = pad;

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(4, width * 0.05);
  ctx.strokeStyle = outline;
  ctx.fillStyle = fill;

  const shape = (): void => {
    switch (id) {
      case 'kettle': {
        ctx.beginPath();
        ctx.ellipse(ox + w * 0.45, oy + h * 0.62, w * 0.3, h * 0.3, 0, 0, Math.PI * 2);
        ctx.closePath();
        ctx.moveTo(ox + w * 0.7, oy + h * 0.52);
        ctx.lineTo(ox + w * 0.96, oy + h * 0.3);
        ctx.lineTo(ox + w * 0.86, oy + h * 0.62);
        ctx.closePath();
        break;
      }
      case 'cone': {
        ctx.beginPath();
        ctx.moveTo(ox + w * 0.5, oy + h * 0.1);
        ctx.lineTo(ox + w * 0.78, oy + h * 0.78);
        ctx.lineTo(ox + w * 0.22, oy + h * 0.78);
        ctx.closePath();
        ctx.moveTo(ox + w * 0.12, oy + h * 0.78);
        ctx.lineTo(ox + w * 0.88, oy + h * 0.78);
        ctx.lineTo(ox + w * 0.88, oy + h * 0.92);
        ctx.lineTo(ox + w * 0.12, oy + h * 0.92);
        ctx.closePath();
        break;
      }
      case 'rod': {
        ctx.beginPath();
        ctx.moveTo(ox + w * 0.08, oy + h * 0.86);
        ctx.lineTo(ox + w * 0.94, oy + h * 0.14);
        ctx.lineTo(ox + w * 0.88, oy + h * 0.06);
        ctx.lineTo(ox + w * 0.02, oy + h * 0.78);
        ctx.closePath();
        ctx.moveTo(ox + w * 0.3, oy + h * 0.72);
        ctx.arc(ox + w * 0.26, oy + h * 0.72, w * 0.1, 0, Math.PI * 2);
        break;
      }
      case 'tire': {
        // Кольцо: внешний круг по часовой, внутренний против — получается дырка.
        ctx.beginPath();
        ctx.arc(ox + w * 0.5, oy + h * 0.5, w * 0.42, 0, Math.PI * 2);
        ctx.arc(ox + w * 0.5, oy + h * 0.5, w * 0.2, 0, Math.PI * 2, true);
        break;
      }
      case 'chest': {
        ctx.beginPath();
        ctx.rect(ox + w * 0.12, oy + h * 0.42, w * 0.76, h * 0.44);
        ctx.moveTo(ox + w * 0.12, oy + h * 0.42);
        ctx.quadraticCurveTo(ox + w * 0.5, oy + h * 0.08, ox + w * 0.88, oy + h * 0.42);
        ctx.closePath();
        ctx.moveTo(ox + w * 0.44, oy + h * 0.5);
        ctx.rect(ox + w * 0.44, oy + h * 0.5, w * 0.12, h * 0.16);
        break;
      }
      case 'can': {
        ctx.beginPath();
        ctx.rect(ox + w * 0.3, oy + h * 0.24, w * 0.4, h * 0.6);
        ctx.moveTo(ox + w * 0.3, oy + h * 0.24);
        ctx.ellipse(ox + w * 0.5, oy + h * 0.24, w * 0.2, h * 0.08, 0, 0, Math.PI * 2);
        break;
      }
      case 'bottle': {
        ctx.beginPath();
        ctx.rect(ox + w * 0.42, oy + h * 0.1, w * 0.16, h * 0.24);
        ctx.moveTo(ox + w * 0.3, oy + h * 0.34);
        ctx.quadraticCurveTo(ox + w * 0.28, oy + h * 0.44, ox + w * 0.28, oy + h * 0.86);
        ctx.lineTo(ox + w * 0.72, oy + h * 0.86);
        ctx.quadraticCurveTo(ox + w * 0.72, oy + h * 0.44, ox + w * 0.7, oy + h * 0.34);
        ctx.closePath();
        break;
      }
      case 'anchor': {
        ctx.beginPath();
        ctx.rect(ox + w * 0.45, oy + h * 0.2, w * 0.1, h * 0.6);
        ctx.moveTo(ox + w * 0.25, oy + h * 0.36);
        ctx.rect(ox + w * 0.25, oy + h * 0.32, w * 0.5, h * 0.08);
        ctx.moveTo(ox + w * 0.14, oy + h * 0.62);
        ctx.quadraticCurveTo(ox + w * 0.5, oy + h * 0.98, ox + w * 0.86, oy + h * 0.62);
        ctx.lineTo(ox + w * 0.74, oy + h * 0.6);
        ctx.quadraticCurveTo(ox + w * 0.5, oy + h * 0.82, ox + w * 0.26, oy + h * 0.6);
        ctx.closePath();
        ctx.moveTo(ox + w * 0.5, oy + h * 0.1);
        ctx.arc(ox + w * 0.5, oy + h * 0.16, w * 0.1, 0, Math.PI * 2);
        break;
      }
      case 'umbrella': {
        ctx.beginPath();
        ctx.moveTo(ox + w * 0.08, oy + h * 0.52);
        ctx.quadraticCurveTo(ox + w * 0.5, oy + h * 0.02, ox + w * 0.92, oy + h * 0.52);
        ctx.closePath();
        ctx.moveTo(ox + w * 0.46, oy + h * 0.52);
        ctx.rect(ox + w * 0.46, oy + h * 0.52, w * 0.08, h * 0.34);
        ctx.moveTo(ox + w * 0.34, oy + h * 0.86);
        ctx.quadraticCurveTo(ox + w * 0.46, oy + h * 0.96, ox + w * 0.5, oy + h * 0.82);
        ctx.closePath();
        break;
      }
      case 'phone': {
        ctx.beginPath();
        ctx.roundRect(ox + w * 0.32, oy + h * 0.12, w * 0.36, h * 0.76, w * 0.06);
        break;
      }
      case 'fridge': {
        ctx.beginPath();
        ctx.rect(ox + w * 0.26, oy + h * 0.06, w * 0.48, h * 0.88);
        ctx.moveTo(ox + w * 0.26, oy + h * 0.36);
        ctx.rect(ox + w * 0.26, oy + h * 0.34, w * 0.48, h * 0.04);
        ctx.moveTo(ox + w * 0.64, oy + h * 0.2);
        ctx.rect(ox + w * 0.64, oy + h * 0.18, w * 0.05, h * 0.12);
        break;
      }
      default: {
        // Сапог: голенище плюс ступня.
        ctx.beginPath();
        ctx.moveTo(ox + w * 0.28, oy + h * 0.08);
        ctx.lineTo(ox + w * 0.6, oy + h * 0.08);
        ctx.lineTo(ox + w * 0.62, oy + h * 0.6);
        ctx.lineTo(ox + w * 0.94, oy + h * 0.66);
        ctx.quadraticCurveTo(ox + w * 0.99, oy + h * 0.86, ox + w * 0.86, oy + h * 0.9);
        ctx.lineTo(ox + w * 0.3, oy + h * 0.9);
        ctx.quadraticCurveTo(ox + w * 0.22, oy + h * 0.7, ox + w * 0.28, oy + h * 0.08);
        ctx.closePath();
        break;
      }
    }
  };

  shape();
  ctx.fill();
  ctx.stroke();
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
