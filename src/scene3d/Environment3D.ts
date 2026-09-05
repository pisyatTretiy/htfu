import {
  BufferGeometry,
  ConeGeometry,
  Color,
  CylinderGeometry,
  DodecahedronGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
} from 'three';
import { Rng } from '../core/Rng';
import type { Zone, ZoneDecorSet } from '../meta/Zones';

/**
 * Берег локации: песок, камни, пальмы, трава, сарай.
 *
 * Стиль — low-poly с плоским затенением: ни одной текстуры, вся форма читается
 * гранями и светом. Пропорции нарочито грубые, детали крупные — на мобильном
 * экране мелочь всё равно не видна, а полигоны стоят денег.
 */
export class Environment3D {
  readonly group = new Group();

  private readonly sand: Mesh;
  /** Общий берег: камни у прибоя и острова на горизонте. Есть везде. */
  private readonly props = new Group();
  /**
   * Материалы зелени: перекрашиваются вместе с локацией.
   *
   * Раньше нужные материалы искались по совпадению цвета — и после первой же
   * смены палитры совпадение переставало срабатывать, поэтому вторая локация
   * оставалась с зеленью первой.
   */
  private readonly foliage: MeshLambertMaterial[] = [];
  /** Наборы декора локаций. Строятся один раз, дальше только показываются. */
  private readonly sets: Record<ZoneDecorSet, Group> = {
    tropical: new Group(),
    wreck: new Group(),
    ice: new Group(),
    rift: new Group(),
  };

  constructor() {
    this.sand = new Mesh(
      shoreGeometry(),
      new MeshLambertMaterial({
        color: new Color('#e8d5a8'),
        flatShading: true,
        vertexColors: true,
      }),
    );
    this.sand.receiveShadow = true;
    this.group.add(this.sand, this.props);
    for (const set of Object.values(this.sets)) this.group.add(set);
    this.build();
    this.buildWreck();
    this.buildIce();
    this.buildRift();
    this.show('tropical');
  }

  private build(): void {
    const rng = new Rng(4242);

    // Пальмы растут на суше, по бокам и за спиной: кадр вперёд остаётся чистым.
    for (let i = 0; i < 14; i++) {
      // Часть пальм выносим вперёд и вбок: они должны входить в кадр по краям,
      // иначе игрок смотрит в пустое море.
      const front = i < 5;
      const x = front ? rng.range(5, 15) * (i % 2 === 0 ? 1 : -1) : rng.range(-26, 26);
      const z = front ? rng.range(-3, 5) : rng.range(8, 34);
      if (Math.abs(x) < 4.5 && z < 12) continue;
      const palm = this.palm(rng);
      palm.position.set(x, shoreHeight(z), z);
      palm.rotation.y = rng.range(0, Math.PI * 2);
      palm.scale.setScalar(rng.range(0.85, 1.4));
      this.sets.tropical.add(palm);
    }

    // Камни у кромки воды — граница между песком и морем.
    for (let i = 0; i < 16; i++) {
      const rock = new Mesh(
        new DodecahedronGeometry(rng.range(0.3, 1.0), 0),
        new MeshLambertMaterial({ color: new Color('#7d7468'), flatShading: true }),
      );
      // Камни лежат на кромке прибоя — там, где песок уходит под воду.
      const z = rng.range(-4, 2);
      rock.position.set(rng.range(-26, 26), shoreHeight(z) + rng.range(-0.1, 0.2), z);
      rock.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      rock.scale.y = rng.range(0.5, 0.9);
      rock.castShadow = true;
      rock.receiveShadow = true;
      this.props.add(rock);
    }

    // Пучки травы: скрещенные плоскости, самый дешёвый способ набить объём.
    const grassMaterial = new MeshLambertMaterial({ color: new Color('#5f9e42'), flatShading: true });
    this.foliage.push(grassMaterial);
    for (let i = 0; i < 110; i++) {
      const tuft = new Mesh(grassGeometry(rng), grassMaterial);
      const z = rng.range(1, 34);
      tuft.position.set(rng.range(-26, 26), shoreHeight(z), z);
      tuft.rotation.y = rng.range(0, Math.PI);
      tuft.castShadow = true;
      this.sets.tropical.add(tuft);
    }

    // Мыс слева по курсу: игрок смотрит с причала в море, и без него кадр
    // симметричен и пуст. Мыс даёт асимметрию и точку отсчёта расстояния.
    const cape = new Group();
    // Два слоя: песчаная отмель шире и ниже зелёной шапки, поэтому у воды
    // остаётся светлая кромка пляжа. Без неё мыс читался куском газона,
    // воткнутым в море.
    const capeBeach = new Mesh(
      new DodecahedronGeometry(7.6, 0),
      new MeshLambertMaterial({ color: new Color('#e2cda0'), flatShading: true }),
    );
    capeBeach.scale.set(2.5, 0.3, 1.8);
    capeBeach.position.y = -0.55;
    capeBeach.receiveShadow = true;
    cape.add(capeBeach);

    const capeRock = new Mesh(
      new DodecahedronGeometry(7, 0),
      new MeshLambertMaterial({ color: new Color('#6f8a5c'), flatShading: true }),
    );
    capeRock.scale.set(2.2, 0.5, 1.45);
    capeRock.position.y = 0.25;
    capeRock.castShadow = true;
    capeRock.receiveShadow = true;
    cape.add(capeRock);
    for (let i = 0; i < 5; i++) {
      const palm = this.palm(rng);
      palm.position.set(rng.range(-11, 8), 2.6, rng.range(-6, 6));
      palm.scale.setScalar(rng.range(0.8, 1.2));
      cape.add(palm);
    }
    // Ближе к оси взгляда, чем кажется нужным: в портретном кадре по
    // горизонтали видно всего около сорока градусов.
    cape.position.set(-13, -0.6, -40);
    cape.rotation.y = 0.4;
    cape.scale.setScalar(1.5);
    this.sets.tropical.add(cape);

    // Острова на горизонте: пустое море впереди читается как недоделанная
    // сцена, а архипелаг — это ещё и сеттинг игры.
    for (let i = 0; i < 4; i++) {
      const island = new Mesh(
        new DodecahedronGeometry(rng.range(6, 13), 0),
        new MeshLambertMaterial({ color: new Color('#5d7a5a'), flatShading: true }),
      );
      island.position.set(rng.range(-70, 70), rng.range(-4, -1), rng.range(-130, -70));
      island.scale.set(rng.range(1.4, 2.6), rng.range(0.35, 0.6), 1);
      island.rotation.y = rng.range(0, 3);
      // Зелёные острова — примета тропиков: во льдах и в разломе они выглядят
      // чужими, поэтому живут в наборе, а не в общем берегу.
      this.sets.tropical.add(island);
    }

    this.sets.tropical.add(this.shack());

    // Плавник у кромки: обломки лодки и брёвна там, где кончается причал.
    for (let i = 0; i < 7; i++) {
      const log = new Mesh(
        new CylinderGeometry(rng.range(0.12, 0.24), rng.range(0.1, 0.2), rng.range(1.2, 3), 5),
        new MeshLambertMaterial({ color: new Color('#8a7059'), flatShading: true }),
      );
      const z = rng.range(3, 16);
      log.position.set(rng.range(-16, 16), shoreHeight(z) + 0.1, z);
      log.rotation.set(Math.PI / 2, rng.range(0, Math.PI), rng.range(-0.3, 0.3));
      log.castShadow = true;
      this.sets.tropical.add(log);
    }
  }

