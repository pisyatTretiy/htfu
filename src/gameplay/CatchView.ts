import { Container, MeshPlane } from 'pixi.js';
import { cartoonFishTexture, junkTexture } from '../fx/textures';
import type { CatchEntry } from '../content/types';

const VERTICES_X = 14;
const VERTICES_Y = 4;

/**
 * Вид улова. По [ADR-0002](../../docs/adr/0002-fish-animation.md) анимация
 * делается деформацией сетки, а не скелетом: художник отдаёт один PNG сбоку,
 * а бегущая по телу синусоида живёт в коде. Параметры волны — в catches.json,
 * так что дизайнер правит движение, не открывая редактор.
 */
export class CatchView {
  readonly view = new Container();

  private readonly mesh: MeshPlane;
  private readonly base: Float32Array;
  private readonly width: number;
  private readonly height: number;
  private time = 0;

  constructor(private readonly entry: CatchEntry) {
    const texture =
      entry.kind === 'junk'
        ? junkTexture(entry.id, entry.body.length, entry.body.fill, entry.body.outline)
        : cartoonFishTexture(entry.body.length, hash(entry.id), entry.body.fill, entry.body.outline);

    this.mesh = new MeshPlane({ texture, verticesX: VERTICES_X, verticesY: VERTICES_Y });
    this.width = texture.width;
    this.height = texture.height;
    this.mesh.x = -this.width / 2;
    this.mesh.y = -this.height / 2;
    this.base = Float32Array.from(this.mesh.geometry.positions);
    this.view.addChild(this.mesh);
  }

  get size(): number {
    return this.width;
  }

  /**
   * @param dt секунды
   * @param intensity 0..1 — насколько сильно бьётся; на рывке тело выгибается резче
   */
  update(dt: number, intensity: number): void {
    this.time += dt;
    const { wave, amp } = this.entry.body;
    const positions = this.mesh.geometry.positions;
    const swing = this.height * amp * (0.6 + intensity * 1.6);

    for (let i = 0; i < positions.length; i += 2) {
      const bx = this.base[i] ?? 0;
      const by = this.base[i + 1] ?? 0;
      // Амплитуда растёт от головы к хвосту: голова почти неподвижна.
      const along = bx / this.width;
      positions[i] = bx;
      positions[i + 1] = by + Math.sin(this.time * 8 - along * wave * Math.PI) * swing * along * along;
    }
    this.mesh.geometry.getBuffer('aPosition').update();
  }
}

function hash(value: string): number {
  let result = 2166136261;
  for (let i = 0; i < value.length; i++) {
    result ^= value.charCodeAt(i);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}
