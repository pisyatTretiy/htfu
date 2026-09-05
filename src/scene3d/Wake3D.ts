import { AdditiveBlending, Color, Group, Mesh, MeshBasicMaterial, RingGeometry, Vector3 } from 'three';

interface Ripple {
  mesh: Mesh;
  life: number;
}

const RIPPLES = 6;
const RIPPLE_TIME = 1.1;

/**
 * След на воде там, где леска уходит под поверхность.
 *
 * Во время боя рыба — под водой, и всё, что видит игрок, это согнутое
 * удилище и шкала. Точка входа лески с расходящимися кругами возвращает бой
 * на поверхность: по ней видно, куда тянет рыба и насколько сильно.
 */
export class Wake3D {
  readonly group = new Group();

  private readonly marker: Mesh;
  private readonly ripples: Ripple[] = [];
  private readonly material: MeshBasicMaterial;
  private next = 0;
  private sinceRipple = 0;

  constructor() {
    this.material = new MeshBasicMaterial({
      color: new Color('#dff2fb'),
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      // Складываем со светом воды, а не перекрываем её: пена на солнце
      // именно светится, а не лежит белой наклейкой.
      blending: AdditiveBlending,
    });

    // Кольца крупные: с двух метров роста и десяти метров дистанции круг в
    // ладонь шириной на экране меньше пикселя.
    this.marker = new Mesh(new RingGeometry(0.28, 0.46, 18), this.material);
    this.marker.rotation.x = -Math.PI / 2;
    this.marker.visible = false;
    // Поверх воды: у неё renderOrder 10 и выключенная запись глубины.
    this.marker.renderOrder = 11;
    this.group.add(this.marker);

    for (let i = 0; i < RIPPLES; i++) {
      const mesh = new Mesh(new RingGeometry(0.3, 0.44, 18), this.material.clone());
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 11;
      this.group.add(mesh);
      this.ripples.push({ mesh, life: 0 });
    }
  }

  /**
   * @param point точка входа лески в воду
   * @param intensity 0..1 — насколько сильно рыба тянет прямо сейчас
   */
  show(point: Vector3, intensity: number): void {
    this.marker.visible = true;
    this.marker.position.copy(point);
    const pulse = 1 + intensity * 1.6;
    this.marker.scale.setScalar(pulse);
    (this.marker.material as MeshBasicMaterial).opacity = 0.5 + intensity * 0.45;

    // Чем сильнее рывок, тем чаще круги: спокойная рыба почти не тревожит воду.
    const period = 0.55 - intensity * 0.35;
    if (this.sinceRipple >= period) {
      this.sinceRipple = 0;
      this.spawn(point);
    }
  }

  hide(): void {
    this.marker.visible = false;
  }

  private spawn(point: Vector3): void {
    const ripple = this.ripples[this.next % this.ripples.length];
    this.next += 1;
    if (!ripple) return;
    ripple.life = RIPPLE_TIME;
    ripple.mesh.visible = true;
    ripple.mesh.position.copy(point);
    ripple.mesh.scale.setScalar(1);
  }

  update(dt: number): void {
    this.sinceRipple += dt;
    for (const ripple of this.ripples) {
      if (ripple.life <= 0) continue;
      ripple.life -= dt;
      if (ripple.life <= 0) {
        ripple.mesh.visible = false;
        continue;
      }
      const age = 1 - ripple.life / RIPPLE_TIME;
      ripple.mesh.scale.setScalar(1 + age * 7);
      (ripple.mesh.material as MeshBasicMaterial).opacity = 0.5 * (1 - age);
    }
  }

  dispose(): void {
    this.material.dispose();
    for (const ripple of this.ripples) {
      (ripple.mesh.material as MeshBasicMaterial).dispose();
      ripple.mesh.geometry.dispose();
    }
    this.marker.geometry.dispose();
  }
}
