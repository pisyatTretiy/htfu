import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import type { CatchEntry, CatchShape } from '../content/types';

/**
 * Модель улова. Пока это процедурная геометрия из примитивов — как и весь арт
 * до подключения художника: тело-эллипсоид, хвост-конус, крупный глаз.
 *
 * Изгиб тела делается смещением вершин по оси: скелет здесь избыточен, а на
 * рисованные модели с риггингом это меняется подменой класса (ADR-0004).
 */

/** Всё, что собирается из рыбьего тела: силуэт задаёт профиль ниже. */
export const FISH_SHAPES: ReadonlySet<CatchShape> = new Set<CatchShape>([
  'fish',
  'eel',
  'round',
  'flat',
  'needle',
  'puffer',
  'spiny',
  'lure',
  'jaws',
  'stilts',
]);

/** Одна плоскость: длина вдоль -X, высота вверх. */
interface Fin {
  x: number;
  y: number;
  length: number;
  height: number;
}

/**
 * Силуэт вида.
 *
 * Все числа — в долях длины особи. До появления профилей сорок видов из
 * пятидесяти двух были одним и тем же эллипсоидом: удильщик, бочкоглот и
 * рыба-ёж отличались от плотвы только цветом, и весь смысл глубоководной
 * локации пропадал.
 */
interface Profile {
  /** Масштаб сферы по осям. */
  body: [number, number, number];
  /** Полудлина, на которой считается сужение к носу и хвосту. */
  taper: number;
  tail: Fin & { forked: boolean };
  dorsal: Fin | null;
  pectoral: { x: number; y: number; z: number } | null;
  eye: { x: number; y: number; z: number; radius: number };
  /** Что дорисовать сверху: шипы, лучи, приманка, пасть, ноги. */
  extra?: (length: number, fin: MeshLambertMaterial, outline: Color) => Mesh[];
}

