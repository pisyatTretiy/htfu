import { CATCH_ENTRIES } from '../content/catalog';
import { RARITIES, type Rarity } from '../gameplay/Rarity';

type Counts = Partial<Record<Rarity, number>>;

/** Сколько видов нужно собрать полностью, чтобы получить ступень бонуса. */
const BONUS_STEP_PERCENT = 25;
/** Прибавка к цене всего улова за каждую ступень заполнения. */
const PRICE_PER_STEP = 0.05;
/** Прибавка к прочности лески за каждую ступень. */
const LINE_PER_STEP = 0.03;
/** Прибавка к цене вида, собранного во всех трёх вариантах. */
const SPECIES_COMPLETE_BONUS = 0.25;

export interface AlbumRecord {
  /** Вид встретился впервые. */
  firstEver: boolean;
  /** Этот вариант вида встретился впервые. */
  firstVariant: boolean;
  /** Вид только что собран целиком. */
  speciesCompleted: boolean;
}

/**
 * Альбом видов. Заполнение даёт постоянные бонусы — это и есть долгосрочная
 * цель поверх денег (docs/03, § 3.5).
 */
export class Album {
  private caught: Record<string, Counts> = {};

  record(id: string, rarity: Rarity): AlbumRecord {
    const before = this.caught[id] ?? {};
    const firstEver = Object.keys(before).length === 0;
    const firstVariant = (before[rarity] ?? 0) === 0;
    const wasComplete = this.isComplete(id);

    this.caught[id] = { ...before, [rarity]: (before[rarity] ?? 0) + 1 };

    return {
      firstEver,
      firstVariant,
      speciesCompleted: !wasComplete && this.isComplete(id),
    };
  }

  isComplete(id: string): boolean {
    const counts = this.caught[id];
    return !!counts && RARITIES.every((rarity) => (counts[rarity] ?? 0) > 0);
  }

  countOf(id: string, rarity?: Rarity): number {
    const counts = this.caught[id];
    if (!counts) return 0;
    if (rarity) return counts[rarity] ?? 0;
    return RARITIES.reduce((sum, item) => sum + (counts[item] ?? 0), 0);
  }

  hasVariant(id: string, rarity: Rarity): boolean {
    return this.countOf(id, rarity) > 0;
  }

  /** Сколько видов встречено хотя бы раз. */
  get discovered(): number {
    return Object.keys(this.caught).length;
  }

  get total(): number {
    return CATCH_ENTRIES.length;
  }

  /** Сколько видов собрано во всех трёх вариантах. */
  get completed(): number {
    return CATCH_ENTRIES.filter((entry) => this.isComplete(entry.id)).length;
  }

  /** Заполнение в процентах: считается по вариантам, а не по видам. */
  get fillPercent(): number {
    const totalVariants = CATCH_ENTRIES.length * RARITIES.length;
    if (totalVariants === 0) return 0;
    const found = CATCH_ENTRIES.reduce(
      (sum, entry) => sum + RARITIES.filter((rarity) => this.hasVariant(entry.id, rarity)).length,
      0,
    );
    return (found / totalVariants) * 100;
  }

  private get steps(): number {
    return Math.floor(this.fillPercent / BONUS_STEP_PERCENT);
  }

  /** Множитель цены всего улова от заполнения альбома. */
  get priceMultiplier(): number {
    return 1 + this.steps * PRICE_PER_STEP;
  }

  /** Множитель прочности лески от заполнения альбома. */
  get lineStrengthMultiplier(): number {
    return 1 + this.steps * LINE_PER_STEP;
  }

  /** Дополнительный множитель цены для собранного целиком вида. */
  priceMultiplierFor(id: string): number {
    return this.isComplete(id) ? 1 + SPECIES_COMPLETE_BONUS : 1;
  }

  serialize(): Record<string, Counts> {
    return JSON.parse(JSON.stringify(this.caught)) as Record<string, Counts>;
  }

  /**
   * Принимает и новый формат, и старый плоский счётчик из сейвов до v5:
   * там вариантов не было, поэтому всё пойманное считается обычным.
   */
  restore(saved: Record<string, Counts | number> | undefined): void {
    if (!saved) return;
    for (const [id, value] of Object.entries(saved)) {
      if (typeof value === 'number') {
        if (value > 0) this.caught[id] = { common: Math.floor(value) };
        continue;
      }
      const counts: Counts = {};
      for (const rarity of RARITIES) {
        const count = value[rarity];
        if (typeof count === 'number' && count > 0) counts[rarity] = Math.floor(count);
      }
      if (Object.keys(counts).length > 0) this.caught[id] = counts;
    }
  }
}
