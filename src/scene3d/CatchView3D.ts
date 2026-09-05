import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { FISH_SHAPES, FishView3D } from './FishView3D';
import type { CatchEntry, CatchShape } from '../content/types';

/**
 * Модель улова.
 *
 * До сих пор всё, что попадало на крючок, рисовалось рыбой: краб, медуза,
 * морская звезда и даже сапог отличались друг от друга только цветом и
 * длиной. Форма приходит из данных вида (`body.shape`), а здесь по ней
 * собирается меш.
 *
 * Интерфейс общий с `FishView3D`, поэтому сцена не знает, что именно висит
 * на леске: рыба, краб или чужая удочка.
 */
export interface CatchView {
  readonly group: Group;
  setTint(color: number, strength?: number): void;
  shade(color: Color, amount: number): void;
  update(dt: number, intensity: number): void;
  dispose(): void;
}

export function createCatchView(entry: CatchEntry): CatchView {
  const shape: CatchShape = entry.body.shape ?? 'fish';
  if (FISH_SHAPES.has(shape)) return new FishView3D(entry);
  return new PropView(entry, shape);
}

/**
 * Всё, что не рыба: краб, медуза, головоногое, звезда и мусор.
 *
 * Собирается из примитивов и покачивается целиком — извив тела здесь не нужен
 * и выглядел бы странно у сапога.
 */
class PropView implements CatchView {
  readonly group = new Group();

  private readonly materials: MeshLambertMaterial[] = [];
  private readonly limbs: Group[] = [];
  private readonly baseColors: Color[] = [];
  private readonly tint = new Color(0xffffff);
  private time = 0;

  constructor(entry: CatchEntry, shape: CatchShape) {
    const size = entry.body.length / 100;
    const fill = new Color(entry.body.fill);
    const dark = new Color(entry.body.outline);

    const body = this.material(fill);
    const trim = this.material(fill.clone().multiplyScalar(0.78));
    const outline = this.material(dark);

    if (shape === 'crab') this.buildCrab(size, body, trim, outline);
    else if (shape === 'jelly') this.buildJelly(size, body, trim);
    else if (shape === 'squid') this.buildSquid(size, body, trim, outline);
    else if (shape === 'star') this.buildStar(size, body, outline);
    else if (shape === 'ring') this.buildRing(size, body, outline);
    else if (shape === 'can') this.buildCan(size, body, trim, outline);
    else this.buildJunk(size, entry.id, body, trim, outline);

    this.group.traverse((node) => {
      if (node instanceof Mesh) node.castShadow = true;
    });
  }

  private material(color: Color): MeshLambertMaterial {
    const material = new MeshLambertMaterial({ color: color.clone(), flatShading: true });
    this.materials.push(material);
    this.baseColors.push(color.clone());
    return material;
  }

  /** Краб: панцирь, клешни, ноги. Клешни щёлкают — это его характер. */
  private buildCrab(
    size: number,
    body: MeshLambertMaterial,
    trim: MeshLambertMaterial,
    outline: MeshLambertMaterial,
  ): void {
    const shell = new Mesh(new DodecahedronGeometry(size * 0.42, 0), body);
    shell.scale.set(1.2, 0.55, 1);
    this.group.add(shell);

    for (const side of [-1, 1]) {
      const arm = new Group();
      // Плечо — перемычка от панциря к клешне. Без него клешня висела в
      // воздухе на расстоянии в четверть краба.
      const upper = new Mesh(new BoxGeometry(size * 0.24, size * 0.08, size * 0.08), outline);
      upper.position.x = size * 0.12;
      const claw = new Mesh(new BoxGeometry(size * 0.26, size * 0.16, size * 0.15), trim);
      claw.position.x = size * 0.36;
      const jaw = new Mesh(new ConeGeometry(size * 0.1, size * 0.22, 4), trim);
      jaw.rotation.z = -Math.PI / 2;
      jaw.position.x = size * 0.55;
      arm.add(upper, claw, jaw);
      arm.position.set(size * 0.26, 0, side * size * 0.24);
      arm.rotation.y = side * -0.5;
      this.group.add(arm);
      this.limbs.push(arm);
    }

    // Ноги торчат поперёк, а не вдоль: вдоль они целиком прятались под
    // панцирем, и краб выглядел камнем с клешнями.
    for (let i = 0; i < 6; i++) {
      const leg = new Mesh(new BoxGeometry(size * 0.07, size * 0.05, size * 0.34), outline);
      const side = i < 3 ? 1 : -1;
      leg.position.set(size * (0.12 - (i % 3) * 0.2), -size * 0.04, side * size * 0.44);
      leg.rotation.set(side * 0.45, side * (0.25 - (i % 3) * 0.25), 0);
      this.group.add(leg);
    }
  }