const PROFILES: Record<string, Profile> = {
  fish: {
    body: [1, 0.62, 0.44],
    taper: 0.5,
    tail: { x: -0.44, y: 0, length: 0.42, height: 0.38, forked: true },
    dorsal: { x: -0.02, y: 0.26, length: 0.3, height: 0.22 },
    pectoral: { x: 0.1, y: -0.06, z: 0.1 },
    eye: { x: 0.3, y: 0.06, z: 0.1, radius: 0.09 },
  },
  // Угорь длиннее и тоньше рыбы: иначе на леске он выглядел зелёным колобком.
  eel: {
    body: [1.9, 0.34, 0.3],
    taper: 0.95,
    tail: { x: -0.82, y: 0, length: 0.3, height: 0.2, forked: false },
    dorsal: { x: 0.35, y: 0.14, length: 0.95, height: 0.08 },
    pectoral: { x: 0.5, y: -0.06, z: 0.1 },
    eye: { x: 0.82, y: 0.06, z: 0.07, radius: 0.055 },
  },
  // Карась, губан: высокое тело блюдцем.
  round: {
    body: [0.82, 0.98, 0.5],
    taper: 0.41,
    tail: { x: -0.36, y: 0, length: 0.34, height: 0.34, forked: true },
    dorsal: { x: 0.06, y: 0.42, length: 0.38, height: 0.18 },
    pectoral: { x: 0.12, y: -0.1, z: 0.16 },
    eye: { x: 0.28, y: 0.12, z: 0.14, radius: 0.08 },
  },
  // Палтус, топорик: тело сплющено с боков в пластину.
  flat: {
    body: [1.15, 0.92, 0.16],
    taper: 0.55,
    tail: { x: -0.5, y: 0, length: 0.3, height: 0.36, forked: true },
    dorsal: { x: 0.14, y: 0.4, length: 0.52, height: 0.12 },
    pectoral: { x: 0.1, y: -0.08, z: 0.06 },
    eye: { x: 0.34, y: 0.14, z: 0.06, radius: 0.075 },
  },
  // Сарган, рыба-гадюка: игла с длинным носом.
  needle: {
    body: [1.6, 0.28, 0.27],
    taper: 0.8,
    tail: { x: -0.74, y: 0, length: 0.26, height: 0.24, forked: true },
    dorsal: { x: -0.18, y: 0.1, length: 0.3, height: 0.1 },
    pectoral: { x: 0.2, y: -0.04, z: 0.07 },
    eye: { x: 0.6, y: 0.05, z: 0.07, radius: 0.055 },
    extra: (length, fin) => {
      const beak = new Mesh(new ConeGeometry(length * 0.045, length * 0.34, 5), fin);
      beak.rotation.z = -Math.PI / 2;
      beak.position.x = length * 0.98;
      return [beak];
    },
  },
  // Рыба-ёж: шар в иглах.
  puffer: {
    body: [0.86, 0.86, 0.78],
    taper: 0.42,
    tail: { x: -0.36, y: 0, length: 0.2, height: 0.18, forked: true },
    dorsal: null,
    pectoral: { x: 0.16, y: -0.1, z: 0.24 },
    eye: { x: 0.3, y: 0.12, z: 0.22, radius: 0.1 },
    extra: (length, fin) => {
      const meshes: Mesh[] = [];
      const up = new Vector3(0, 1, 0);
      const direction = new Vector3();
      for (let i = 0; i < 16; i++) {
        // Точки по спирали золотого угла — иглы ложатся ровно, без полюсов.
        const y = 1 - ((i + 0.5) / 16) * 2;
        const radius = Math.sqrt(Math.max(0, 1 - y * y));
        const angle = i * 2.399963;
        direction.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius).normalize();

        const spike = new Mesh(new ConeGeometry(length * 0.035, length * 0.2, 4), fin);
        spike.quaternion.setFromUnitVectors(up, direction);
        spike.position.set(
          direction.x * length * 0.4,
          direction.y * length * 0.4,
          direction.z * length * 0.36,
        );
        meshes.push(spike);
      }
      return meshes;
    },
  },
  // Крылатка, скорпена: тело обычное, но всё в длинных лучах.
  spiny: {
    body: [1, 0.66, 0.4],
    taper: 0.48,
    tail: { x: -0.42, y: 0, length: 0.36, height: 0.34, forked: true },
    dorsal: null,
    pectoral: null,
    eye: { x: 0.3, y: 0.08, z: 0.1, radius: 0.09 },
    extra: (length, fin) => {
      const meshes: Mesh[] = [];
      for (let i = 0; i < 9; i++) {
        const along = i / 8;
        const spine = ray(fin, length * (0.52 - along * 0.16), length * 0.016);
        spine.position.set(length * (0.3 - along * 0.62), length * 0.26, 0);
        spine.rotation.z = (along - 0.35) * 1.3;
        meshes.push(spine);
      }
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const spine = ray(fin, length * 0.44, length * 0.015);
          spine.position.set(length * (0.16 - i * 0.16), -length * 0.06, side * length * 0.16);
          spine.rotation.set(side * -1.2, 0, 0.5 - i * 0.3);
          meshes.push(spine);
        }
      }
      return meshes;
    },
  },
  // Удильщик: голова, зубы и фонарь на стебле.
  lure: {
    body: [0.92, 0.82, 0.62],
    taper: 0.44,
    tail: { x: -0.4, y: 0, length: 0.24, height: 0.24, forked: true },
    dorsal: null,
    pectoral: { x: 0.1, y: -0.12, z: 0.2 },
    eye: { x: 0.3, y: 0.14, z: 0.2, radius: 0.09 },
    extra: (length, fin) => {
      const stalk = ray(fin, length * 0.5, length * 0.02);
      stalk.position.set(length * 0.22, length * 0.3, 0);
      stalk.rotation.z = -0.9;

      const glow = new Mesh(
        new SphereGeometry(length * 0.085, 8, 6),
        new MeshLambertMaterial({ color: new Color('#ffe9a8'), emissive: new Color('#c9a24b') }),
      );
      glow.position.set(length * 0.61, length * 0.61, 0);

      // Зубы идут по нижней кромке пасти и торчат вверх: спрятанные сбоку, они
      // не читались вовсе, а удильщик без зубов — просто круглая рыба.
      const enamel = new MeshLambertMaterial({ color: new Color('#f2f6f0'), flatShading: true });
      const meshes: Mesh[] = [stalk, glow];
      for (let i = 0; i < 7; i++) {
        const along = i / 6;
        const tooth = new Mesh(new ConeGeometry(length * 0.032, length * 0.15, 3), enamel);
        tooth.position.set(
          length * (0.36 - along * 0.28),
          length * (-0.14 - along * 0.09),
          length * 0.16,
        );
        tooth.rotation.z = 0.3 - along * 0.5;
        meshes.push(tooth);
      }
      return meshes;
    },
  },
  // Бочкоглот: пасть больше самой рыбы.
  jaws: {
    body: [1.05, 0.5, 0.42],
    taper: 0.52,
    tail: { x: -0.5, y: 0, length: 0.3, height: 0.2, forked: false },
    dorsal: null,
    pectoral: { x: 0, y: -0.06, z: 0.1 },
    eye: { x: 0.34, y: 0.1, z: 0.12, radius: 0.07 },
    extra: (length, _fin, outline) => {
      const maw = new Mesh(
        new ConeGeometry(length * 0.36, length * 0.52, 8, 1, true),
        new MeshLambertMaterial({ color: outline, flatShading: true, side: DoubleSide }),
      );
      maw.rotation.z = Math.PI / 2;
      maw.position.x = length * 0.38;
      return [maw];
    },
  },
  // Треногая рыба: стоит на трёх лучах и этим запоминается.
  stilts: {
    body: [1.1, 0.42, 0.34],
    taper: 0.55,
    tail: { x: -0.5, y: 0, length: 0.3, height: 0.26, forked: true },
    dorsal: { x: -0.1, y: 0.18, length: 0.26, height: 0.16 },
    pectoral: null,
    eye: { x: 0.4, y: 0.06, z: 0.09, radius: 0.06 },
    extra: (length, fin) => {
      const back = ray(fin, length * 0.72, length * 0.014);
      back.position.set(-length * 0.42, -length * 0.1, 0);
      back.rotation.z = Math.PI - 0.35;

      const legs: Mesh[] = [back];
      for (const side of [-1, 1]) {
        const leg = ray(fin, length * 0.66, length * 0.014);
        leg.position.set(length * 0.08, -length * 0.12, side * length * 0.1);
        leg.rotation.set(side * 0.35, 0, Math.PI + 0.15);
        legs.push(leg);
      }
      return legs;
    },
  },
};

