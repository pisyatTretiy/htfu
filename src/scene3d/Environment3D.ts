import {
  BufferGeometry,
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
  private readonly props = new Group();

  constructor() {
    this.sand = new Mesh(
      shoreGeometry(),
      new MeshLambertMaterial({ color: new Color('#e8d5a8'), flatShading: true }),
    );
    this.sand.receiveShadow = true;
    this.group.add(this.sand, this.props);
    this.build();
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
      this.props.add(palm);
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
    for (let i = 0; i < 110; i++) {
      const tuft = new Mesh(grassGeometry(rng), grassMaterial);
      const z = rng.range(1, 34);
      tuft.position.set(rng.range(-26, 26), shoreHeight(z), z);
      tuft.rotation.y = rng.range(0, Math.PI);
      tuft.castShadow = true;
      this.props.add(tuft);
    }

    // Мыс слева по курсу: игрок смотрит с причала в море, и без него кадр
    // симметричен и пуст. Мыс даёт асимметрию и точку отсчёта расстояния.
    const cape = new Group();
    const capeRock = new Mesh(
      new DodecahedronGeometry(7, 0),
      new MeshLambertMaterial({ color: new Color('#6e7a5e'), flatShading: true }),
    );
    capeRock.scale.set(2.4, 0.5, 1.6);
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
    this.props.add(cape);

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
      this.props.add(island);
    }

    this.props.add(this.shack());
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
    shack.position.set(-9.5, shoreHeight(13), 13);
    shack.rotation.y = 0.5;
    return shack;
  }

  /** Палитра берега меняется вместе с локацией. */
  setPalette(sand: string, foliage: string): void {
    (this.sand.material as MeshLambertMaterial).color.set(sand);
    this.props.traverse((node) => {
      if (node instanceof Mesh) {
        const material = node.material as MeshLambertMaterial;
        if (material.color.getHexString() === '5f9e42' || material.color.getHexString() === '3f8f3a') {
          material.color.set(foliage);
        }
      }
    });
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
export function shoreHeight(z: number): number {
  return Math.min(2.6, Math.max(-0.8, (z + 1.5) * 0.1));
}

function shoreGeometry(): BufferGeometry {
  const geometry = new PlaneGeometry(90, 80, 30, 30);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, 28);
  const rng = new Rng(9);
  const position = geometry.getAttribute('position');
  for (let i = 0; i < position.count; i++) {
    const z = position.getZ(i);
    // Мелкие неровности: ровный песок читается столом.
    position.setY(i, shoreHeight(z) + rng.range(-0.06, 0.06));
  }
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
