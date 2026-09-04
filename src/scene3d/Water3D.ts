import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial } from 'three';

/** Параметры волн: три синуса разной длины дают неповторяющийся рисунок. */
const WAVES = `
  float waveHeight(vec2 p, float t) {
    float h = sin(p.x * 0.09 + t * 1.1) * 0.16;
    h += sin(p.y * 0.13 - t * 0.9) * 0.12;
    h += sin((p.x + p.y) * 0.05 + t * 1.7) * 0.09;
    return h;
  }
`;

const VERTEX = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying float vHeight;
  ${WAVES}

  void main() {
    vec3 pos = position;
    float h = waveHeight(pos.xy, uTime);
    pos.z += h;
    vHeight = h;
    vec4 world = modelMatrix * vec4(pos, 1.0);
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  uniform vec3 uCamera;
  varying vec3 vWorld;
  varying float vHeight;
  ${WAVES}

  void main() {
    // Нормаль берём из производных той же функции волн: отдельная карта не нужна.
    float e = 0.6;
    float t = uTime;
    float hx = waveHeight(vWorld.xz + vec2(e, 0.0), t) - waveHeight(vWorld.xz - vec2(e, 0.0), t);
    float hz = waveHeight(vWorld.xz + vec2(0.0, e), t) - waveHeight(vWorld.xz - vec2(0.0, e), t);
    vec3 normal = normalize(vec3(-hx, 2.0 * e, -hz));

    vec3 view = normalize(uCamera - vWorld);
    float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 3.0);

    float distance = length(vWorld.xz - uCamera.xz);
    vec3 base = mix(uShallow, uDeep, clamp(distance / 160.0, 0.0, 1.0));

    // Блик солнца — узкий и яркий, иначе вода читается пластиком.
    vec3 sun = normalize(vec3(-0.4, 0.55, -0.72));
    float spec = pow(max(dot(reflect(-sun, normal), view), 0.0), 90.0);

    // Пена на гребнях: тонкая полоска по верхушкам волн.
    float foam = smoothstep(0.2, 0.29, vHeight);

    vec3 color = mix(base, uFoam, fresnel * 0.55);
    color = mix(color, uFoam, foam * 0.35);
    color += spec * 0.9;

    gl_FragColor = vec4(color, 0.82);
  }
`;

/**
 * Поверхность воды. Волны и нормали считаются одной функцией в шейдере:
 * ни текстур, ни карт нормалей — вес билда от воды не растёт вовсе.
 *
 * Полупрозрачная намеренно: игрок должен видеть крючок и рыбу под водой,
 * иначе бой в первом лице читается только по изгибу удилища.
 */
export class Water3D {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private time = 0;

  constructor(size = 1500, segments = 140) {
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uShallow: { value: new Color('#2fc6c0') },
        uDeep: { value: new Color('#0b4f86') },
        uFoam: { value: new Color('#e8fbff') },
        uCamera: { value: [0, 0, 0] },
      },
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });

    const geometry = new PlaneGeometry(size, size, segments, segments);
    this.mesh = new Mesh(geometry, this.material);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 10;
  }

  setPalette(shallow: string, deep: string): void {
    (this.material.uniforms.uShallow?.value as Color).set(shallow);
    (this.material.uniforms.uDeep?.value as Color).set(deep);
  }

  update(dt: number, cameraPosition: { x: number; y: number; z: number }): void {
    this.time += dt;
    if (this.material.uniforms.uTime) this.material.uniforms.uTime.value = this.time;
    if (this.material.uniforms.uCamera) {
      this.material.uniforms.uCamera.value = [cameraPosition.x, cameraPosition.y, cameraPosition.z];
    }
  }

  /** Высота волны в точке — по ней качается лодка и всплёскивает крючок. */
  heightAt(x: number, z: number): number {
    const t = this.time;
    return (
      Math.sin(x * 0.09 + t * 1.1) * 0.16 +
      Math.sin(z * 0.13 - t * 0.9) * 0.12 +
      Math.sin((x + z) * 0.05 + t * 1.7) * 0.09
    );
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