export class FishView3D {
  readonly group = new Group();

  private readonly body: Mesh;
  private readonly tail: Mesh;
  private readonly base: Float32Array;
  private readonly baseColor: Color;
  private readonly baseTailColor: Color;
  private readonly tint = new Color(0xffffff);
  private time = 0;

  constructor(private readonly entry: CatchEntry) {
    const length = entry.body.length / 100;
    const color = new Color(entry.body.fill);
    const outline = new Color(entry.body.outline);
    const profile = PROFILES[entry.body.shape ?? 'fish'] ?? PROFILES.fish!;

    const geometry = new SphereGeometry(length * 0.5, 12, 8);
    geometry.scale(profile.body[0], profile.body[1], profile.body[2]);
    taper(geometry, length * profile.taper);
    this.base = Float32Array.from(geometry.getAttribute('position').array);
    this.body = new Mesh(geometry, new MeshLambertMaterial({ color, flatShading: true }));

    const finMaterial = new MeshLambertMaterial({
      color: color.clone().multiplyScalar(0.82),
      flatShading: true,
      // Плавник — одна плоскость: снизу он должен быть виден так же, как сверху.
      side: DoubleSide,
    });

    // Хвост — вилка из двух треугольников, а не конус: конус читается морковкой,
    // и рыба в профиль выглядела воздушным шариком с носиком. Хвост чуть заходит
    // на тело: поставленный ровно на кончик, он висел с просветом.
    this.tail = new Mesh(
      finGeometry(length * profile.tail.length, length * profile.tail.height, profile.tail.forked),
      finMaterial,
    );
    this.tail.position.set(length * profile.tail.x, length * profile.tail.y, 0);

    const parts: Mesh[] = [this.body, this.tail];

    // Спинной плавник лежит в той же плоскости, что и хвост: длина вдоль тела,
    // высота вверх. Поворот на четверть оборота ставил его на попа, и вместо
    // плавника у щуки со спины торчал шип в половину её длины.
    if (profile.dorsal) {
      const dorsal = new Mesh(
        finGeometry(length * profile.dorsal.length, length * profile.dorsal.height, false),
        finMaterial,
      );
      dorsal.position.set(length * profile.dorsal.x, length * profile.dorsal.y, 0);
      parts.push(dorsal);
    }

    if (profile.pectoral) {
      const pectoral = new Mesh(finGeometry(length * 0.2, length * 0.14, false), finMaterial);
      pectoral.position.set(
        length * profile.pectoral.x,
        length * profile.pectoral.y,
        length * profile.pectoral.z,
      );
      pectoral.rotation.set(Math.PI / 2, 0, -0.5);
      parts.push(pectoral);
    }

    // Зрачок выносим на поверхность белка, а не рядом с его центром: шар
    // радиусом в половину глаза, смещённый на треть радиуса, целиком помещался
    // внутри — и вся рыба в игре смотрела бельмом.
    const eyeRadius = length * profile.eye.radius;
    const eye = new Mesh(
      new SphereGeometry(eyeRadius, 10, 8),
      new MeshLambertMaterial({ color: new Color('#f4ffff') }),
    );
    eye.position.set(length * profile.eye.x, length * profile.eye.y, length * profile.eye.z);
    const pupil = new Mesh(
      new SphereGeometry(eyeRadius * 0.5, 8, 6),
      new MeshLambertMaterial({ color: outline }),
    );
    pupil.position.set(
      eye.position.x + eyeRadius * 0.3,
      eye.position.y,
      eye.position.z + eyeRadius * 0.72,
    );
    parts.push(eye, pupil);

    if (profile.extra) parts.push(...profile.extra(length, finMaterial, outline));

    this.baseColor = color.clone();
    this.baseTailColor = color.clone().multiplyScalar(0.82);

    this.group.add(...parts);
    this.group.traverse((node) => {
      if (node instanceof Mesh) node.castShadow = true;
    });
  }

  /**
   * Оттенок редкости.
   *
   * Подмешиваем к собственному цвету вида, а не заменяем его: обычный вариант
   * красится белым, и до этой правки **каждая обычная рыба висела на леске
   * белой** — окунь, плотва и краб выглядели одинаково. Сила подмеса приходит
   * из редкости: у обычного она ноль.
   */
  setTint(color: number, strength = 1): void {
    this.tint.setHex(color);
    (this.body.material as MeshLambertMaterial).color.copy(this.baseColor).lerp(this.tint, strength);
    (this.tail.material as MeshLambertMaterial).color
      .copy(this.baseTailColor)
      .lerp(this.tint, strength);
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

/**
 * Луч: тонкий конус, растущий из точки крепления вверх по +Y. Основание
 * сдвинуто в начало координат, поэтому поворот вращает луч вокруг места
 * крепления, а не вокруг его середины.
 */
function ray(material: MeshLambertMaterial, length: number, thickness: number): Mesh {
  const geometry = new CylinderGeometry(thickness * 0.6, thickness, length, 4);
  geometry.translate(0, length / 2, 0);
  return new Mesh(geometry, material);
}
