import type { IPlatform } from '../platform';

/** Площадка принимает не чаще одного результата в секунду; держим запас. */
const MIN_GAP_MS = 1500;

type Sink = Pick<IPlatform, 'submitScore'>;

/**
 * Очередь результатов для таблиц лидеров.
 *
 * Отправлять напрямую нельзя: `leaderboards.setScore` ограничен одним вызовом
 * в секунду, а результаты меняются пачками — поймал рыбу, и разом двинулись
 * и кошелёк, и рекорд улова, и процент альбома. Очередь хранит по одному
 * (последнему) значению на таблицу и отдаёт их по одному с паузой.
 */
export class Leaderboards {
  private readonly pending = new Map<string, number>();
  /** Что уже ушло: тот же результат второй раз отправлять незачем. */
  private readonly sent = new Map<string, number>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sentAt = 0;

  constructor(
    private readonly platform: Sink,
    private readonly gapMs = MIN_GAP_MS,
    private readonly now: () => number = () => Date.now(),
  ) {}

  /** Поставить результат в очередь. Повторный вызов заменяет прежнее значение. */
  submit(board: string, value: number): void {
    const score = Math.max(0, Math.round(value));
    const known = this.pending.get(board) ?? this.sent.get(board);
    if (known === score) return;
    this.pending.set(board, score);
    this.schedule();
  }

  /** Сколько таблиц ждёт отправки. */
  get queued(): number {
    return this.pending.size;
  }

  private schedule(): void {
    if (this.timer || this.pending.size === 0) return;
    const wait = Math.max(0, this.gapMs - (this.now() - this.sentAt));
    this.timer = setTimeout(() => {
      this.timer = null;
      this.sendOne();
    }, wait);
  }

  private sendOne(): void {
    const next = this.pending.entries().next();
    if (next.done) return;

    const [board, value] = next.value;
    this.pending.delete(board);
    this.sent.set(board, value);
    this.sentAt = this.now();
    void this.platform.submitScore(board, value);
    this.schedule();
  }
}
