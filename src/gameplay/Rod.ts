import { Container, Graphics } from 'pixi.js';
import { clamp } from '../core/world';

const ROD_LENGTH = 118;
/** Наклон удилища в покое. */
const REST_ANGLE = -0.82;

/**
 * Лодка и удилище. Изгиб удилища — единственная «физика» здесь: вершинка
 * уводится в сторону крючка тем сильнее, чем выше натяжение лески.
 */
export class Rod {
  readonly view = new Container();

  /** Позиция вершинки в мировых координатах — к ней крепится леска. */
  tipX = 0;
  tipY = 0;

  private readonly hull = new Graphics();
  private readonly rod = new Graphics();
  private gripX = 0;
  private gripY = 0;
  private bend = 0;

  constructor() {
    this.view.addChild(this.hull, this.rod);
    this.drawHull();
  }

  private drawHull(): void {
    const g = this.hull;
    g.clear();
    // Корпус: простой силуэт, арт появится в фазе 2.
    g.moveTo(-46, 0)
      .quadraticCurveTo(-40, 15, -22, 17)
      .lineTo(24, 17)
      .quadraticCurveTo(44, 14, 50, 0)
      .closePath()
      .fill({ color: 0x1d3b44 });
    g.moveTo(-46, 0).lineTo(50, 0).stroke({ width: 2, color: 0x2f5f66 });
    // Рыбак — условная фигура, чтобы читался масштаб.
    g.circle(-6, -20, 6).fill({ color: 0x24454d });
    g.moveTo(-6, -14).lineTo(-6, -2).stroke({ width: 8, color: 0x24454d });
  }

  /**
   * @param x позиция лодки по горизонтали
   * @param y уровень воды под лодкой (лодка качается на волне)
   * @param pull направление на крючок и сила натяжения 0..1
   */
  update(x: number, y: number, pull: { dx: number; dy: number; tension: number }): void {
    this.view.x = x;
    this.view.y = y;
    this.gripX = x - 4;
    this.gripY = y - 26;

    this.bend = clamp(pull.tension, 0, 1);

    const length = Math.hypot(pull.dx, pull.dy) || 1;
    const toHookX = pull.dx / length;
    const toHookY = pull.dy / length;

    // Вершинка уходит от угла покоя к направлению на крючок пропорционально изгибу.
    const restX = Math.cos(REST_ANGLE);
    const restY = Math.sin(REST_ANGLE);
    const dirX = restX + (toHookX - restX) * this.bend * 0.55;
    const dirY = restY + (toHookY - restY) * this.bend * 0.55;
    const norm = Math.hypot(dirX, dirY) || 1;

    this.tipX = this.gripX + (dirX / norm) * ROD_LENGTH;
    this.tipY = this.gripY + (dirY / norm) * ROD_LENGTH;

    this.drawRod();
  }

  private drawRod(): void {
    // Контрольная точка кривой ближе к углу покоя — так удилище гнётся дугой,
    // а не ломается в вершинке.
    const controlX = this.gripX + Math.cos(REST_ANGLE) * ROD_LENGTH * 0.62;
    const controlY = this.gripY + Math.sin(REST_ANGLE) * ROD_LENGTH * 0.62;

    const g = this.rod;
    g.clear();
    g.moveTo(this.gripX - this.view.x, this.gripY - this.view.y)
      .quadraticCurveTo(
        controlX - this.view.x,
        controlY - this.view.y,
        this.tipX - this.view.x,
        this.tipY - this.view.y,
      )
      .stroke({ width: 3, color: 0x0f2429, alpha: 0.95, cap: 'round' });
  }
}
