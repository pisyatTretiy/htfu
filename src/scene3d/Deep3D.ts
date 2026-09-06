import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Mesh,
  MeshLambertMaterial,
  Mesh as ThreeMesh,
  PlaneGeometry,
  Points,
  PointsMaterial,
  ShaderMaterial,
  Group,
  type Vector3,
} from 'three';
import { UNITS_PER_M } from '../core/world';
import { Rng } from '../core/Rng';

/** Сколько лучей света падает от поверхности и как глубоко они достают. */
const SHAFTS = 5;
const SHAFT_HEIGHT = 30;
const SHAFT_WIDTH = 1.5;
/** Глубже этого лучей уже нет: свет туда не доходит. */
const SHAFT_FADE_M = 55;

/**
 * Луч света от поверхности: вертикальная плоскость, гаснущая книзу и по краям.
 *
 * Аддитивная, поэтому лучи складываются там, где пересекаются, и не темнят
 * воду там, где их нет. Без градиента в шейдере это была бы светлая плита.
 */
const SHAFT_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SHAFT_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    // Ярко у поверхности и гаснет книзу; к краям тоже, иначе видно, что это
    // прямоугольник. Координата uv.y растёт кверху — луч светится сверху.
    float down = pow(vUv.y, 1.6);
    float edge = smoothstep(0.0, 0.42, vUv.x) * smoothstep(1.0, 0.58, vUv.x);
    gl_FragColor = vec4(uColor, down * edge * uStrength);
  }
