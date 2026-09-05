/**
 * Подбор длины боя и терпения улова по данным, а не на глаз.
 *
 * Первый прогон симулятора (npm run balance) показал две вещи. Во-первых,
 * мелкая рыба у причала дралась по двадцать секунд, а глубоководная — по
 * шесть: `drain` в данных отвечал за «сложность», и вышло наоборот, потому
 * что сложная рыба выдыхалась быстрее. Во-вторых, одинаковое терпение для
 * всех видов означало, что вялую рыбу невозможно вытащить в срок.
 *
 * Скрипт назначает каждому виду целевую длину боя по его глубине, подгоняет
 * `drain` под неё и пересчитывает `patience` с запасом.
 *
 * Запуск: npm run tune-fights
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { BOSSES, bossAsCatch } from '../src/meta/Bosses';
import { COMPETENT, gearForZone, simulateFight } from '../src/gameplay/Simulate';
import { Rng } from '../src/core/Rng';
import type { CatchEntry } from '../src/content/types';

const FILE = 'src/content/catches.json';
/** Сколько боёв усредняем на каждой итерации подгонки. */
const RUNS = 80;
/** Во сколько раз терпение больше медленного боя (девяностой процентили). */
const HEADROOM = 1.3;

/**
 * Целевая длина боя по глубине обитания.
 *
 * Восемь секунд у причала — чтобы первые уловы шли быстро и игрок увидел
 * весь цикл за минуту; двадцать две на глубине — чтобы редкая рыба
 * ощущалась событием. Дизайн обещает 5–15 секунд (docs/03, § 3.3) для
 * обычного улова, глубина — уже территория боссов по ощущению.
 */
function targetSeconds(depth: readonly number[]): number {
  const middle = ((depth[0] ?? 0) + (depth[1] ?? 0)) / 2;
  return 8 + Math.min(1, middle / 200) * 14;
}

interface Probe {
  seconds: number;
  /** Девяностая процентиль длины боя: по ней считается терпение. */
  slowest: number;
  landRate: number;
}

/** Значение, ниже которого лежит доля `share` выборки. */
function percentile(values: number[], share: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * share));
  return sorted[index] ?? 0;
}

/** Длина честного боя без давления времени и доля побед умелого игрока. */
function probe(entry: CatchEntry, drain: number): Probe {
  const candidate: CatchEntry = { ...entry, fight: { ...entry.fight, drain, patience: 600 } };
  const rng = new Rng(entry.id.length * 104729 + 17);
  const times: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const result = simulateFight(candidate, rng.int(1, 1 << 20), COMPETENT);
    if (result.outcome === 'landed') times.push(result.seconds);
  }
  const total = times.reduce((sum, value) => sum + value, 0);
  return {
    seconds: times.length > 0 ? total / times.length : 0,
    slowest: percentile(times, 0.9),
    landRate: times.length / RUNS,
  };
}

/**
 * Подобрать drain перебором по сетке.
 *
 * Пропорциональная подгонка (drain *= измеренное / целевое) на бойкой рыбе
 * расходится: у неё высокий рывок, и стоит убавить drain, как умелый игрок
 * перестаёт успевать вымотать рыбу вообще — бой не заканчивается, а формула
 * продолжает убавлять. Поэтому перебираем сетку и берём лучший вариант из
 * тех, что вообще выигрываются.
 */
function tune(
  entry: CatchEntry,
  target: number,
): { drain: number; seconds: number; slowest: number } | null {
  let best: { drain: number; seconds: number; slowest: number; score: number } | null = null;

  for (let step = 0; step <= 40; step++) {
    const drain = 0.08 + step * 0.025;
    const result = probe(entry, drain);
    // Вид, который умелый игрок не вытаскивает почти всегда, — это не
    // сложность, а поломка: такой вариант не рассматриваем.
    if (result.landRate < 0.97) continue;

    const score = Math.abs(result.seconds - target);
    if (!best || score < best.score) {
      best = { drain, seconds: result.seconds, slowest: result.slowest, score };
    }
  }
  return best ? { drain: best.drain, seconds: best.seconds, slowest: best.slowest } : null;
}

const raw = JSON.parse(readFileSync(FILE, 'utf8')) as { entries: CatchEntry[] };

