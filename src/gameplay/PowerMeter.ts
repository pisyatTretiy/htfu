import { Container, Graphics } from 'pixi.js';

/** Зелёная зона: попадание даёт трюк-шот. */
const TRICK_MIN = 0.72;
const TRICK_MAX = 0.88;
/** Полный цикл шкалы туда-обратно, секунд. */
const SWEEP = 1.15;

const WIDTH = 118;
const HEIGHT = 9;

/**
 * Шкала силы заброса. Бежит туда-обратно, пока игрок держит палец:
 * отпустил в зелёной зоне — трюк-шот и бонус к стоимости улова.
 */
export class PowerMeter {
  readonly view = new Container();

  value = 0;
  active = false;

  private readonly bar = new Graphics();
  private phase = 0;

  constructor() {
    this.view.addChild(this.bar);
    this.view.visible = false;
  }

  begin(): void {
    this.active = true;
    this.phase = 0;
    this.value = 0;
    this.view.visible = true;
  }

  /** @returns попал ли игрок в зелёную зону */
  release(): boolean {
    this.active = false;
    this.view.visible = false;
    return this.value >= TRICK_MIN && this.value <= TRICK_MAX;
  }

  update(dt: number, x: number, y: number): void {
    this.view.x = x;
    this.view.y = y;
    if (!this.active) return;

    this.phase += dt / SWEEP;
    // Треугольная волна 0 → 1 → 0.
    const t = this.phase % 1;
    this.value = t < 0.5 ? t * 2 : 2 - t * 2;
    this.draw();
  }

  private draw(): void {
    const g = this.bar;
    g.clear();
    g.roundRect(-WIDTH / 2, -HEIGHT / 2, WIDTH, HEIGHT, 4).fill({ color: 0x03181d, alpha: 0.72 });
    g.roundRect(
      -WIDTH / 2 + TRICK_MIN * WIDTH,
      -HEIGHT / 2,
      (TRICK_MAX - TRICK_MIN) * WIDTH,
      HEIGHT,
      3,
    ).fill({ color: 0x4fd6b4, alpha: 0.5 });
    g.roundRect(-WIDTH / 2 + 1, -HEIGHT / 2 + 1, (WIDTH - 2) * this.value, HEIGHT - 2, 3).fill({
      color: 0xf2fbf8,
      alpha: 0.92,
    });
  }
}
