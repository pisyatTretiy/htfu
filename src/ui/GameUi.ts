import { i18n } from '../services/I18n';
import type { BranchId, Progression } from '../meta/Progression';
import type { Album } from '../meta/Album';

export interface UiCallbacks {
  buy(id: BranchId): void;
  /** Магазин открыт или закрыт: сцена ставит разметку геймплея на паузу. */
  shopToggled(open: boolean): void;
}

export interface UiState {
  money: number;
  progression: Progression;
  album: Album;
  /** Магазин открывается только в покое: в бою он бы прятал происходящее. */
  canShop: boolean;
}

/**
 * Интерфейс — обычный DOM поверх канваса (docs/04, § 4.2).
 *
 * Так адаптивность достаётся из коробки, навигация стрелками пульта работает
 * нативно, а вёрстка магазина занимает часы вместо дней.
 */
export class GameUi {
  private readonly root: HTMLElement;
  private readonly moneyEl: HTMLElement;
  private readonly albumEl: HTMLElement;
  private readonly openButton: HTMLButtonElement;
  private readonly shop: HTMLElement;
  private readonly offer: HTMLButtonElement;
  private readonly rows = new Map<BranchId, HTMLElement>();

  private open = false;
  private offerTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly callbacks: UiCallbacks,
    progression: Progression,
  ) {
    const root = document.getElementById('ui');
    if (!root) throw new Error('#ui не найден в разметке');
    this.root = root;

    this.root.innerHTML = `
      <div class="topbar">
        <div class="stat" id="ui-money"></div>
        <div class="stat" id="ui-album"></div>
        <button class="btn" id="ui-shop-open">${i18n.t('shop.open')}</button>
      </div>
      <button class="btn offer" id="ui-offer" hidden></button>
      <div class="shop" id="ui-shop" hidden>
        <div class="shop-head">
          <span>${i18n.t('shop.title')}</span>
          <button class="btn ghost" id="ui-shop-close" aria-label="${i18n.t('shop.close')}">×</button>
        </div>
        <div class="shop-list" id="ui-shop-list"></div>
      </div>`;

    this.moneyEl = must(document.getElementById('ui-money'));
    this.albumEl = must(document.getElementById('ui-album'));
    this.openButton = must(document.getElementById('ui-shop-open')) as HTMLButtonElement;
    this.shop = must(document.getElementById('ui-shop'));
    this.offer = must(document.getElementById('ui-offer')) as HTMLButtonElement;

    const list = must(document.getElementById('ui-shop-list'));
    for (const branch of progression.branches) {
      const row = document.createElement('div');
      row.className = 'branch';
      row.innerHTML = `
        <div class="branch-top">
          <span class="branch-name">${i18n.pick(branch.name)}</span>
          <span class="dots"></span>
        </div>
        <div class="branch-hint">${i18n.pick(branch.hint)}</div>
        <div class="branch-foot">
          <span class="branch-value"></span>
          <button class="btn buy"></button>
        </div>`;
      const buy = must(row.querySelector('.buy')) as HTMLButtonElement;
      buy.addEventListener('click', () => this.callbacks.buy(branch.id));
      list.appendChild(row);
      this.rows.set(branch.id, row);
    }

    this.openButton.addEventListener('click', () => this.toggle(true));
    must(document.getElementById('ui-shop-close')).addEventListener('click', () =>
      this.toggle(false),
    );
    // Escape на десктопе и Back на пульте закрывают панель.
    addEventListener('keydown', (event) => {
      if ((event.key === 'Escape' || event.key === 'GoBack') && this.open) this.toggle(false);
    });
  }

  /**
   * Предложение посмотреть ролик за награду. Всегда добровольное и всегда
   * сверх обычного прохождения — требование модерации (docs/02, § 2.4).
   */
  offerReward(label: string, seconds: number, accept: () => void): void {
    this.hideOffer();
    this.offer.textContent = label;
    this.offer.hidden = false;
    this.offer.onclick = () => {
      this.hideOffer();
      accept();
    };
    this.offerTimer = setTimeout(() => this.hideOffer(), seconds * 1000);
  }

  hideOffer(): void {
    if (this.offerTimer) {
      clearTimeout(this.offerTimer);
      this.offerTimer = null;
    }
    this.offer.hidden = true;
    this.offer.onclick = null;
  }

  get isShopOpen(): boolean {
    return this.open;
  }

  toggle(open: boolean): void {
    if (this.open === open) return;
    this.open = open;
    this.shop.hidden = !open;
    this.callbacks.shopToggled(open);
    if (open) this.shop.querySelector('button')?.focus();
    else this.openButton.focus();
  }

  render(state: UiState): void {
    this.moneyEl.textContent = `${state.money} ${i18n.t('hud.money')}`;
    this.albumEl.textContent = `${i18n.t('hud.album')} ${state.album.discovered}/${state.album.total}`;
    this.openButton.disabled = !state.canShop && !this.open;

    for (const branch of state.progression.branches) {
      const row = this.rows.get(branch.id);
      if (!row) continue;

      const level = state.progression.levelOf(branch.id);
      const max = state.progression.maxLevelOf(branch.id);
      const price = state.progression.nextPrice(branch.id);
      const next = state.progression.nextValue(branch.id);
      const unit = i18n.pick(branch.unit);

      must(row.querySelector('.dots')).textContent =
        '●'.repeat(level + 1) + '○'.repeat(max - level);

      const value = state.progression.valueOf(branch.id);
      must(row.querySelector('.branch-value')).textContent =
        next === null
          ? `${format(value)} ${unit}`
          : `${format(value)} → ${format(next)} ${unit}`;

      const buy = must(row.querySelector('.buy')) as HTMLButtonElement;
      if (price === null) {
        buy.textContent = i18n.t('shop.max');
        buy.disabled = true;
        row.classList.add('maxed');
      } else {
        buy.textContent = `${price} ₽`;
        buy.disabled = state.money < price;
        row.classList.toggle('locked', state.money < price);
      }
    }
  }
}

function must<T extends Element | HTMLElement | null>(node: T): HTMLElement {
  if (!node) throw new Error('Элемент интерфейса не найден');
  return node as HTMLElement;
}

/** Целые показываем без хвоста, дробные — с одним знаком. */
function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '');
}
