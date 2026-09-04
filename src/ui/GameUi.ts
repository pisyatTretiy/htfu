import { i18n } from '../services/I18n';
import { CATCH_ENTRIES, entryName } from '../content/catalog';
import type { BranchId, Progression } from '../meta/Progression';
import type { Album } from '../meta/Album';
import type { Quests } from '../meta/Quests';
import type { UnlockContext, Zones } from '../meta/Zones';

export interface UiCallbacks {
  buy(id: BranchId): void;
  travel(zoneId: string): void;
  /** Магазин открыт или закрыт: сцена ставит разметку геймплея на паузу. */
  shopToggled(open: boolean): void;
}

export interface UiState {
  money: number;
  progression: Progression;
  album: Album;
  quests: Quests;
  zones: Zones;
  unlock: UnlockContext;
  /** Панели открываются только в покое: в бою они прятали бы происходящее. */
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
  private readonly openButton: HTMLButtonElement;
  private readonly shop: HTMLElement;
  private readonly album: HTMLElement;
  private readonly albumList: HTMLElement;
  private readonly albumButton: HTMLButtonElement;
  private readonly map: HTMLElement;
  private readonly mapList: HTMLElement;
  private readonly mapButton: HTMLButtonElement;
  private readonly questEl: HTMLElement;
  private readonly offer: HTMLButtonElement;
  private readonly rows = new Map<BranchId, HTMLElement>();

