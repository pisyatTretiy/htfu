import {
  BackSide,
  Color,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Texture,
} from 'three';

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

/** Небесный купол. Градиент в шейдере — ни одной текстуры и ни одного байта веса. */
export class Sky3D {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;
  private readonly sun: Sprite;

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
    this.sun.position.set(-220, 190, -520);
    this.mesh.add(this.sun);
  }

  /** Палитра приходит из данных локации: небо меняется вместе с водой. */
  setPalette(colors: readonly string[]): void {
    const [bottom, middle, top] = colors;
    if (bottom) (this.material.uniforms.uBottom?.value as Color).set(bottom);
    if (middle) (this.material.uniforms.uMiddle?.value as Color).set(middle);
    if (top) (this.material.uniforms.uTop?.value as Color).set(top);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
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