  /** Показать набор локации, спрятав остальные. */
  private show(set: ZoneDecorSet): void {
    for (const [name, group] of Object.entries(this.sets)) {
      group.visible = name === set;
    }
  }

  /**
   * Затонувший корабль: остов, накренившийся в воде, и обломки вокруг.
   *
   * Локация обещана в дизайне как «мусор и зацепы»: без остова на горизонте
   * она отличалась бы от причала только оттенком воды.
   */
  private buildWreck(): void {
    const rng = new Rng(515);
    const rust = new MeshLambertMaterial({ color: new Color('#7a4b39'), flatShading: true });
    const deck = new MeshLambertMaterial({ color: new Color('#5c4638'), flatShading: true });

    const hull = new Group();
    const body = new Mesh(boxGeometry(26, 7, 9), rust);
    body.castShadow = true;
    const bow = new Mesh(new ConeGeometry(4.6, 9, 4), rust);
    bow.rotation.z = Math.PI / 2;
    bow.position.x = 16;
    const cabin = new Mesh(boxGeometry(7, 4, 6), deck);
    cabin.position.set(-4, 5, 0);
    const mast = new Mesh(new CylinderGeometry(0.4, 0.5, 16, 6), deck);
    mast.position.set(-2, 12, 0);
    hull.add(body, bow, cabin, mast);
    // Накренился и наполовину ушёл под воду: горизонт получает силуэт, по
    // которому локация узнаётся с первого кадра.
    hull.position.set(-16, -2.6, -52);
    hull.rotation.set(0.12, 0.7, 0.22);
    this.sets.wreck.add(hull);

    // Дальние остовы и скалы: горизонт локации не должен быть пустым.
    for (let i = 0; i < 3; i++) {
      const far = new Mesh(new DodecahedronGeometry(rng.range(7, 14), 0), deck);
      far.position.set(rng.range(-80, 80), rng.range(-5, -2), rng.range(-140, -80));
      far.scale.set(rng.range(1.4, 2.4), rng.range(0.3, 0.5), 1);
      this.sets.wreck.add(far);
    }

    for (let i = 0; i < 9; i++) {
      const debris = new Mesh(
        boxGeometry(rng.range(0.6, 1.8), rng.range(0.4, 1.1), rng.range(0.6, 1.6)),
        i % 2 === 0 ? rust : deck,
      );
      debris.position.set(rng.range(-30, 30), rng.range(-0.3, 0.2), rng.range(-45, -8));
      debris.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3));
      this.sets.wreck.add(debris);
    }
  }

  /** Ледяной пролив: торосы вместо пальм. */
  private buildIce(): void {
    const rng = new Rng(717);
    const ice = new MeshLambertMaterial({ color: new Color('#dff0f7'), flatShading: true });
    const shade = new MeshLambertMaterial({ color: new Color('#a8cfe0'), flatShading: true });

    for (let i = 0; i < 11; i++) {
      const berg = new Group();
      const size = rng.range(3, 11);
      const top = new Mesh(new ConeGeometry(size, size * rng.range(1, 1.8), 5), ice);
      top.position.y = size * 0.4;
      top.castShadow = true;
      const base = new Mesh(new DodecahedronGeometry(size * 0.9, 0), shade);
      base.scale.set(1.3, 0.35, 1.1);
      berg.add(base, top);
      const near = i < 4;
      berg.position.set(
        rng.range(-60, 60),
        -size * 0.25,
        near ? rng.range(-46, -22) : rng.range(-120, -50),
      );
      berg.rotation.y = rng.range(0, 3);
      this.sets.ice.add(berg);
    }
  }

  /** Глубоководный разлом: чёрные скалы из воды и ни одного дерева. */
  private buildRift(): void {
    const rng = new Rng(919);
    const stone = new MeshLambertMaterial({ color: new Color('#3b4148'), flatShading: true });
    const wet = new MeshLambertMaterial({ color: new Color('#2a3036'), flatShading: true });

    for (let i = 0; i < 13; i++) {
      const height = rng.range(6, 26);
      const spire = new Mesh(
        new ConeGeometry(rng.range(1.4, 4.5), height, 5),
        i % 3 === 0 ? wet : stone,
      );
      const near = i < 5;
      spire.position.set(
        rng.range(-55, 55),
        height * 0.35 - 2,
        near ? rng.range(-50, -26) : rng.range(-120, -55),
      );
      spire.rotation.set(rng.range(-0.1, 0.1), rng.range(0, 3), rng.range(-0.12, 0.12));
      spire.castShadow = true;
      this.sets.rift.add(spire);
    }
  }

  private palm(rng: Rng): Group {
    const palm = new Group();
    const height = rng.range(3.4, 5.2);

    const trunk = new Mesh(
      new CylinderGeometry(0.13, 0.22, height, 6, 3),
      new MeshLambertMaterial({ color: new Color('#6b4630'), flatShading: true }),
    );
    trunk.position.y = height / 2;
    // Наклон ствола: прямые пальмы выглядят декорацией, кривые — местом.
    trunk.rotation.z = rng.range(-0.16, 0.16);
    trunk.castShadow = true;
    palm.add(trunk);

    const leafMaterial = new MeshLambertMaterial({ color: new Color('#3f8f3a'), flatShading: true });
    this.foliage.push(leafMaterial);
    const leaves = rng.int(6, 8);
    for (let i = 0; i < leaves; i++) {
      const leaf = new Mesh(leafGeometry(rng), leafMaterial);
      leaf.position.y = height;
      leaf.rotation.y = (i / leaves) * Math.PI * 2 + rng.range(-0.2, 0.2);
      leaf.rotation.z = rng.range(-0.55, -0.2);
      leaf.castShadow = true;
      palm.add(leaf);
    }
    return palm;
  }

  private shack(): Group {
    const shack = new Group();
    const walls = new Mesh(
      boxGeometry(3.4, 2.3, 2.8),
      new MeshLambertMaterial({ color: new Color('#b08858'), flatShading: true }),
    );
    walls.position.y = 1.15;
    walls.castShadow = true;
    walls.receiveShadow = true;

    const roof = new Mesh(
      roofGeometry(3.9, 1.2, 3.2),
      new MeshLambertMaterial({ color: new Color('#8c5a3c'), flatShading: true }),
    );
    roof.position.y = 2.3;
    roof.castShadow = true;

    shack.add(walls, roof);
    // Ближе к оси взгляда: в портретном кадре по горизонтали видно около
    // сорока градусов, и на прежнем месте сарай в кадр не попадал вовсе.
    shack.position.set(-5.5, shoreHeight(19), 19);
    shack.rotation.y = 0.5;
    return shack;
  }

  /** Набор декора и палитра берега меняются вместе с локацией. */
  applyZone(zone: Zone): void {
    this.show(zone.decor.set);
    this.setPalette(zone.sand, zone.foliage);
  }

  private setPalette(sand: string, foliage: string): void {
    (this.sand.material as MeshLambertMaterial).color.set(sand);
    for (const material of this.foliage) material.color.set(foliage);
  }

  dispose(): void {
    this.group.traverse((node) => {
      if (node instanceof Mesh) node.geometry.dispose();
    });
  }
}

