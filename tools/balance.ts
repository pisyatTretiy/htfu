/**
 * Отчёт по балансу боёв.
 *
 * Гейт фазы 4 из docs/05 требует цифр: доля обрывов в первых боях ≤ 20 % и
 * проходимость первого босса. Живого плейтеста пока нет, но бой считается
 * детерминированно — значит, его можно прогнать моделью игрока и увидеть
 * перекосы до того, как в них упрётся живой человек.
 *
 * Запуск: npm run balance
 */
import { CATCH_ENTRIES } from '../src/content/catalog';
import { BOSSES } from '../src/meta/Bosses';
import { poolAt } from '../src/gameplay/CatchPool';
import { bossAsCatch } from '../src/meta/Bosses';
import {
  COMPETENT,
  LEARNING,
  MASTER,
  ROOKIE,
  gearForZone,
  TIMID,
  simulateSpecies,
  type PlayerModel,
} from '../src/gameplay/Simulate';
import type { CatchEntry } from '../src/content/types';

const RUNS = 300;

function percent(part: number, total: number): string {
  return `${((part / total) * 100).toFixed(0).padStart(3)} %`;
}

function row(entry: CatchEntry, player: PlayerModel, setup = {}): string {
  const stats = simulateSpecies(entry, RUNS, player, setup);
  return (
    `  ${entry.id.padEnd(16)} ` +
    `взято ${percent(stats.landed, RUNS)} · ` +
    `обрыв ${percent(stats.snapped, RUNS)} · ` +
    `сорвалась ${percent(stats.escaped, RUNS)} · ` +
    `${stats.averageSeconds.toFixed(1)} с`
  );
}

function section(title: string): void {
  console.log(`\n${title}`);
  console.log('─'.repeat(title.length));
}

// Стартовая снасть: именно с ней играют первые десять минут.
section('Мелководье причала, стартовая снасть, умелый игрок');
const shallow = poolAt(6).filter((entry) => entry.kind === 'fish');
for (const entry of shallow.slice(0, 12)) console.log(row(entry, COMPETENT));

section('Мелководье причала, стартовая снасть, разбирается по ходу');
for (const entry of shallow.slice(0, 12)) console.log(row(entry, LEARNING));

section('Мелководье причала, стартовая снасть, новичок');
for (const entry of shallow.slice(0, 12)) console.log(row(entry, ROOKIE));

section('Глубина 60 м, снасть третьего уровня');
const deep = poolAt(60).filter((entry) => entry.kind === 'fish');
for (const entry of deep.slice(0, 10)) {
  console.log(row(entry, COMPETENT, { reelPower: 1.36, lineStrength: 1.27 }));
}

section('Боссы: снасть своей локации и снасть на шаг позади');
for (let i = 0; i < BOSSES.length; i++) {
  const boss = BOSSES[i];
  if (!boss) continue;
  console.log(row(bossAsCatch(boss), COMPETENT, { ...gearForZone(i), phases: boss.phases }));
  console.log(
    `${row(bossAsCatch(boss), COMPETENT, { ...gearForZone(i - 1), phases: boss.phases })}  (позади)`,
  );
}

section('Сводка по всему каталогу, стартовая снасть');
const fish = CATCH_ENTRIES.filter((entry) => entry.kind === 'fish');
for (const [title, player] of [
  ['мастер     ', MASTER],
  ['умелый     ', COMPETENT],
  ['разбирается', LEARNING],
  ['новичок    ', ROOKIE],
  ['осторожный ', TIMID],
] as [string, PlayerModel][]) {
  let landed = 0;
  let snapped = 0;
  let escaped = 0;
  let seconds = 0;
  for (const entry of fish) {
    const stats = simulateSpecies(entry, 60, player);
    landed += stats.landed;
    snapped += stats.snapped;
    escaped += stats.escaped;
    seconds += stats.averageSeconds;
  }
  const total = landed + snapped + escaped;
  console.log(
    `  ${title} взято ${percent(landed, total)} · обрыв ${percent(snapped, total)} · ` +
      `сорвалась ${percent(escaped, total)} · ${(seconds / fish.length).toFixed(1)} с`,
  );
}