for (const entry of raw.entries) {
  if (entry.kind !== 'fish') continue;

  const target = targetSeconds(entry.depth);
  const tuned = tune(entry, target);
  if (!tuned) {
    console.warn(`  ${entry.id}: ни один вариант не выигрывается — данные не тронуты`);
    continue;
  }

  entry.fight.drain = Math.round(tuned.drain * 1000) / 1000;
  // Терпение считаем от самого медленного боя из десяти, а не от среднего:
  // по среднему невезучий игрок теряет рыбу просто потому, что рывки в этот
  // раз легли неудачно.
  entry.fight.patience = Math.max(12, Math.min(48, Math.round(tuned.slowest * HEADROOM)));
  console.log(
    `  ${entry.id.padEnd(16)} глубина ${String(entry.depth[0]).padStart(3)}–${String(
      entry.depth[1],
    ).padStart(3)} м · цель ${target.toFixed(0)} с · бой ${tuned.seconds.toFixed(1)} с · ` +
      `drain ${entry.fight.drain} · терпение ${entry.fight.patience} с`,
  );
}

writeFileSync(FILE, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');

// --- боссы ---------------------------------------------------------------
//
// У босса три фазы со своими рывками, и трогать их по отдельности нельзя:
// рисунок боя задуман автором. Двигаем всю тройку одним множителем, пока бой
// не станет длиться столько, сколько положено бою с боссом.

const BOSS_FILE = 'src/content/bosses.json';
const bossRaw = JSON.parse(readFileSync(BOSS_FILE, 'utf8')) as {
  bosses: { id: string; phases: { drain: number }[]; patience?: number }[];
};


/** Длины выигранных боёв босса при заданной снасти. */
function runBoss(
  entry: CatchEntry,
  phases: { drain: number }[],
  gear: { reelPower: number; lineStrength: number },
): number[] {
  const rng = new Rng(entry.id.length * 7919 + 3);
  const times: number[] = [];
  for (let run = 0; run < RUNS; run++) {
    const result = simulateFight(entry, rng.int(1, 1 << 20), COMPETENT, {
      ...gear,
      phases: phases as never,
    });
    if (result.outcome === 'landed') times.push(result.seconds);
  }
  return times;
}

console.log('\nБоссы');
for (let i = 0; i < BOSSES.length; i++) {
  const boss = BOSSES[i];
  const target = bossRaw.bosses.find((item) => item.id === boss?.id);
  if (!boss || !target) continue;

  // Первый босс — двадцать две секунды, дальше по шесть на каждого: бой с
  // боссом должен ощущаться длиннее любого обычного улова этой локации.
  const wanted = 22 + i * 6;
  let best: {
    scale: number;
    seconds: number;
    starter: number[];
    score: number;
  } | null = null;

  for (let step = 0; step <= 30; step++) {
    const scale = 0.4 + step * 0.05;
    const phases = boss.phases.map((phase) => ({ ...phase, drain: phase.drain * scale }));
    const entry = bossAsCatch(boss);

    const geared = runBoss(entry, phases, gearForZone(i));
    if (geared.length / RUNS < 0.97) continue;

    // Отставший на шаг игрок всё ещё должен побеждать. Без этой проверки три
    // последних босса оказались стеной: сто процентов «сорвался» у честного
    // игрока, который просто не докупил снасть.
    const behind = runBoss(entry, phases, gearForZone(i - 1));
    if (behind.length / RUNS < 0.9) continue;

    const seconds = geared.reduce((sum, value) => sum + value, 0) / geared.length;
    const score = Math.abs(seconds - wanted);
    if (!best || score < best.score) best = { scale, seconds, starter: behind, score };
  }

  if (!best) {
    console.warn(`  ${boss.id}: ни один вариант не годится — данные не тронуты`);
    continue;
  }
  for (const phase of target.phases) {
    phase.drain = Math.round(phase.drain * best.scale * 1000) / 1000;
  }

  const behindSeconds = percentile(best.starter, 0.9);
  target.patience = Math.max(40, Math.min(160, Math.round(behindSeconds * 1.4)));

  console.log(
    `  ${boss.id.padEnd(16)} цель ${wanted} с · бой ${best.seconds.toFixed(1)} с · ` +
      `множитель ${best.scale.toFixed(2)} · снастью на шаг позади ${behindSeconds.toFixed(1)} с · ` +
      `терпение ${target.patience} с`,
  );
}

writeFileSync(BOSS_FILE, `${JSON.stringify(bossRaw, null, 2)}\n`, 'utf8');
console.log('\nДанные обновлены. Дальше: npm run balance и npm test.');
