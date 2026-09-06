import { describe, expect, it } from 'vitest';
import { sinkSecondsTo, sinkSpeedMps } from './Hook3D';
import { ZONES } from '../meta/Zones';

/**
 * Время ожидания на забросе.
 *
 * Проверка появилась после того, как выяснилось: поклёвка срабатывала по
 * таймеру от входа в воду, и крючок не успевал уйти глубже пяти метров при
 * пределе лески в сорок пять. Теперь клюёт, когда крючок встал, — значит,
 * ожидание задаётся профилем погружения, и его надо держать в рамках: слишком
 * медленно — двести пятьдесят метров превращаются в минуты, слишком быстро —
 * стаю в верхних метрах не успеть выцелить.
 */
describe('погружение', () => {
  it('у поверхности крючок тонет медленно, глубже разгоняется', () => {
    expect(sinkSpeedMps(0)).toBeGreaterThan(1);
    expect(sinkSpeedMps(0)).toBeLessThan(5);
    expect(sinkSpeedMps(200)).toBeGreaterThan(sinkSpeedMps(20));
  });

  it('стаю в верхних метрах успеваешь провести крючком', () => {
    // Стая плавает примерно с трёх до восемнадцати метров: на её проход нужно
    // не меньше пары секунд, иначе наведение невозможно физически.
    expect(sinkSecondsTo(18) - sinkSecondsTo(3)).toBeGreaterThan(2);
  });

  it('до дна любой локации крючок доходит за разумное время', () => {
    for (const zone of ZONES) {
      const seconds = sinkSecondsTo(zone.maxDepth);
      expect(seconds, `${zone.id}: ${seconds.toFixed(1)} с`).toBeGreaterThan(3);
      expect(seconds, `${zone.id}: ${seconds.toFixed(1)} с`).toBeLessThan(15);
    }
  });
});
