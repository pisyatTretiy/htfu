import {
  Color,
  ConeGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshLambertMaterial,
  PlaneGeometry,
} from 'three';
import { Rng } from '../core/Rng';

interface Gull {
  pivot: Group;
  body: Group;
  wings: [Mesh, Mesh];
  speed: number;
  radius: number;
  height: number;
  flap: number;
}

/**
 * Чайки над бухтой.
 *
 * Единственное, что двигается в верхней половине кадра, пока игрок ждёт клёва.
 * Стоят они дёшево — три плоскости на птицу, — а пустое небо оживляют сильнее,
 * чем любая деталь на берегу.
 */
export class Birds3D {
  readonly group = new Group();
  private readonly gulls: Gull[] = [];
  private readonly material: MeshLambertMaterial;
  private time = 0;

  constructor(count = 5) {
    this.material = new MeshLambertMaterial({
      color: new Color('#f4f7fa'),
      emissive: new Color('#8fa6b8'),
      flatShading: true,
      // Крыло — одна плоскость: снизу она была бы невидимой, а игрок смотрит
      // на чаек именно снизу.
      side: DoubleSide,
    });

    const rng = new Rng(7717);
    for (let i = 0; i < count; i++) {
      const pivot = new Group();
      const body = new Group();

      const torso = new Mesh(new ConeGeometry(0.22, 1.5, 4), this.material);
      torso.rotation.z = Math.PI / 2;
      body.add(torso);

      const wings: [Mesh, Mesh] = [this.wing(-1), this.wing(1)];
      body.add(wings[0], wings[1]);

      pivot.add(body);
      pivot.rotation.y = rng.range(0, Math.PI * 2);
      this.group.add(pivot);

      this.gulls.push({
        pivot,
        body,
        wings,
        // Половина стаи кружит в другую сторону: одинаковый ход всех птиц
        // сразу выдаёт механику.
        speed: rng.range(0.1, 0.22) * (i % 2 === 0 ? 1 : -1),
        radius: rng.range(14, 34),
        height: rng.range(7, 17),
        flap: rng.range(2.4, 3.6),
      });
    }
    // Стая кружит над морем перед причалом, а не над головой игрока.
    this.group.position.set(-6, 0, -30);
    this.group.scale.setScalar(1.6);
  }

  private wing(side: number): Mesh {
    const wing = new Mesh(new PlaneGeometry(1.1, 0.9), this.material);
    wing.position.set(-0.1, 0, side * 0.55);
    wing.rotation.x = Math.PI / 2;
    return wing;
  }

  update(dt: number): void {
    this.time += dt;
    for (const gull of this.gulls) {
      gull.pivot.rotation.y += gull.speed * dt;
      gull.body.position.set(
        gull.radius,
        gull.height + Math.sin(this.time * 0.6 + gull.radius) * 1.4,
        0,
      );
      // Тело смотрит по касательной к кругу, крылья машут в противофазе.
      gull.body.rotation.y = gull.speed > 0 ? -Math.PI / 2 : Math.PI / 2;
      const beat = Math.sin(this.time * gull.flap + gull.radius) * 0.7;
      gull.wings[0].rotation.x = Math.PI / 2 + beat;
      gull.wings[1].rotation.x = Math.PI / 2 - beat;
    }
  }

  dispose(): void {
    this.material.dispose();
    this.group.traverse((node) => {
      if (node instanceof Mesh) node.geometry.dispose();
    });
  }
}
