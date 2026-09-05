import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  TorusGeometry,
} from 'three';
import { Rng } from '../core/Rng';

/**
 * Причал, уходящий в воду.
 *
 * Композиционно это главный объект кадра: он ведёт взгляд от игрока к морю и
 * даёт глубину сцене, которая иначе распадается на три горизонтальные полосы —
 * песок, вода, небо.
 */
export class Pier3D {
  readonly group = new Group();

  constructor(length = 16, width = 2.2) {
    // Дерево приглушённое: насыщенная охра тянет на себя весь кадр и спорит
    // с водой, ради которой сцена и построена.
    const wood = new MeshLambertMaterial({ color: new Color('#8a7059'), flatShading: true });
    const post = new MeshLambertMaterial({ color: new Color('#5f4c3c'), flatShading: true });
    const rng = new Rng(77);

    // Доски настила кладём поперёк: щели между ними читаются и на мобильном.
    const planks = Math.floor(length / 0.62);
    for (let i = 0; i < planks; i++) {
      const plank = new Mesh(new BoxGeometry(width, 0.11, 0.5), wood);
      plank.position.set(0, 0.62, -i * 0.62 - 0.4);
      plank.rotation.y = rng.range(-0.012, 0.012);
      plank.castShadow = true;
      plank.receiveShadow = true;
      this.group.add(plank);
    }

    // Продольные балки под настилом.
    for (const x of [-width / 2 + 0.2, width / 2 - 0.2]) {
      const beam = new Mesh(new BoxGeometry(0.16, 0.18, length), post);
      beam.position.set(x, 0.5, -length / 2 - 0.2);
      beam.castShadow = true;
      this.group.add(beam);
    }

    // Сваи уходят под воду через каждые три метра.
    for (let i = 0; i < Math.floor(length / 3) + 1; i++) {
      for (const x of [-width / 2 + 0.25, width / 2 - 0.25]) {
        const pile = new Mesh(new CylinderGeometry(0.13, 0.15, 3.4, 6), post);
        pile.position.set(x, -1.1, -i * 3 - 0.6);
        pile.castShadow = true;
        this.group.add(pile);
      }
    }

    this.clutter(wood, post);
  }

  /**
   * Снасти под ногами: ящик, ведро, кнехт с бухтой каната.
   *
   * Нижняя треть кадра — это голый настил, по которому взгляд проскакивает
   * к воде. Пара предметов даёт масштаб и говорит, что здесь кто-то ловит,
   * а не просто стоит помост.
   */
  private clutter(wood: MeshLambertMaterial, post: MeshLambertMaterial): void {
    const deck = 0.68;
    const rope = new MeshLambertMaterial({ color: new Color('#b9a077'), flatShading: true });
    const metal = new MeshLambertMaterial({ color: new Color('#7d8b93'), flatShading: true });

    const crate = new Mesh(new BoxGeometry(0.52, 0.44, 0.52), wood);
    crate.position.set(0.7, deck + 0.22, -13.2);
    crate.rotation.y = 0.34;
    crate.castShadow = true;
    crate.receiveShadow = true;

    const lid = new Mesh(new BoxGeometry(0.56, 0.06, 0.56), post);
    lid.position.set(0.7, deck + 0.47, -13.2);
    lid.rotation.y = 0.34;
    lid.castShadow = true;

    const bucket = new Mesh(new CylinderGeometry(0.17, 0.13, 0.34, 8), metal);
    bucket.position.set(-0.68, deck + 0.17, -13.9);
    bucket.castShadow = true;

    const handle = new Mesh(new TorusGeometry(0.17, 0.018, 4, 10, Math.PI), metal);
    handle.position.set(-0.68, deck + 0.33, -13.9);
    handle.rotation.y = Math.PI / 2;

    const bollard = new Mesh(new CylinderGeometry(0.11, 0.13, 0.46, 7), post);
    bollard.position.set(-0.74, deck + 0.23, -15.4);
    bollard.castShadow = true;

    const coil = new Mesh(new TorusGeometry(0.22, 0.05, 4, 12), rope);
    coil.position.set(-0.74, deck + 0.05, -15.4);
    coil.rotation.x = Math.PI / 2;
    coil.castShadow = true;

    this.group.add(crate, lid, bucket, handle, bollard, coil);
  }

  dispose(): void {
    this.group.traverse((node) => {
      if (node instanceof Mesh) node.geometry.dispose();
    });
  }
}
