import {
  BufferAttribute,
  Color,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
} from 'three';
import type { CatchEntry } from '../content/types';

/**
 * Модель улова. Пока это процедурная геометрия из примитивов — как и весь арт
 * до подключения художника: тело-эллипсоид, хвост-конус, крупный глаз.
 *
 * Изгиб тела делается смещением вершин по оси: скелет здесь избыточен, а на
 * рисованные модели с риггингом это меняется подменой класса (ADR-0004).
 */
export class FishView3D {
  readonly group = new Group();

  private readonly body: Mesh;
  private readonly tail: Mesh;
  private readonly base: Float32Array;
  private time = 0;

  constructor(private readonly entry: CatchEntry) {
    const length = entry.body.length / 100;
    const color = new Color(entry.body.fill);

    const geometry = new SphereGeometry(length * 0.5, 16, 12);
    geometry.scale(1, 0.62, 0.44);
    this.base = Float32Array.from(geometry.getAttribute('position').array);
    this.body = new Mesh(geometry, new MeshBasicMaterial({ color }));

    this.tail = new Mesh(
      new ConeGeometry(length * 0.3, length * 0.45, 4),
      new MeshBasicMaterial({ color: color.clone().multiplyScalar(0.82) }),
    );
    this.tail.rotation.z = Math.PI / 2;
    this.tail.position.x = -length * 0.62;

    const eye = new Mesh(
      new SphereGeometry(length * 0.09, 10, 8),
      new MeshBasicMaterial({ color: new Color('#f4ffff') }),
    );
    eye.position.set(length * 0.3, length * 0.1, length * 0.14);
    const pupil = new Mesh(
      new SphereGeometry(length * 0.045, 8, 6),
      new MeshBasicMaterial({ color: new Color(entry.body.outline) }),
    );
    pupil.position.set(length * 0.34, length * 0.1, length * 0.18);

    this.group.add(this.body, this.tail, eye, pupil);
  }

  setTint(color: number): void {
    (this.body.material as MeshBasicMaterial).color.setHex(color);
  }

  /** @param intensity 0..1 — насколько резко бьётся */
  update(dt: number, intensity: number): void {
    this.time += dt;
    const { wave, amp } = this.entry.body;
    const swing = amp * (0.5 + intensity * 1.8);

    const positions = this.body.geometry.getAttribute('position') as BufferAttribute;
    const array = positions.array as Float32Array;
    for (let i = 0; i < array.length; i += 3) {
      const bx = this.base[i] ?? 0;
      // Амплитуда растёт к хвосту: голова почти неподвижна.
      const along = Math.max(0, -bx);
      array[i + 2] =
        (this.base[i + 2] ?? 0) + Math.sin(this.time * 7 - along * wave) * swing * along;
    }
    positions.needsUpdate = true;

    this.tail.rotation.y = Math.sin(this.time * 7) * (0.4 + intensity * 0.6);
  }

  dispose(): void {
    this.group.traverse((node) => {
      if (node instanceof Mesh) {
        node.geometry.dispose();
        (node.material as MeshBasicMaterial).dispose();
      }
    });
  }
}