`;

/** Сторона куба со взвесью вокруг камеры, единиц мира. */
const SNOW_BOX = 26;
const SNOW_COUNT = 260;
/** Скорость подъёма взвеси: она оседает, но камера идёт вниз быстрее. */
const SNOW_RISE = 0.35;

/**
 * Толща воды: дно локации и взвесь в луче зрения.
 *
 * Пока камера стояла на причале, под водой не было ничего — и не требовалось.
 * Стоило опустить её за грузилом, как выяснилось: спуск идёт в пустой синей
 * заливке. Смотреть там не на что, а спуск — самая длинная доля заброса.
 *
 * Взвесь тут делает главную работу: она даёт движение и масштаб. Без неё
 * падение неотличимо от стояния на месте, потому что однородную заливку глаз
 * не за что зацепить.
 */
export class Deep3D {
  readonly group = new Group();

  private readonly snow: Points;
  private readonly snowMaterial: PointsMaterial;
  private readonly floor: Mesh;
  private readonly floorMaterial: MeshLambertMaterial;
  private readonly shafts: ThreeMesh[] = [];
  private readonly shaftHolders: Group[] = [];
  private readonly shaftOffsets: { x: number; z: number }[] = [];
  private readonly shaftMaterial: ShaderMaterial;
  private readonly rng = new Rng(4242);

  constructor() {
    const positions = new Float32Array(SNOW_COUNT * 3);
    for (let i = 0; i < SNOW_COUNT; i++) {
      positions[i * 3] = this.rng.range(-SNOW_BOX / 2, SNOW_BOX / 2);
      positions[i * 3 + 1] = this.rng.range(-SNOW_BOX / 2, SNOW_BOX / 2);
      positions[i * 3 + 2] = this.rng.range(-SNOW_BOX / 2, SNOW_BOX / 2);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));

    this.snowMaterial = new PointsMaterial({
      color: new Color('#cfe6f0'),
      size: 0.09,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    this.snow = new Points(geometry, this.snowMaterial);
    this.snow.frustumCulled = false;

    this.floorMaterial = new MeshLambertMaterial({ color: new Color('#6d6a58'), flatShading: true });
    this.floor = new Mesh(new PlaneGeometry(240, 240, 12, 12), this.floorMaterial);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.visible = false;

    this.shaftMaterial = new ShaderMaterial({
      vertexShader: SHAFT_VERTEX,
      fragmentShader: SHAFT_FRAGMENT,
      uniforms: {
        uColor: { value: new Color('#bfe4f2') },
        uStrength: { value: 0 },
      },
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      fog: false,
    });
    for (let i = 0; i < SHAFTS; i++) {
      const shaft = new ThreeMesh(
        new PlaneGeometry(SHAFT_WIDTH * this.rng.range(0.7, 1.6), SHAFT_HEIGHT),
        this.shaftMaterial,
      );
      // Верх луча упирается в поверхность, низ уходит в темноту.
      shaft.position.y = -SHAFT_HEIGHT / 2;
      shaft.renderOrder = 2;
      const holder = new Group();
      holder.add(shaft);
      holder.rotation.z = this.rng.range(-0.16, 0.16);
      // Смещение от камеры, а не место в мире: заброс уходит метров на двадцать
      // от начала координат, и лучи, расставленные по миру, оставались за
      // спиной. Держатся вокруг камеры — как и взвесь.
      // По кольцу, а не как попало: луч, оказавшийся в точке камеры, закрывает
      // собой весь кадр, а пять наложившихся друг на друга уводят картинку в
      // клиппинг — синий канал упирается в потолок, и тонмаппинг красит воду
      // розовым.
      const angle = (i / SHAFTS) * Math.PI * 2 + this.rng.range(-0.4, 0.4);
      const radius = this.rng.range(4.5, 9);
      this.shaftOffsets.push({ x: Math.cos(angle) * radius, z: Math.sin(angle) * radius });
      this.shafts.push(shaft);
      this.shaftHolders.push(holder);
      this.group.add(holder);
    }

    this.group.add(this.snow, this.floor);
  }

  /** Дно уходит на глубину локации, песок берётся из её палитры. */
  setZone(maxDepthMeters: number, sand: string): void {
    this.floor.position.y = -maxDepthMeters * UNITS_PER_M;
    this.floorMaterial.color.set(sand).multiplyScalar(0.72);
  }

  /**
   * @param dive насколько камера под водой, 0..1 — им же гасим всю толщу:
   * с причала ни взвеси, ни дна видеть не нужно.
   */
  update(dt: number, camera: Vector3, dive: number): void {
    const visible = dive > 0.02;
    this.snow.visible = visible;
    this.floor.visible = visible;
    for (const shaft of this.shafts) shaft.visible = visible;
    if (!visible) return;

    this.snowMaterial.opacity = 0.55 * dive;

    // Лучи гаснут с глубиной и всегда развёрнуты к камере: плоскость, увиденная
    // с ребра, исчезает, и половина лучей пропадала бы на ровном месте.
    const light = Math.max(0, 1 - Math.max(0, -camera.y) / (SHAFT_FADE_M * UNITS_PER_M));
    (this.shaftMaterial.uniforms.uStrength as { value: number }).value = 0.18 * dive * light;
    for (let i = 0; i < this.shaftHolders.length; i++) {
      const holder = this.shaftHolders[i];
      const offset = this.shaftOffsets[i];
      if (!holder || !offset) continue;
      holder.position.set(camera.x + offset.x, 0, camera.z + offset.z);
      holder.rotation.y = Math.atan2(-offset.x, -offset.z);
    }

    // Взвесь живёт в кубе вокруг камеры: вышедшая за грань возвращается с
    // противоположной. Так двести шестьдесят точек работают на любой глубине.
    const positions = this.snow.geometry.getAttribute('position') as Float32BufferAttribute;
    const array = positions.array as Float32Array;
    const half = SNOW_BOX / 2;
    for (let i = 1; i < array.length; i += 3) {
      const y = (array[i] ?? 0) + SNOW_RISE * dt;
      array[i] = y > camera.y + half ? y - SNOW_BOX : y;
    }
    for (let axis = 0; axis < 3; axis++) {
      const centre = axis === 0 ? camera.x : axis === 1 ? camera.y : camera.z;
      for (let i = axis; i < array.length; i += 3) {
        const value = array[i] ?? 0;
        if (value > centre + half) array[i] = value - SNOW_BOX;
        else if (value < centre - half) array[i] = value + SNOW_BOX;
      }
    }
    positions.needsUpdate = true;
  }

  dispose(): void {
    this.snow.geometry.dispose();
    this.snowMaterial.dispose();
    this.floor.geometry.dispose();
    this.floorMaterial.dispose();
    for (const shaft of this.shafts) shaft.geometry.dispose();
    this.shaftMaterial.dispose();
  }
}
