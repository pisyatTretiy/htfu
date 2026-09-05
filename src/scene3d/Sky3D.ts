import {
  BackSide,
  Color,
  Group,
  IcosahedronGeometry,
  Mesh,
  MeshLambertMaterial,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Texture,
} from 'three';
import { Rng } from '../core/Rng';

const VERTEX = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vWorld = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uMiddle;
  uniform vec3 uBottom;
  varying vec3 vWorld;

  void main() {
    float h = normalize(vWorld).y;
    // Две ступени вместо одной: горизонт должен быть светлее зенита резче,
    // чем даёт линейный градиент.
    vec3 color = mix(uBottom, uMiddle, smoothstep(-0.1, 0.28, h));
    color = mix(color, uTop, smoothstep(0.25, 0.85, h));
    gl_FragColor = vec4(color, 1.0);
  }
`;

/** Дневной цвет облака и его подсветка снизу. */
const CLOUD_DAY = new Color('#ffffff');
const CLOUD_GLOW = new Color('#b9d3e6');

/** Небесный купол. Градиент в шейдере — ни одной текстуры и ни одного байта веса. */
export class Sky3D {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly sun: Sprite;
  private readonly clouds = new Group();
  private readonly sunDistance: number;
  private readonly cloudMaterial: MeshLambertMaterial;
  /** Цвет зенита локации: в него уводятся облака, когда небо темнеет. */
  private readonly zenith = new Color('#2f8fd8');
  private darkness = 0;

  constructor(radius = 900) {
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTop: { value: new Color('#2f8fd8') },
        uMiddle: { value: new Color('#8fd6f2') },
        uBottom: { value: new Color('#dff4fb') },
      },
      side: BackSide,
      depthWrite: false,
      fog: false,
    });
    this.mesh = new Mesh(new SphereGeometry(radius, 24, 16), this.material);
    this.mesh.renderOrder = -1000;

    this.sun = new Sprite(new SpriteMaterial({ map: sunTexture(), depthWrite: false, fog: false }));
    this.sun.scale.setScalar(120);
    this.sunDistance = radius * 0.62;
    this.sun.position.set(-220, 190, -520);
    this.mesh.add(this.sun);

    // Облака — единственная деталь в верхней трети кадра. Без них небо
    // читается как пустая заливка, а с ними появляется масштаб и глубина.
    this.cloudMaterial = new MeshLambertMaterial({
      color: CLOUD_DAY.clone(),
      // Подсветка снизу: иначе теневая сторона облака чернеет и весь стиль
      // рассыпается — низкополигональному облаку нужна плоская светлая изнанка.
      emissive: CLOUD_GLOW.clone(),
      flatShading: true,
      // Туман работает на 260 метрах, облака стоят дальше: без выключения
      // они растворились бы в дымке целиком.
      fog: false,
    });
    this.buildClouds(radius * 0.55);
    this.mesh.add(this.clouds);
  }

  /**
   * Кучевые облака из низкополигональных комков.
   *
   * Каждое — три-шесть сплюснутых икосаэдров: та же грамматика формы, что у
   * камней и пальм на берегу, поэтому небо не выпадает из стиля.
   */
  private buildClouds(distance: number): void {
    const rng = new Rng(90210);
    for (let i = 0; i < 11; i++) {
      const cloud = new Group();
      const puffs = rng.int(3, 6);
      for (let p = 0; p < puffs; p++) {
        const puff = new Mesh(new IcosahedronGeometry(rng.range(11, 20), 0), this.cloudMaterial);
        puff.position.set(rng.range(-26, 26), rng.range(-4, 6), rng.range(-9, 9));
        puff.scale.set(1, rng.range(0.5, 0.72), 1);
        cloud.add(puff);
      }
      // Гуще над морем: игрок смотрит с причала вперёд, за спину он
      // оборачивается редко.
      const angle = rng.range(-1.5, 1.5) + (i % 3 === 0 ? Math.PI : 0);
      const radius = distance * rng.range(0.75, 1.15);
      cloud.position.set(
        Math.sin(angle) * radius,
        rng.range(55, 150),
        -Math.cos(angle) * radius,
      );
      // Крупнее, чем кажется правильным: на портретном экране облако
      // «нормального» размера превращается в белую крапину у верхней рамки.
      cloud.scale.setScalar(rng.range(1.6, 3.2));
      this.clouds.add(cloud);
    }
  }

  /**
   * Темнота локации: облака и солнце гаснут вместе с ней.
   *
   * Белые облака над чёрной водой разлома выглядели вырезанными из другой
   * игры — небо должно темнеть целиком, а не только у горизонта.
   */
  setDarkness(value: number): void {
    this.darkness = Math.max(0, Math.min(1, value));
    this.applyClouds();
    (this.sun.material as SpriteMaterial).opacity = 1 - this.darkness * 0.8;
    (this.sun.material as SpriteMaterial).transparent = true;
  }

  /**
   * Цвет облаков по темноте локации.
   *
   * Гасить их в серый было мало: свет сцены в разломе всё ещё силён, и серое
   * облако выходило из освещения обратно белым — над чёрной водой висели
   * облака из солнечной игры. Теперь цвет уводится в зенит локации, поэтому
   * облако принадлежит своему небу, а не общему.
   */
  private applyClouds(): void {
    const light = 1 - this.darkness * 0.9;
    this.cloudMaterial.color
      .copy(CLOUD_DAY)
      .lerp(this.zenith, this.darkness * 0.8)
      .multiplyScalar(light);
    this.cloudMaterial.emissive
      .copy(CLOUD_GLOW)
      .lerp(this.zenith, this.darkness * 0.8)
      .multiplyScalar(light * light);
  }

  /** Медленный дрейф: полный оборот примерно за двадцать минут. */
  update(dt: number): void {
    this.clouds.rotation.y += dt * 0.005;
  }

  /**
   * Поставить солнце по направлению света сцены. Источник правды один: иначе
   * блик на воде и тени уезжают в одну сторону, а нарисованное солнце светит
   * из другой — и картинка перестаёт читаться, хотя каждый кусок по
   * отдельности правильный.
   */
  setSun(direction: { x: number; y: number; z: number }): void {
    const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
    const scale = this.sunDistance / length;
    this.sun.position.set(direction.x * scale, direction.y * scale, direction.z * scale);
  }

  /** Палитра приходит из данных локации: небо меняется вместе с водой. */
  setPalette(colors: readonly string[]): void {
    const [bottom, middle, top] = colors;
    if (bottom) (this.material.uniforms.uBottom?.value as Color).set(bottom);
    if (middle) (this.material.uniforms.uMiddle?.value as Color).set(middle);
    if (top) {
      (this.material.uniforms.uTop?.value as Color).set(top);
      this.zenith.set(top);
    }
    this.applyClouds();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.cloudMaterial.dispose();
    this.clouds.traverse((node) => {
      if (node instanceof Mesh) node.geometry.dispose();
    });
  }
}

function sunTexture(size = 128): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d-контекст недоступен');

  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255,250,220,1)');
  grad.addColorStop(0.35, 'rgba(255,240,180,0.55)');
  grad.addColorStop(1, 'rgba(255,235,160,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const texture = new Texture(canvas);
  texture.needsUpdate = true;
  return texture;
}