  /** Медуза: купол и щупальца, всё колышется. */
  private buildJelly(size: number, body: MeshLambertMaterial, trim: MeshLambertMaterial): void {
    const dome = new Mesh(new SphereGeometry(size * 0.4, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), body);
    dome.scale.y = 0.9;
    this.group.add(dome);

    const rim = new Mesh(new TorusGeometry(size * 0.38, size * 0.05, 4, 10), trim);
    rim.rotation.x = Math.PI / 2;
    this.group.add(rim);

    for (let i = 0; i < 7; i++) {
      const tentacle = new Group();
      const strand = new Mesh(new BoxGeometry(size * 0.05, size * 0.6, size * 0.05), trim);
      strand.position.y = -size * 0.3;
      tentacle.add(strand);
      const angle = (i / 7) * Math.PI * 2;
      tentacle.position.set(Math.cos(angle) * size * 0.28, 0, Math.sin(angle) * size * 0.28);
      this.group.add(tentacle);
      this.limbs.push(tentacle);
    }
  }

  /** Головоногое: мантия конусом и восемь рук. */
  private buildSquid(
    size: number,
    body: MeshLambertMaterial,
    trim: MeshLambertMaterial,
    outline: MeshLambertMaterial,
  ): void {
    // Остриё мантии смотрит назад, к хвосту. С обратным поворотом конус
    // сходился к голове, и головоногое читалось комком без направления.
    const mantle = new Mesh(new ConeGeometry(size * 0.3, size * 0.8, 7), body);
    mantle.rotation.z = Math.PI / 2;
    mantle.position.x = -size * 0.2;
    this.group.add(mantle);

    const head = new Mesh(new SphereGeometry(size * 0.26, 9, 6), body);
    head.position.x = size * 0.24;
    this.group.add(head);

    // Глаз сидит на поверхности головы. Утопленный внутрь, он читался
    // пробоиной в мантии, а не глазом.
    for (const side of [-1, 1]) {
      const eye = new Mesh(new SphereGeometry(size * 0.08, 8, 6), outline);
      eye.position.set(size * 0.32, size * 0.08, side * size * 0.24);
      this.group.add(eye);
    }

    for (let i = 0; i < 8; i++) {
      // Две вложенные группы: внешняя разводит руку в сторону раз и навсегда,
      // внутренней шевелит update(). В одной группе поворот наружу стирался
      // анимацией на первом же кадре, все восемь рук ложились вдоль оси и
      // головоногое читалось комком.
      const socket = new Group();
      const arm = new Group();
      const strand = new Mesh(new BoxGeometry(size * 0.5, size * 0.06, size * 0.06), trim);
      strand.position.x = size * 0.25;
      arm.add(strand);
      socket.add(arm);

      const angle = (i / 8) * Math.PI * 2;
      socket.position.set(
        size * 0.34,
        Math.cos(angle) * size * 0.18,
        Math.sin(angle) * size * 0.18,
      );
      socket.rotation.set(0, -Math.sin(angle) * 0.7, Math.cos(angle) * 0.7);
      this.group.add(socket);
      this.limbs.push(arm);
    }
  }

  /** Морская звезда: пять лучей и ни одного плавника. */
  private buildStar(size: number, body: MeshLambertMaterial, outline: MeshLambertMaterial): void {
    const core = new Mesh(new CylinderGeometry(size * 0.16, size * 0.18, size * 0.1, 5), body);
    core.rotation.x = Math.PI / 2;
    this.group.add(core);

    for (let i = 0; i < 5; i++) {
      const ray = new Mesh(new ConeGeometry(size * 0.12, size * 0.42, 4), body);
      const angle = (i / 5) * Math.PI * 2;
      ray.position.set(Math.cos(angle) * size * 0.24, Math.sin(angle) * size * 0.24, 0);
      ray.rotation.z = angle - Math.PI / 2;
      this.group.add(ray);
    }

    const eye = new Mesh(new SphereGeometry(size * 0.05, 6, 5), outline);
    eye.position.z = size * 0.06;
    this.group.add(eye);

    // Лучи лежат в плоскости XY: показ улова крутит модель вокруг Z, и с этой
    // ориентацией звезда всегда обращена к игроку плашмя, а не ребром.
  }

