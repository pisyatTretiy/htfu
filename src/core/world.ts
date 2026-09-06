/**
 * Единиц мира на метр глубины. 250 м в масштабе один к одному уезжают за
 * горизонт видимости, поэтому глубина сжата вдвое.
 *
 * Мера общая для сцены и крючка. Пока она жила только в сцене, крючок считал
 * свою глубину в единицах мира и выдавал их за метры: предел лески переводился
 * с коэффициентом, а показания глубины — нет, и глубиномер врал ровно вдвое.
 */
export const UNITS_PER_M = 0.5;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Экспоненциальное сглаживание, независимое от частоты кадров.
 * `rate` — доля оставшегося расстояния за секунду.
 */
export function damp(current: number, target: number, rate: number, dt: number): number {
  return target + (current - target) * Math.pow(rate, dt);
}
