import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial } from 'three';

/**
 * Волны: три синуса разной длины. Та же функция считает и высоту в шейдере,
 * и высоту на процессоре — иначе всплеск не попадал бы в поверхность.
 */
const WAVES = `
  float waveHeight(vec2 p, float t) {
    float h = sin(p.x * 0.26 + t * 1.3) * 0.13;
    h += sin(p.y * 0.34 - t * 1.05) * 0.1;
    h += sin((p.x + p.y) * 0.62 + t * 2.1) * 0.045;
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
  uniform vec3 uSun;
  uniform float uShoreZ;
  varying vec3 vWorld;
  varying float vHeight;
  ${WAVES}

  void main() {
    // Нормаль из производных той же функции волн: карта нормалей не нужна.
    float e = 0.5;
    float t = uTime;
    float hx = waveHeight(vWorld.xz + vec2(e, 0.0), t) - waveHeight(vWorld.xz - vec2(e, 0.0), t);
    float hz = waveHeight(vWorld.xz + vec2(0.0, e), t) - waveHeight(vWorld.xz - vec2(0.0, e), t);
    vec3 normal = normalize(vec3(-hx, 2.0 * e, -hz));

    vec3 view = normalize(uCamera - vWorld);
    float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 3.5);

    // Глубина: у берега вода светлая и мутная, дальше — тёмная.
    float depth = clamp((uShoreZ - vWorld.z) / 34.0, 0.0, 1.0);
    vec3 base = mix(uShallow, uDeep, depth);

    // Блик солнца плюс мелкая рябь бликов на гребнях — «стекло» без них.
    float spec = pow(max(dot(reflect(-uSun, normal), view), 0.0), 120.0);
    float glitter = pow(max(dot(reflect(-uSun, normal), view), 0.0), 18.0) * 0.18;

    // Пена: полоса прибоя у берега и белые гребни на волнах.
    float shore = 1.0 - smoothstep(0.0, 5.5, uShoreZ - vWorld.z);
    float crest = smoothstep(0.14, 0.23, vHeight);
    float foam = clamp(shore * 0.85 + crest * 0.4, 0.0, 1.0);

    vec3 color = mix(base, uFoam, fresnel * 0.4);
    color = mix(color, uFoam, foam * 0.75);
    color += spec * 1.4 + glitter;

    // У самого берега вода почти прозрачная — видно мокрый песок.
    float alpha = mix(0.42, 0.78, clamp(depth * 2.2, 0.0, 1.0));
    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * Поверхность воды: волны, глубинный градиент, полоса прибоя, блик солнца.
 *
 * Ни одной текстуры — всё считается в шейдере, поэтому вода не добавляет
 * к весу билда ничего. Полупрозрачная намеренно: сквозь неё видно крючок,
 * рыбу и мокрый песок у кромки.
 */
export class Water3D {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private time = 0;

  constructor(size = 700, segments = 190) {
    this.material = new ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms: {
        uTime: { value: 0 },
        uShallow: { value: new Color('#5f9fc4') },
        uDeep: { value: new Color('#1e3752') },
        uFoam: { value: new Color('#eef7fb') },
        uCamera: { value: [0, 0, 0] },
        uSun: { value: [0.5, 0.6, 0.62] },
        uShoreZ: { value: 0 },
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

  setPalette(shallow: string, deep: string, foam: string): void {
    (this.material.uniforms.uShallow?.value as Color).set(shallow);
    (this.material.uniforms.uDeep?.value as Color).set(deep);
    (this.material.uniforms.uFoam?.value as Color).set(foam);
  }

  /** Где начинается берег: по этому считаются прибой и глубина. */
  setShoreZ(z: number): void {
    if (this.material.uniforms.uShoreZ) this.material.uniforms.uShoreZ.value = z;
  }

  setSun(direction: { x: number; y: number; z: number }): void {
    const length = Math.hypot(direction.x, direction.y, direction.z) || 1;
    if (this.material.uniforms.uSun) {
      this.material.uniforms.uSun.value = [
        direction.x / length,
        direction.y / length,
        direction.z / length,
      ];
    }
  }

  update(dt: number, cameraPosition: { x: number; y: number; z: number }): void {
    this.time += dt;
    if (this.material.uniforms.uTime) this.material.uniforms.uTime.value = this.time;
    if (this.material.uniforms.uCamera) {
      this.material.uniforms.uCamera.value = [cameraPosition.x, cameraPosition.y, cameraPosition.z];
    }
  }

  /** Высота волны в точке — по ней всплёскивает крючок. */
  heightAt(x: number, z: number): number {
    const t = this.time;
    return (
      Math.sin(x * 0.26 + t * 1.3) * 0.13 +
      Math.sin(z * 0.34 - t * 1.05) * 0.1 +
      Math.sin((x + z) * 0.62 + t * 2.1) * 0.045
    );
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
