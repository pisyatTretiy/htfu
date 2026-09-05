import {
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';

/** Где рукоять удилища в координатах камеры. */
/**
 * Рукоять держим дальше от камеры, чем кажется нужным: на расстоянии 0.4
 * кисть размером 15 см занимает половину портретного кадра.
 */
const GRIP = new Vector3(0.16, -0.34, -0.95);
const ROD_LENGTH = 2.2;

/**
 * Руки с удилищем от первого лица.
 *
 * Всё крепится к камере: игрок держит снасть, поэтому она всегда в кадре и
 * поворачивается вместе со взглядом. Кисти — грубые призмы: в low-poly пальцы
 * читаются гранями, а не количеством полигонов.
 */
export class Hands3D {
  readonly group = new Group();
  /** Вершинка удилища в координатах камеры — к ней крепится леска. */
  readonly tipLocal = new Vector3();

  private rodMesh: Mesh;
  private readonly rodMaterial: MeshLambertMaterial;
  private bend = 0;

  // Переиспользуемые векторы и память о прошлом кадре: геометрия удилища
  // пересобирается только когда изгиб или направление на крючок реально
  // изменились. Раньше тюб на сто с лишним вершин строился каждый кадр —
  // шестьдесят раз в секунду в том числе на неподвижной сцене.
  private readonly restDir = new Vector3(0.1, 0.46, -0.88).normalize();
  private readonly dir = new Vector3();
  private readonly tip = new Vector3();
  private readonly middle = new Vector3();
  private readonly halfway = new Vector3();
  private readonly lastPull = new Vector3(0, 0, -1);
  private lastBend = -1;

  constructor() {
    this.rodMaterial = new MeshLambertMaterial({ color: new Color('#23262b'), flatShading: true });
    this.rodMesh = new Mesh(this.buildRod(0, new Vector3(0, 1, 0)), this.rodMaterial);
    this.rodMesh.frustumCulled = false;
    this.group.add(this.rodMesh);

    // Кистей в кадре нет намеренно. В оригинале формат ландшафтный, и руки
    // занимают угол; в портрете при том же расстоянии до камеры они съедают
    // половину экрана, а отодвинуть их — значит оторвать от рукояти.
    // Читаемости хватает удилища с катушкой.

    // Катушка: цилиндр плюс кольцо-ручка. Синий акцент, как у настоящей снасти.
    const reel = new Group();
    const body = new Mesh(
      new CylinderGeometry(0.048, 0.048, 0.08, 8),
      new MeshLambertMaterial({ color: new Color('#3f6f9e'), flatShading: true }),
    );
    body.rotation.z = Math.PI / 2;
    const ring = new Mesh(
      new TorusGeometry(0.066, 0.011, 5, 10),
      new MeshLambertMaterial({ color: new Color('#2a2f36'), flatShading: true }),
    );
    ring.rotation.y = Math.PI / 2;
    reel.add(body, ring);
    reel.position.copy(GRIP).add(new Vector3(-0.02, -0.085, 0.04));

    // Пробковая рукоять: без неё удилище — чёрная палка через весь кадр,
    // а тёплое пятно у нижней рамки сразу читается как «в руках снасть».
    const rest = new Vector3(0.1, 0.46, -0.88).normalize();
    const grip = new Mesh(
      new CylinderGeometry(0.032, 0.028, 0.34, 8),
      new MeshLambertMaterial({ color: new Color('#c39a63'), flatShading: true }),
    );
    grip.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), rest);
    grip.position.copy(GRIP).addScaledVector(rest, 0.14);

    const butt = new Mesh(
      new CylinderGeometry(0.036, 0.036, 0.07, 8),
      new MeshLambertMaterial({ color: new Color('#2a2f36'), flatShading: true }),
    );
    butt.quaternion.copy(grip.quaternion);
    butt.position.copy(GRIP).addScaledVector(rest, -0.05);

    this.group.add(reel, grip, butt);
    for (const node of this.group.children) node.frustumCulled = false;
  }

  /**
   * @param tension 0..1 — насколько согнуто удилище
   * @param pull направление на крючок в координатах камеры
   */
  update(tension: number, pull: Vector3): void {
    this.bend += (tension - this.bend) * 0.2;

    const still =
      Math.abs(this.bend - this.lastBend) < 0.004 &&
      this.lastPull.distanceToSquared(pull) < 0.0004;
    if (still) return;

    this.lastBend = this.bend;
    this.lastPull.copy(pull);

    const geometry = this.buildRod(this.bend, pull);
    this.rodMesh.geometry.dispose();
    this.rodMesh.geometry = geometry;
  }

  private buildRod(bend: number, pull: Vector3): TubeGeometry {
    // В покое удилище смотрит вперёд-вверх; под натяжением вершинка уходит
    // к крючку, а середина отстаёт — отсюда дуга, а не излом.
    this.dir.copy(pull).normalize();
    this.dir.lerpVectors(this.restDir, this.dir, Math.min(1, bend) * 0.55).normalize();

    this.tip.copy(GRIP).addScaledVector(this.dir, ROD_LENGTH);
    this.halfway.copy(GRIP).add(this.tip).multiplyScalar(0.5);
    this.middle
      .copy(GRIP)
      .addScaledVector(this.restDir, ROD_LENGTH * 0.5)
      .lerp(this.halfway, bend * 0.45);

    this.tipLocal.copy(this.tip);
    const curve = new CatmullRomCurve3([GRIP.clone(), this.middle.clone(), this.tip.clone()]);
    return new TubeGeometry(curve, 18, 0.014, 5, false);
  }

  dispose(): void {
    this.rodMesh.geometry.dispose();
    this.rodMaterial.dispose();
  }
}
