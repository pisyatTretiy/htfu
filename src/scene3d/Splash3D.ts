import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshLambertMaterial,
  RingGeometry,
  Vector3,
} from 'three';

interface Shard {
  mesh: Mesh;
  velocity: Vector3;
  spin: Vector3;
  life: number;
}

const SHARDS = 20;
const GRAVITY = 9.8;

/**
 * Всплеск при входе крючка в воду и при выходе рыбы на поверхность.
 *
 * Осколки — маленькие кубики, а не спрайты: в low-poly гранёные брызги
 * выглядят уместнее круглых точек, и текстура для них не нужна.
 */
export class Splash3D {
  readonly group = new Group();

  private readonly shards: Shard[] = [];
  private readonly ring: Mesh;
  private ringLife = 0;

  constructor() {
    const material = new MeshLambertMaterial({
      color: new Color('#eaf6fb'),
      flatShading: true,
      transparent: true,
      opacity: 0.9,
    });

    for (let i = 0; i < SHARDS; i++) {
      const size = 0.05 + Math.random() * 0.07;
      const mesh = new Mesh(new BoxGeometry(size, size, size), material);
      mesh.visible = false;
      mesh.castShadow = true;
      this.group.add(mesh);
      this.shards.push({
        mesh,
        velocity: new Vector3(),
        spin: new Vector3(),
        life: 0,
      });
    }

    // Кольцо на воде: расходится от точки входа и гаснет.
    this.ring = new Mesh(
      new RingGeometry(0.14, 0.2, 18),
      new MeshLambertMaterial({
        color: new Color('#f2fbff'),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.renderOrder = 12;
    this.ring.visible = false;
    this.group.add(this.ring);
  }

  /** @param force 0..1 — от лёгкого всплеска до удара крупной рыбы */
  burst(at: Vector3, force = 1): void {
    const count = Math.max(6, Math.round(SHARDS * force));
    for (let i = 0; i < this.shards.length; i++) {
      const shard = this.shards[i];
      if (!shard) continue;
      if (i >= count) {
        shard.mesh.visible = false;
        shard.life = 0;
        continue;
      }

      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const speed = (1.6 + Math.random() * 2.6) * (0.6 + force * 0.8);
      shard.mesh.position.copy(at);
      shard.mesh.visible = true;
      shard.velocity.set(
        Math.cos(angle) * speed * 0.55,
        speed * (0.9 + Math.random() * 0.7),
        Math.sin(angle) * speed * 0.55,
      );
      shard.spin.set(Math.random() * 8, Math.random() * 8, Math.random() * 8);
      shard.life = 0.5 + Math.random() * 0.45;
    }

    this.ring.position.set(at.x, 0.02, at.z);
    this.ring.scale.setScalar(1);
    this.ring.visible = true;
    this.ringLife = 0.7;
  }

  update(dt: number): void {
    for (const shard of this.shards) {
      if (shard.life <= 0) continue;

      shard.life -= dt;
      if (shard.life <= 0) {
        shard.mesh.visible = false;
        continue;
      }

      shard.velocity.y -= GRAVITY * dt;
      shard.mesh.position.addScaledVector(shard.velocity, dt);
      shard.mesh.rotation.x += shard.spin.x * dt;
      shard.mesh.rotation.y += shard.spin.y * dt;
      shard.mesh.rotation.z += shard.spin.z * dt;

      // Ушёл под воду — гаснет, а не тонет камнем.
      if (shard.mesh.position.y < -0.1) {
        shard.mesh.visible = false;
        shard.life = 0;
      }
    }

    if (this.ringLife > 0) {
      this.ringLife -= dt;
      const t = Math.max(0, this.ringLife / 0.7);
      this.ring.scale.setScalar(1 + (1 - t) * 5);
      (this.ring.material as MeshLambertMaterial).opacity = t * 0.65;
      this.ring.visible = this.ringLife > 0;
    }
  }

  dispose(): void {
    for (const shard of this.shards) shard.mesh.geometry.dispose();
    this.ring.geometry.dispose();
  }
}
