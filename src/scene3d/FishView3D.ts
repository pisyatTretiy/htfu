import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
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
  private readonly baseColor: Color;
  private readonly baseTailColor: Color;
  private time = 0;

  constructor(private readonly entry: CatchEntry) {
    const length = entry.body.length / 100;
    const color = new Color(entry.body.fill);

    // Угорь длиннее и тоньше рыбы: та же модель с другими пропорциями — иначе
    // на леске он выглядел зелёным колобком.
    const eel = entry.body.shape === 'eel';
    const geometry = new SphereGeometry(length * 0.5, 12, 8);
    geometry.scale(eel ? 1.9 : 1, eel ? 0.34 : 0.62, eel ? 0.3 : 0.44);
    taper(geometry, length * (eel ? 0.95 : 0.5));
    this.base = Float32Array.from(geometry.getAttribute('position').array);
    this.body = new Mesh(geometry, new MeshLambertMaterial({ color, flatShading: true }));

    const finColor = color.clone().multiplyScalar(0.82);
    const finMaterial = new MeshLambertMaterial({
      color: finColor,
      flatShading: true,
      // Плавник — одна плоскость: снизу он должен быть виден так же, как сверху.
      side: DoubleSide,
    });

    // Хвост — вилка из двух треугольников, а не конус: конус читается морковкой,
    // и рыба в профиль выглядела воздушным шариком с носиком.
    this.tail = new Mesh(
      finGeometry(length * (eel ? 0.3 : 0.42), length * (eel ? 0.2 : 0.38), !eel),
      finMaterial,
    );
    this.tail.position.x = -length * (eel ? 0.95 : 0.52);

    const dorsal = new Mesh(
      finGeometry(length * (eel ? 0.9 : 0.3), length * (eel ? 0.1 : 0.22), false),
      finMaterial,
    );
    dorsal.position.set(-length * (eel ? 0.3 : 0.04), length * (eel ? 0.15 : 0.28), 0);
    dorsal.rotation.z = -Math.PI / 2;

    const pectoral = new Mesh(finGeometry(length * 0.2, length * 0.14, false), finMaterial);
    pectoral.position.set(length * (eel ? 0.5 : 0.1), -length * 0.06, length * 0.1);
    pectoral.rotation.set(Math.PI / 2, 0, -0.5);

    const eye = new Mesh(
      new SphereGeometry(length * 0.09, 10, 8),
      new MeshLambertMaterial({ color: new Color('#f4ffff') }),
    );
    eye.position.set(length * (eel ? 0.82 : 0.3), length * 0.06, length * 0.1);
    const pupil = new Mesh(
      new SphereGeometry(length * 0.045, 8, 6),
      new MeshLambertMaterial({ color: new Color(entry.body.outline) }),
    );
    pupil.position.set(length * (eel ? 0.86 : 0.34), length * 0.06, length * 0.13);

    this.baseColor = color.clone();
    this.baseTailColor = color.clone().multiplyScalar(0.82);

    this.group.add(this.body, this.tail, dorsal, pectoral, eye, pupil);
    this.group.traverse((node) => {
      if (node instanceof Mesh) node.castShadow = true;
    });
  }

  setTint(color: number): void {
    (this.body.material as MeshLambertMaterial).color.setHex(color);
  }

  /**
   * Увести цвет в цвет воды. Рыбу под поверхностью видно сквозь толщу, и в
   * своей «витринной» окраске она читается лежащей на воде, а не плывущей
   * под ней. Считаем всегда от исходного цвета, чтобы повторный вызов при
   * смене локации не затемнял рыбу второй раз.
   */
  shade(color: Color, amount: number): void {
    const strength = Math.max(0, Math.min(1, amount));
    (this.body.material as MeshLambertMaterial).color.copy(this.baseColor).lerp(color, strength);
    (this.tail.material as MeshLambertMaterial).color
      .copy(this.baseTailColor)
      .lerp(color, strength);
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
        (node.material as MeshLambertMaterial).dispose();
      }
    });
  }
}

/**
 * Сужение тела к носу и особенно к хвосту.
 *
 * Эллипсоид без сужения читается яйцом: именно так улов и выглядел в кадре
 * показа, когда висел на леске в метре от лица.
 */
function taper(geometry: BufferGeometry, half: number): void {
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const t = Math.max(-1, Math.min(1, x / half));
    const k = 1 - 0.5 * t * t * (t < 0 ? 1.5 : 0.7);
    position.setY(i, position.getY(i) * k);
    position.setZ(i, position.getZ(i) * k);
  }
  geometry.computeVertexNormals();
}

/**
 * Плавник: треугольник в плоскости XY. Для хвоста — вилка с выемкой.
 * Толщины нет намеренно: в low-poly плавник и в жизни читается плоскостью.
 */
function finGeometry(length: number, height: number, forked: boolean): BufferGeometry {
  const geometry = new BufferGeometry();
  const points = forked
    ? [
        0, 0, 0, -length, height, 0, -length * 0.55, 0, 0,
        0, 0, 0, -length * 0.55, 0, 0, -length, -height, 0,
      ]
    : [0, 0, 0, -length, 0, 0, -length * 0.45, height, 0];
  geometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  geometry.computeVertexNormals();
  return geometry;
}