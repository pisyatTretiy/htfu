import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
} from 'three';

/**
 * Сосед по причалу: сидит на краю, свесив ноги, и ловит своё.
 *
 * Он же лицо цепочки заданий — до этого скупщик существовал только строкой
 * в интерфейсе, и мир выглядел безлюдным: причал, снасти, ни одного человека.
 * Сидит, а не стоит, намеренно: стоящая фигура в полный рост закрывает море,
 * ради которого сцена и построена.
 */
export class Angler3D {
  readonly group = new Group();

  private readonly torso: Group;
  private readonly rod: Mesh;
  private readonly materials: MeshLambertMaterial[] = [];
  private time = 0;

  constructor() {
    const skin = this.material('#d9a077');
    const shirt = this.material('#c8503f');
    const jeans = this.material('#3f5f8a');
    const straw = this.material('#e0c176');
    const wood = this.material('#3a3f46');

    this.torso = new Group();

    const body = new Mesh(new BoxGeometry(0.42, 0.52, 0.3), shirt);
    body.position.y = 0.26;
    body.castShadow = true;
    this.torso.add(body);

    const head = new Mesh(new IcosahedronGeometry(0.15, 0), skin);
    head.position.y = 0.63;
    head.castShadow = true;
    this.torso.add(head);

    // Соломенная шляпа — единственная деталь, которая читается силуэтом
    // с десяти метров.
    const hat = new Mesh(new ConeGeometry(0.3, 0.16, 8), straw);
    hat.position.y = 0.75;
    hat.castShadow = true;
    const brim = new Mesh(new CylinderGeometry(0.3, 0.32, 0.03, 8), straw);
    brim.position.y = 0.7;
    this.torso.add(hat, brim);

    for (const side of [-1, 1]) {
      const arm = new Mesh(new BoxGeometry(0.11, 0.34, 0.11), shirt);
      arm.position.set(side * 0.26, 0.34, 0.06);
      arm.rotation.x = -0.7;
      arm.castShadow = true;
      this.torso.add(arm);
    }

    // Удочка в руках: наклонена над водой, как у игрока.
    this.rod = new Mesh(new CylinderGeometry(0.015, 0.025, 1.6, 5), wood);
    this.rod.position.set(0.2, 0.5, 0.5);
    this.rod.rotation.set(-1.15, 0, -0.2);
    this.rod.castShadow = true;
    this.torso.add(this.rod);

    this.group.add(this.torso);

    // Ноги свешены с настила: их видно с воды и они привязывают фигуру к краю.
    for (const side of [-1, 1]) {
      const leg = new Mesh(new BoxGeometry(0.13, 0.46, 0.15), jeans);
      leg.position.set(side * 0.12, -0.22, 0.16);
      leg.rotation.x = 0.25;
      leg.castShadow = true;
      this.group.add(leg);

      const boot = new Mesh(new BoxGeometry(0.15, 0.12, 0.22), wood);
      boot.position.set(side * 0.12, -0.46, 0.24);
      this.group.add(boot);
    }
  }

  private material(color: string): MeshLambertMaterial {
    const material = new MeshLambertMaterial({ color: new Color(color), flatShading: true });
    this.materials.push(material);
    return material;
  }

  /** Дыхание и редкая проверка снасти: неподвижная фигура читается манекеном. */
  update(dt: number): void {
    this.time += dt;
    this.torso.position.y = Math.sin(this.time * 1.1) * 0.012;
    this.torso.rotation.z = Math.sin(this.time * 0.7) * 0.02;
    // Раз в двенадцать секунд подсекает — коротко и заметно.
    const beat = (this.time % 12) / 12;
    const twitch = beat < 0.08 ? Math.sin(beat * 39.2) * 0.22 : 0;
    this.rod.rotation.x = -1.15 - twitch;
  }

  dispose(): void {
    for (const material of this.materials) material.dispose();
    this.group.traverse((node) => {
      if (node instanceof Mesh) node.geometry.dispose();
    });
  }
}
