import { Color, DoubleSide, Mesh, PlaneGeometry, ShaderMaterial } from 'three';

/**
 * Волны в два слоя.
 *
 * `waveHeight` — длинная зыбь, её и гнёт геометрия. Та же функция считает
 * высоту на процессоре, иначе поплавок висел бы над поверхностью.
 *
 * `rippleHeight` — мелкая рябь. Она живёт только во фрагментном шейдере: с
 * причала игрок видит воду в пределах двух-трёх десятков единиц, а длина
 * волны зыби — тридцать, то есть в кадр помещается ровно один горб. Море и
 * выглядело крашеной плоскостью. Гнуть под рябь геометрию нельзя: чтобы
 * поймать волну в пять единиц, сетке нужен шаг в единицу — это сто тысяч
 * четырёхугольников вместо тридцати шести тысяч.
 */
const WAVES = `
  float waveHeight(vec2 p, float t) {
    float h = sin(p.x * 0.21 + t * 1.15) * 0.17;
    h += sin(p.y * 0.27 - t * 0.95) * 0.11;
    h += sin((p.x + p.y) * 0.55 + t * 1.85) * 0.06;
    return h;
  }

  // Высота и наклон одним заходом: x — высота, yz — производные по x и z.
  // Считать наклон разностями стоило бы четырёх лишних вызовов (тридцать
  // синусов на пиксель), а производная синуса известна заранее.
  vec3 surfaceField(vec2 p, float t, float detail) {
    float a1 = p.x * 0.21 + t * 1.15;
    float a2 = p.y * 0.27 - t * 0.95;
    float a3 = (p.x + p.y) * 0.55 + t * 1.85;
    float h = sin(a1) * 0.17 + sin(a2) * 0.11 + sin(a3) * 0.06;
    float dx = cos(a1) * 0.0357 + cos(a3) * 0.033;
    float dy = cos(a2) * 0.0297 + cos(a3) * 0.033;

    // Мелкая рябь: полтора-три метра длины волны. Именно она делает воду
    // водой — зыбь длиной в тридцать метров в кадр помещается один раз.
    // С расстоянием рябь гаснет: за полсотни метров она мельче пикселя и
    // превращается в муар.
    float b1 = p.x * 1.9 + p.y * 0.8 + t * 2.4;
    float b2 = p.x * 0.95 - p.y * 2.3 + t * 1.9;
    float b3 = (p.x + p.y) * 3.6 - t * 3.4;
    h += (sin(b1) * 0.045 + sin(b2) * 0.035 + sin(b3) * 0.018) * detail;
    dx += (cos(b1) * 0.0855 + cos(b2) * 0.0333 + cos(b3) * 0.0648) * detail;
    dy += (cos(b1) * 0.036 - cos(b2) * 0.0805 + cos(b3) * 0.0648) * detail;
    return vec3(h, dx, dy);
  }
`;

const VERTEX = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying float vHeight;
  ${WAVES}

  void main() {
    // Считаем волну в мировых координатах, а не в координатах плоскости.
    // Плоскость повёрнута на -90° вокруг X, поэтому её локальный y — это
    // мировой -z: считая высоту «как есть», вершины гуляли по одной функции,
    // а нормали и всплеск в шейдере — по зеркальной. Гребни и блики жили
    // каждый своей жизнью, и вода выглядела крашеной плоскостью.
    vec4 world = modelMatrix * vec4(position, 1.0);
    float h = waveHeight(world.xz, uTime);
    world.y += h;
    vHeight = h;
    vWorld = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uShallow;
  uniform vec3 uDeep;
  uniform vec3 uFoam;
  uniform vec3 uHorizon;
  uniform vec3 uCamera;
  uniform vec3 uSun;
  uniform float uShoreZ;
  varying vec3 vWorld;
  varying float vHeight;
  ${WAVES}

  void main() {
    // Нормаль из производных той же функции волн: карта нормалей не нужна.
    float t = uTime;
    float dist = length(vWorld.xz - uCamera.xz);
    float detail = 1.0 - smoothstep(12.0, 50.0, dist);
    vec3 field = surfaceField(vWorld.xz, t, detail);
    float height = field.x;
    vec3 normal = normalize(vec3(-field.y, 1.0, -field.z));

    vec3 view = normalize(uCamera - vWorld);
    float fresnel = pow(1.0 - max(dot(normal, view), 0.0), 3.5);

    // Глубина: у берега вода светлая и мутная, дальше — тёмная.
    float depth = clamp((uShoreZ - vWorld.z) / 46.0, 0.0, 1.0);
    vec3 base = mix(uShallow, uDeep, depth);

    // Блик солнца плюс мелкая рябь бликов на гребнях — «стекло» без них.
    float spec = pow(max(dot(reflect(-uSun, normal), view), 0.0), 120.0);
    float glitter = pow(max(dot(reflect(-uSun, normal), view), 0.0), 18.0) * 0.18;

    // Пена: полоса прибоя у берега и белые гребни на волнах.
    float shore = 1.0 - smoothstep(0.0, 5.5, uShoreZ - vWorld.z);
    float crest = smoothstep(0.17, 0.3, height);
    float foam = clamp(shore * 0.85 + crest * 0.55, 0.0, 1.0);

    // Отражение неба. Взгляд с причала скользит по воде почти вдоль, поэтому
    // одного френеля мало: он одинаково высок и в двух метрах, и в двухстах,
    // и всё море выцветает в небо. Ближнюю воду оставляем синей, дальнюю
    // отдаём отражению — так появляется расстояние.
    // Двадцать пять единиц — это уже почти горизонт: взгляд с причала
    // скользит вдоль воды, и вся даль умещается в три десятка строк пикселей.
    float near = 1.0 - smoothstep(5.0, 45.0, dist);
    vec3 color = mix(base, uHorizon, fresnel * mix(0.66, 0.14, near));
    color = mix(color, uFoam, foam * 0.75);
    color += spec * 1.4 + glitter;

    // Гребень светлее, подошва темнее. Смещение геометрии на пологом взгляде
    // не читается вовсе, а яркостной рисунок той же волны виден с любого угла.
    color *= 1.0 + clamp(height, -0.3, 0.3) * 1.4;

    // У самого берега вода почти прозрачная — видно мокрый песок.
    float alpha = mix(0.42, 0.78, clamp(depth * 2.2, 0.0, 1.0));

    // Воздушная дымка. Туман сцены до воды не достаёт (у неё свой шейдер),
    // поэтому даль растворяем здесь — иначе горизонт остаётся резаной
    // границей двух заливок и всё море выглядит слоем краски.
    float far = smoothstep(30.0, 150.0, dist);
    color = mix(color, uHorizon, far * 0.94);
    alpha = mix(alpha, 1.0, far);

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
        uHorizon: { value: new Color('#cfe6f5') },
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

  /** Цвет неба у линии воды: в него уходит даль и в нём отражается горизонт. */
  setHorizon(color: string): void {
    (this.material.uniforms.uHorizon?.value as Color).set(color);
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
      Math.sin(x * 0.21 + t * 1.15) * 0.17 +
      Math.sin(z * 0.27 - t * 0.95) * 0.11 +
      Math.sin((x + z) * 0.55 + t * 1.85) * 0.06
    );
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
