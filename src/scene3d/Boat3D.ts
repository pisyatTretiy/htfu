import {
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  TubeGeometry,
  Vector3,
} from 'three';

/** Где игрок держит удилище — в координатах камеры. */
const GRIP = new Vector3(0.34, -0.34, -0.42);
/**
 * Длина в координатах камеры, а не в метрах: удилище держат в руках, и на
 * экране оно должно уходить вверх-вперёд, а не перечёркивать кадр.
 */
const ROD_LENGTH = 1.5;

/**
 * Лодка и удилище от первого лица.
 *
 * Удилище прикреплено к камере: игрок держит его в руках, поэтому оно всегда
 * в кадре и поворачивается вместе со взглядом. Изгиб пересобирает трубку по
 * кривой — 24 сегмента, перестройка раз в кадр обходится дёшево.
 */
export class Boat3D {
  readonly hull = new Group();
  /** Крепится к камере, а не к сцене. */
  readonly rod = new Group();
  /** Вершинка удилища в координатах камеры. */
  readonly tipLocal = new Vector3();

  private rodMesh: Mesh;
  private readonly rodMaterial: MeshBasicMaterial;
  private bend = 0;

  constructor() {
    this.rodMaterial = new MeshBasicMaterial({ color: new Color('#3d1f10') });
    this.rodMesh = new Mesh(this.buildRodGeometry(0, new Vector3(0, 1, 0)), this.rodMaterial);
    this.rodMesh.frustumCulled = false;
    this.rod.add(this.rodMesh);

    this.buildHull();
  }

  private buildHull(): void {
    // Борта: две изогнутые пластины плюс нос. Геометрия своя, чтобы лодка
    // читалась силуэтом от первого лица и не съедала кадр.
    const side = (sign: number): Mesh => {
      const shape = new BufferGeometry();
      const points: number[] = [];
      const steps = 16;
      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const z = -2.6 + t * 5.2;
        const width = 1.05 * Math.cos((t - 0.5) * 2.1);
        points.push(sign * width, 0.35, z, sign * width * 0.82, -0.35, z);
      }
      const indices: number[] = [];
      for (let i = 0; i < steps; i++) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
      shape.setAttribute('position', new BufferAttribute(new Float32Array(points), 3));
      shape.setIndex(indices);
      shape.computeVertexNormals();
      return new Mesh(
        shape,
        new MeshBasicMaterial({ color: new Color('#f2884a'), side: DoubleSide }),
      );
    };

    const floor = new Mesh(
      new BufferGeometry(),
      new MeshBasicMaterial({ color: new Color('#8a4a22'), side: DoubleSide }),
    );
    const floorPoints: number[] = [];
    const floorIndices: number[] = [];
    const steps = 16;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const z = -2.6 + t * 5.2;
      const width = 0.86 * Math.cos((t - 0.5) * 2.1);
      floorPoints.push(-width, -0.35, z, width, -0.35, z);
    }
    for (let i = 0; i < steps; i++) {
      const a = i * 2;
      floorIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    floor.geometry.setAttribute(
      'position',
      new BufferAttribute(new Float32Array(floorPoints), 3),
    );
    floor.geometry.setIndex(floorIndices);

    this.hull.add(side(1), side(-1), floor);
  }

  /**
   * @param tension 0..1 — насколько согнуто удилище
   * @param pull направление на крючок в координатах камеры
   */
  update(tension: number, pull: Vector3): void {
    this.bend += (tension - this.bend) * 0.2;
    const geometry = this.buildRodGeometry(this.bend, pull);
    this.rodMesh.geometry.dispose();
    this.rodMesh.geometry = geometry;
  }

  private buildRodGeometry(bend: number, pull: Vector3): TubeGeometry {
    // Удилище в покое смотрит вперёд-вверх; под натяжением вершинка уходит
    // к крючку, а середина отстаёт — отсюда дуга, а не излом.
    const rest = new Vector3(0.12, 0.5, -0.86).normalize();
    const target = pull.clone().normalize();
    const direction = rest.clone().lerp(target, Math.min(1, bend) * 0.6).normalize();

    const tip = GRIP.clone().addScaledVector(direction, ROD_LENGTH);
    const middle = GRIP.clone()
      .addScaledVector(rest, ROD_LENGTH * 0.55)
      .lerp(tip.clone().multiplyScalar(0.5).add(GRIP.clone().multiplyScalar(0.5)), bend * 0.5);

    this.tipLocal.copy(tip);
    const curve = new CatmullRomCurve3([GRIP.clone(), middle, tip]);
    return new TubeGeometry(curve, 20, 0.016, 6, false);
  }

  dispose(): void {
    this.rodMesh.geometry.dispose();
    this.rodMaterial.dispose();
  }
}
