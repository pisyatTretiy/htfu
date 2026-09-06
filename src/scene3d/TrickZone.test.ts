import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TRICK_FROM, TRICK_TO } from './FishingScene3D';

/**
 * Зелёная зона на шкале заброса нарисована в CSS процентами, а засчитывается
 * в коде числами. Разъехавшись, они дают полосу, которая показывает не туда,
 * куда надо целиться, — и заметить это можно только глазами и на удачу.
 */
describe('зелёная зона трюк-шота', () => {
  const css = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');

  it('полоса в разметке стоит там же, где порог в коде', () => {
    const rule = css.match(/#ui \.gauge-zone \{[^}]*\}/)?.[0] ?? '';
    const left = Number(rule.match(/left:\s*([\d.]+)%/)?.[1]);
    const width = Number(rule.match(/width:\s*([\d.]+)%/)?.[1]);

    expect(left, 'в CSS не найден left').not.toBeNaN();
    expect(width, 'в CSS не найден width').not.toBeNaN();
    expect(left / 100).toBeCloseTo(TRICK_FROM, 5);
    expect((left + width) / 100).toBeCloseTo(TRICK_TO, 5);
  });

  it('зона не шире четверти шкалы и не пуста', () => {
    expect(TRICK_TO).toBeGreaterThan(TRICK_FROM);
    expect(TRICK_TO - TRICK_FROM).toBeLessThanOrEqual(0.25);
    expect(TRICK_TO).toBeLessThanOrEqual(1);
  });
});