  /**
   * Свёрток: сапог, ящик, зонт — всё, у чего нет своей узнаваемой формы.
   *
   * Пропорции разводятся по имени вида: двенадцать одинаковых комков выглядели
   * бы одной вещью, перекрашенной двенадцать раз.
   */
  private buildJunk(
    size: number,
    id: string,
    body: MeshLambertMaterial,
    trim: MeshLambertMaterial,
    outline: MeshLambertMaterial,
  ): void {
    const hash = [...id].reduce((sum, letter, index) => sum + letter.charCodeAt(0) * (index + 1), 0);
    const wide = 0.42 + ((hash % 7) / 7) * 0.34;
    const tall = 0.28 + ((hash % 5) / 5) * 0.36;
    const turn = ((hash % 11) / 11) * Math.PI;

    const bulk = new Mesh(new BoxGeometry(size * wide, size * tall, size * 0.4), body);
    bulk.rotation.set(0.2, turn, 0.1);
    const lump = new Mesh(new DodecahedronGeometry(size * 0.2, 0), trim);
    lump.position.set(size * 0.2, size * tall * 0.5, -size * 0.1);
    const spike = new Mesh(new CylinderGeometry(size * 0.05, size * 0.07, size * 0.5, 5), outline);
    spike.position.set(-size * 0.22, size * 0.12, size * 0.1);
    spike.rotation.set(0.3, 0, 0.9 + turn * 0.2);
    this.group.add(bulk, lump, spike);
  }

  /** Кольцо: покрышка, обод. */
  private buildRing(size: number, body: MeshLambertMaterial, outline: MeshLambertMaterial): void {
    const ring = new Mesh(new TorusGeometry(size * 0.34, size * 0.13, 5, 10), body);
    ring.rotation.set(0.5, 0.3, 0);
    const hub = new Mesh(new CylinderGeometry(size * 0.1, size * 0.1, size * 0.16, 6), outline);
    hub.rotation.set(Math.PI / 2 + 0.5, 0, 0.3);
    this.group.add(ring, hub);
  }

  /** Ёмкость: банка, бутылка, чайник. */
  private buildCan(
    size: number,
    body: MeshLambertMaterial,
    trim: MeshLambertMaterial,
    outline: MeshLambertMaterial,
  ): void {
    // Горлышко и пробка сидят на оси бутылки, а не рядом с ней: раньше их
    // ставили по своим координатам, горлышко оказывалось у донышка, и вся
    // ёмкость читалась комком.
    const tilt = 0.4;
    const axis = { x: -Math.sin(tilt), y: Math.cos(tilt) };
    const along = (distance: number, mesh: Mesh): Mesh => {
      mesh.position.set(axis.x * size * distance, axis.y * size * distance, 0);
      mesh.rotation.z = tilt;
      return mesh;
    };

    const barrel = along(
      0,
      new Mesh(new CylinderGeometry(size * 0.22, size * 0.25, size * 0.5, 8), body),
    );
    const neck = along(
      0.35,
      new Mesh(new CylinderGeometry(size * 0.08, size * 0.14, size * 0.2, 6), trim),
    );
    const cap = along(0.48, new Mesh(new DodecahedronGeometry(size * 0.09, 0), outline));
    this.group.add(barrel, neck, cap);
  }

  setTint(color: number, strength = 1): void {
    // Оттенок редкости ложится на весь предмет: у краба нет «тела», которое
    // можно подкрасить отдельно от клешней. И именно подмешивается: заменой
    // цвета краб и медуза становились одинаково белыми.
    this.tint.setHex(color);
    for (let i = 0; i < this.materials.length; i++) {
      const base = this.baseColors[i];
      const material = this.materials[i];
      if (base && material) material.color.copy(base).lerp(this.tint, strength);
    }
  }

  shade(color: Color, amount: number): void {
    const strength = Math.max(0, Math.min(1, amount));
    for (let i = 0; i < this.materials.length; i++) {
      const base = this.baseColors[i];
      const material = this.materials[i];
      if (base && material) material.color.copy(base).lerp(color, strength);
    }
  }

  update(dt: number, intensity: number): void {
    this.time += dt;
    const swing = 0.12 + intensity * 0.5;
    for (let i = 0; i < this.limbs.length; i++) {
      const limb = this.limbs[i];
      if (!limb) continue;
      limb.rotation.z = Math.sin(this.time * (3 + intensity * 5) + i) * swing;
    }
  }

  dispose(): void {
    for (const material of this.materials) material.dispose();
    this.group.traverse((node) => {
      if (node instanceof Mesh) node.geometry.dispose();
    });
  }
}