  private open: 'shop' | 'album' | 'map' | null = null;
  private offerTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly callbacks: UiCallbacks,
    progression: Progression,
  ) {
    const root = document.getElementById('ui');
    if (!root) throw new Error('#ui не найден в разметке');
    this.root = root;

    this.root.innerHTML = `
      <div class="questbar" id="ui-quest"></div>
      <div class="topbar">
        <div class="stat" id="ui-money"></div>
        <button class="btn" id="ui-map-open">${i18n.t('map.open')}</button>
        <button class="btn" id="ui-album-open">${i18n.t('album.open')}</button>
        <button class="btn" id="ui-shop-open">${i18n.t('shop.open')}</button>
      </div>
      <button class="btn offer" id="ui-offer" hidden></button>
      <div class="panel" id="ui-shop" hidden>
        <div class="panel-head">
          <span>${i18n.t('shop.title')}</span>
          <button class="btn ghost" id="ui-shop-close" aria-label="${i18n.t('shop.close')}">×</button>
        </div>
        <div class="panel-list" id="ui-shop-list"></div>
      </div>
      <div class="panel" id="ui-map" hidden>
        <div class="panel-head">
          <span>${i18n.t('map.title')}</span>
          <button class="btn ghost" id="ui-map-close" aria-label="${i18n.t('shop.close')}">×</button>
        </div>
        <div class="panel-list" id="ui-map-list"></div>
      </div>
      <div class="panel" id="ui-album" hidden>
        <div class="panel-head">
          <span>${i18n.t('album.title')}</span>
          <button class="btn ghost" id="ui-album-close" aria-label="${i18n.t('shop.close')}">×</button>
        </div>
        <div class="panel-list album-list" id="ui-album-list"></div>
      </div>`;

    this.moneyEl = must(document.getElementById('ui-money'));
    this.questEl = must(document.getElementById('ui-quest'));
    this.openButton = must(document.getElementById('ui-shop-open')) as HTMLButtonElement;
    this.albumButton = must(document.getElementById('ui-album-open')) as HTMLButtonElement;
    this.shop = must(document.getElementById('ui-shop'));
    this.album = must(document.getElementById('ui-album'));
    this.map = must(document.getElementById('ui-map'));
    this.mapList = must(document.getElementById('ui-map-list'));
    this.mapButton = must(document.getElementById('ui-map-open')) as HTMLButtonElement;
    this.albumList = must(document.getElementById('ui-album-list'));
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

    this.openButton.addEventListener('click', () => this.toggle('shop'));
    this.albumButton.addEventListener('click', () => this.toggle('album'));
    this.mapButton.addEventListener('click', () => this.toggle('map'));
    must(document.getElementById('ui-map-close')).addEventListener('click', () =>
      this.toggle(null),
    );
    must(document.getElementById('ui-shop-close')).addEventListener('click', () =>
      this.toggle(null),
    );
    must(document.getElementById('ui-album-close')).addEventListener('click', () =>
      this.toggle(null),
    );
    // Escape на десктопе и Back на пульте закрывают панель.
    addEventListener('keydown', (event) => {
      if ((event.key === 'Escape' || event.key === 'GoBack') && this.open) this.toggle(null);
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
    return this.open !== null;
  }

  /** Открытая панель ставит симуляцию на паузу: это уже не геймплей. */
  toggle(panel: 'shop' | 'album' | 'map' | null): void {
    const next = this.open === panel ? null : panel;
    if (this.open === next) return;

    this.open = next;
    this.shop.hidden = next !== 'shop';
    this.album.hidden = next !== 'album';
    this.map.hidden = next !== 'map';
    this.callbacks.shopToggled(next !== null);

    if (next === 'shop') this.shop.querySelector('button')?.focus();
    else if (next === 'album') this.album.querySelector('button')?.focus();
    else if (next === 'map') this.map.querySelector('button')?.focus();
    else this.openButton.focus();
  }

  render(state: UiState): void {
    this.moneyEl.textContent = `${state.money} ${i18n.t('hud.money')}`;
    this.openButton.disabled = !state.canShop && this.open === null;
    this.albumButton.disabled = !state.canShop && this.open === null;
    this.mapButton.disabled = !state.canShop && this.open === null;
    this.albumButton.textContent = `${i18n.t('album.open')} ${state.album.discovered}/${state.album.total}`;

    this.renderQuest(state);
    this.renderAlbum(state);
    this.renderMap(state);

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

  private renderQuest(state: UiState): void {
    const quest = state.quests.active;
    if (!quest) {
      this.questEl.textContent = i18n.t('quest.done');
      this.questEl.classList.add('done');
      return;
    }
    this.questEl.classList.remove('done');
    this.questEl.innerHTML =
      `<span class="quest-npc">${i18n.pick(quest.npc)}</span>` +
      `<span class="quest-title">${i18n.pick(quest.title)}</span>` +
      `<span class="quest-progress">${Math.floor(state.quests.current)}/${state.quests.target}</span>`;
  }

  private renderMap(state: UiState): void {
    const current = state.zones.current;
    this.mapList.innerHTML = state.zones.all
      .map((zone) => {
        const unlocked = state.zones.isUnlocked(zone, state.unlock);
        const here = zone.id === current.id;
        const requirement =
          zone.unlock.type === 'quests'
            ? i18n.t('map.needQuests', { value: zone.unlock.value })
            : i18n.t('map.needMoney', { value: zone.unlock.value });
        const action = here
          ? `<span class="zone-here">${i18n.t('map.here')}</span>`
          : unlocked
            ? `<button class="btn go" data-zone="${zone.id}">${i18n.t('map.go')}</button>`
            : `<span class="zone-locked">${requirement}</span>`;
        return `
          <div class="branch zone${here ? ' current' : ''}${unlocked ? '' : ' locked'}">
            <div class="branch-top">
              <span class="branch-name">${i18n.pick(zone.name)}</span>
              <span class="dots">${i18n.t('map.depth', { depth: zone.maxDepth })}</span>
            </div>
            <div class="branch-hint">${i18n.pick(zone.note)}</div>
            <div class="branch-foot">${action}</div>
          </div>`;
      })
      .join('');

    for (const button of this.mapList.querySelectorAll<HTMLButtonElement>('.go')) {
      button.addEventListener('click', () => {
        const id = button.dataset.zone;
        if (id) this.callbacks.travel(id);
      });
    }
  }

  private renderAlbum(state: UiState): void {
    this.albumList.innerHTML = CATCH_ENTRIES.map((entry) => {
      const count = state.album.countOf(entry.id);
      const kind = i18n.t(`album.kind.${entry.kind}`);
      const title = count > 0 ? entryName(entry) : '???';
      const note =
        count > 0 ? i18n.t('album.times', { count }) : i18n.t('album.unknown');
      return `
        <div class="album-item${count > 0 ? '' : ' unknown'}">
          <div class="album-name">${title}</div>
          <div class="album-meta">${kind} · ${note}</div>
        </div>`;
    }).join('');
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