/**
 * Пляж. Море впереди (−Z), суша позади: у самой воды берег уходит под
 * поверхность, дальше поднимается. Игрок стоит на песке, а не по пояс в воде —
 * ради этого высота и считается явно.
 */
/**
 * Профиль берега. Пологий пляж у воды, дальше — дюны.
 *
 * Без дюн песок упирается в небо ровной линией, и весь берег читается
 * бесконечным столом: смотреть назад с причала было не на что.
 */
export function shoreHeight(z: number): number {
  const beach = Math.max(-0.8, (z + 1.5) * 0.1);
  const dunes = Math.max(0, z - 24) * 0.11;
  return Math.min(7, beach + dunes);
}

function shoreGeometry(): BufferGeometry {
  const geometry = new PlaneGeometry(90, 80, 40, 40);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, 28);
  const rng = new Rng(9);
  const position = geometry.getAttribute('position');
  const shades: number[] = [];

  for (let i = 0; i < position.count; i++) {
    const z = position.getZ(i);
    const x = position.getX(i);
    // Мелкие неровности и складки дюн: ровный песок читается столом.
    const fold = Math.sin(x * 0.14 + z * 0.05) * Math.max(0, z - 22) * 0.05;
    position.setY(i, shoreHeight(z) + fold + rng.range(-0.06, 0.06));

    // Мокрый песок у воды — множитель к цвету локации, а не второй меш:
    // отдельная полоса стоила бы ещё одного вызова отрисовки.
    const wet = 1 - Math.max(0, Math.min(1, (z - 0.5) / 5));
    // Склон дюны светлее подошвы: солнце светит со стороны моря, и без этого
    // весь песок за пляжем читается одним пятном.
    const shade = 1 - wet * 0.3 + fold * 0.09 + rng.range(-0.03, 0.03);
    shades.push(shade, shade, shade);
  }

  geometry.setAttribute('color', new Float32BufferAttribute(shades, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function grassGeometry(rng: Rng): BufferGeometry {
  const height = rng.range(0.35, 0.75);
  const width = rng.range(0.3, 0.6);
  const geometry = new BufferGeometry();
  const positions = [
    -width / 2, 0, 0, width / 2, 0, 0, 0, height, 0,
    0, 0, -width / 2, 0, 0, width / 2, 0, height, 0,
  ];
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function leafGeometry(rng: Rng): BufferGeometry {
  const length = rng.range(1.5, 2.4);
  const width = rng.range(0.35, 0.6);
  const geometry = new BufferGeometry();
  // Лист — вытянутый ромб: четыре треугольника, читается силуэтом.
  const positions = [
    0, 0, 0, length * 0.45, -0.15, -width, length, -0.7, 0,
    0, 0, 0, length, -0.7, 0, length * 0.45, -0.15, width,
  ];
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function boxGeometry(width: number, height: number, depth: number): BufferGeometry {
  const box = new BufferGeometry();
  const w = width / 2;
  const h = height / 2;
  const d = depth / 2;
  const corners = [
    [-w, -h, d], [w, -h, d], [w, h, d], [-w, h, d],
    [-w, -h, -d], [w, -h, -d], [w, h, -d], [-w, h, -d],
  ];
  const faces = [
    [0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7], [1, 5, 6, 2], [3, 2, 6, 7], [4, 5, 1, 0],
  ];
  const positions: number[] = [];
  for (const [a, b, c, dd] of faces) {
    const p = [corners[a as number], corners[b as number], corners[c as number], corners[dd as number]];
    positions.push(...(p[0] as number[]), ...(p[1] as number[]), ...(p[2] as number[]));
    positions.push(...(p[0] as number[]), ...(p[2] as number[]), ...(p[3] as number[]));
  }
  box.setAttribute('position', new Float32BufferAttribute(positions, 3));
  box.computeVertexNormals();
  return box;
}

function roofGeometry(width: number, height: number, depth: number): BufferGeometry {
  const geometry = new BufferGeometry();
  const w = width / 2;
  const d = depth / 2;
  const positions = [
    -w, 0, d, w, 0, d, 0, height, 0,
    w, 0, -d, -w, 0, -d, 0, height, 0,
    -w, 0, -d, -w, 0, d, 0, height, 0,
    w, 0, d, w, 0, -d, 0, height, 0,
  ];
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}
