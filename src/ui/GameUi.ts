import { i18n } from '../services/I18n';
import { CATCH_ENTRIES, entryName } from '../content/catalog';
import { RARITIES } from '../gameplay/Rarity';
import type { BranchId, Progression } from '../meta/Progression';
import type { Album } from '../meta/Album';
import type { Quests } from '../meta/Quests';
import type { UnlockContext, Zones } from '../meta/Zones';
import { BOSSES, type Bosses } from '../meta/Bosses';
import type { Dailies } from '../meta/Dailies';
import type { Boosts } from '../meta/Boosts';
import type { Store } from '../meta/Store';
import type { Product } from '../platform';

export interface UiCallbacks {
  buy(id: BranchId): void;
  travel(zoneId: string): void;
  claimDaily(taskId: string): void;
  /** Ролик за приманку: добровольно и всегда сверх обычного прохождения. */
  watchLure(): void;
  /** Покупка из магазина площадки. */
  buyProduct(id: string): void;
  /** Магазин открыт или закрыт: сцена ставит разметку геймплея на паузу. */
  shopToggled(open: boolean): void;
}

export interface UiState {
  money: number;
  progression: Progression;
  album: Album;
  quests: Quests;
  zones: Zones;
  bosses: Bosses;
  dailies: Dailies;
  boosts: Boosts;
  store: Store;
  /** Каталог площадки. Пустой — покупок нет, блок прячем целиком. */
  products: readonly Product[];
  /** На телевизоре рекламы за награду нет — кнопку прячем. */
  canWatchAds: boolean;
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
  private readonly tasks: HTMLElement;
  private readonly tasksList: HTMLElement;
  private readonly mapButton: HTMLButtonElement;
  private readonly questEl: HTMLElement;
  private readonly hintEl: HTMLElement;
  private readonly lureEl: HTMLElement;
  private readonly lureRow: HTMLElement;
  private readonly storeList: HTMLElement;
  /** Что уже нарисовано в блоке покупок: каталог приходит с задержкой. */
  private storeSignature = '';
  private readonly lureState: HTMLElement;
  private readonly lureButton: HTMLButtonElement;
  private readonly offer: HTMLButtonElement;
  private readonly gauge: HTMLElement;
  private readonly gaugeLabel: HTMLElement;
  private readonly gaugeFill: HTMLElement;
  private readonly gaugeZone: HTMLElement;
  private readonly gaugeSecond: HTMLElement;
  private readonly rows = new Map<BranchId, HTMLElement>();
  private readonly topbar: HTMLElement;
  /** Последний ввод был с клавиатуры или пульта, а не мышью. */
  private keyboardMode = false;

  private open: 'shop' | 'album' | 'map' | 'tasks' | null = null;
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
      <div class="hint" id="ui-hint" hidden></div>
      <div class="lure" id="ui-lure" hidden></div>
      <div class="topbar" id="ui-topbar">
        <div class="stat" id="ui-money"></div>
        <button class="btn" id="ui-map-open">${i18n.t('map.open')}</button>
        <button class="btn" id="ui-album-open">${i18n.t('album.open')}</button>
        <button class="btn" id="ui-shop-open">${i18n.t('shop.open')}</button>
      </div>
      <button class="btn offer" id="ui-offer" hidden></button>
      <div class="gauge" id="ui-gauge" hidden>
        <div class="gauge-label" id="ui-gauge-label"></div>
        <div class="gauge-track"><i id="ui-gauge-fill"></i><span class="gauge-zone" id="ui-gauge-zone"></span></div>
        <div class="gauge-track thin"><i id="ui-gauge-second"></i></div>
      </div>
      <div class="panel" id="ui-shop" hidden>
        <div class="panel-head">
          <span>${i18n.t('shop.title')}</span>
          <button class="btn ghost" id="ui-shop-close" aria-label="${i18n.t('shop.close')}">×</button>
        </div>
        <div class="panel-list" id="ui-store-list" hidden></div>
        <div class="branch lure-row" id="ui-lure-row">
          <div class="branch-top">
            <span class="branch-name">${i18n.t('lure.title')}</span>
            <span class="dots" id="ui-lure-state"></span>
          </div>
          <div class="branch-hint">${i18n.t('lure.hint')}</div>
          <div class="branch-foot">
            <span class="branch-value"></span>
            <button class="btn buy" id="ui-lure-buy">${i18n.t('lure.watch')}</button>
          </div>
        </div>
        <div class="panel-list" id="ui-shop-list"></div>
      </div>
      <div class="panel" id="ui-tasks" hidden>
        <div class="panel-head">
          <span>${i18n.t('daily.title')}</span>
          <button class="btn ghost" id="ui-tasks-close" aria-label="${i18n.t('shop.close')}">×</button>
        </div>
        <div class="panel-list" id="ui-tasks-list"></div>
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

    this.topbar = must(document.getElementById('ui-topbar'));
    this.moneyEl = must(document.getElementById('ui-money'));
    this.questEl = must(document.getElementById('ui-quest'));
    this.hintEl = must(document.getElementById('ui-hint'));
    this.lureEl = must(document.getElementById('ui-lure'));
    this.lureRow = must(document.getElementById('ui-lure-row'));
    this.storeList = must(document.getElementById('ui-store-list'));
    this.lureState = must(document.getElementById('ui-lure-state'));
    this.lureButton = must(document.getElementById('ui-lure-buy')) as HTMLButtonElement;
    this.lureButton.addEventListener('click', () => this.callbacks.watchLure());
    this.openButton = must(document.getElementById('ui-shop-open')) as HTMLButtonElement;
    this.albumButton = must(document.getElementById('ui-album-open')) as HTMLButtonElement;
    this.shop = must(document.getElementById('ui-shop'));
    this.album = must(document.getElementById('ui-album'));
    this.map = must(document.getElementById('ui-map'));
    this.tasks = must(document.getElementById('ui-tasks'));
    this.tasksList = must(document.getElementById('ui-tasks-list'));
    this.mapList = must(document.getElementById('ui-map-list'));
    this.mapButton = must(document.getElementById('ui-map-open')) as HTMLButtonElement;
    this.albumList = must(document.getElementById('ui-album-list'));
    this.offer = must(document.getElementById('ui-offer')) as HTMLButtonElement;
    this.gauge = must(document.getElementById('ui-gauge'));
    this.gaugeLabel = must(document.getElementById('ui-gauge-label'));
    this.gaugeFill = must(document.getElementById('ui-gauge-fill'));
    this.gaugeZone = must(document.getElementById('ui-gauge-zone'));
    this.gaugeSecond = must(document.getElementById('ui-gauge-second'));

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
    must(document.getElementById('ui-tasks-close')).addEventListener('click', () =>
      this.toggle(null),
    );
    // Панель дел открывается по строке задания сверху: отдельная кнопка
    // в нижнем ряду не помещается на узком экране.
    this.questEl.addEventListener('click', () => this.toggle('tasks'));
    this.questEl.setAttribute('role', 'button');
    this.questEl.tabIndex = 0;
    this.questEl.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') this.toggle('tasks');
    });
    must(document.getElementById('ui-shop-close')).addEventListener('click', () =>
      this.toggle(null),
    );
    must(document.getElementById('ui-album-close')).addEventListener('click', () =>
      this.toggle(null),
    );
    // Escape на десктопе и Back на пульте закрывают панель, а если закрывать
    // нечего — уводят фокус в верхний ряд. На телевизоре это единственный
    // способ попасть в интерфейс: мыши там нет.
    addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' && event.key !== 'GoBack') return;
      if (this.open) this.toggle(null);
      else this.focusTopbar();
    });

    addEventListener('pointerdown', () => (this.keyboardMode = false), true);
    addEventListener('keydown', (event) => this.navigate(event), true);
  }

  /**
   * Навигация стрелками — требование площадки: на телевизоре пульт должен
   * доставать до всего (docs/02, § 2.3).
   *
   * Стрелки достаются интерфейсу, только когда открыта панель или фокус стоит
   * в верхнем ряду. В остальное время они целятся: игра важнее меню.
   */
  private navigate(event: KeyboardEvent): void {
    const step = ARROW_STEP[event.key];
    if (step === undefined) {
      if (event.key === 'Enter' || event.key === ' ') this.keyboardMode = true;
      return;
    }
    this.keyboardMode = true;

    if (this.open) {
      event.preventDefault();
      const panel = this.panelOf(this.open);
      const buttons = this.focusable(panel);
      // В альбоме кнопок нет вовсе, кроме «закрыть»: там стрелки листают
      // список, иначе с пульта видно только первый экран.
      if (buttons.length < 2) panel.scrollBy({ top: step * 140, behavior: 'smooth' });
      else this.step(buttons, step);
      return;
    }
    if (!this.isTopbarFocused) return;

    event.preventDefault();
    // Вниз из верхнего ряда — обратно в игру: иначе с пульта не прицелиться.
    if (event.key === 'ArrowDown') (document.activeElement as HTMLElement | null)?.blur();
    else this.step(this.focusable(this.topbar), step);
  }

  private panelOf(panel: 'shop' | 'album' | 'map' | 'tasks'): HTMLElement {
    if (panel === 'shop') return this.shop;
    if (panel === 'album') return this.album;
    if (panel === 'map') return this.map;
    return this.tasks;
  }

  private focusable(root: HTMLElement): HTMLButtonElement[] {
    return [...root.querySelectorAll<HTMLButtonElement>('button')].filter(
      (button) => !button.disabled && button.offsetParent !== null,
    );
  }

  private step(buttons: HTMLButtonElement[], delta: number): void {
    if (buttons.length === 0) return;
    const active = document.activeElement;
    const at = buttons.findIndex((button) => button === active);
    // По кругу: на пульте «дальше» после последнего пункта — это первый.
    const next = at < 0 ? 0 : (at + delta + buttons.length) % buttons.length;
    const target = buttons[next];
    target?.focus();
    target?.scrollIntoView({ block: 'nearest' });
  }

  private get isTopbarFocused(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLElement && this.topbar.contains(active);
  }

  /** Забрать фокус в интерфейс: точка входа для пульта. */
  focusTopbar(): void {
    this.keyboardMode = true;
    this.focusable(this.topbar)[0]?.focus();
  }

  /** Стрелки сейчас принадлежат интерфейсу, а не прицелу. */
  get consumesArrows(): boolean {
    return this.open !== null || this.isTopbarFocused;
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

  /**
   * Строка обучения. Ровно одна и ровно в одну строку — правило из
   * docs/03, § 3.6: никаких модальных окон и стен текста.
   */
  setHint(text: string | null): void {
    const next = text ?? '';
    if (this.hintEl.textContent === next) return;
    this.hintEl.textContent = next;
    this.hintEl.hidden = next === '';
  }

  /**
   * Часы приманки поверх сцены. Показываем, только пока она работает: висящая
   * всё время строка «приманки нет» — это реклама, а не интерфейс.
   */
  setLure(secondsLeft: number): void {
    const active = secondsLeft > 0;
    const text = active ? i18n.t('lure.left', { time: clock(secondsLeft) }) : '';
    if (this.lureEl.textContent !== text) this.lureEl.textContent = text;
    this.lureEl.hidden = !active;
    if (!this.lureRow.hidden) {
      this.lureState.textContent = active ? clock(secondsLeft) : '';
    }
  }

  hideOffer(): void {
    if (this.offerTimer) {
      clearTimeout(this.offerTimer);
      this.offerTimer = null;
    }
    this.offer.hidden = true;
    this.offer.onclick = null;
  }

  /**
   * Полоса состояния: сила заброса, натяжение в бою, терпение улова в лодке.
   *
   * В 3D от первого лица игроку нечем измерить происходящее на глаз — изгиб
   * удилища читается плохо на маленьком экране, а цена ошибки высокая.
   */
  setGauge(
    kind: 'none' | 'power' | 'tension' | 'patience',
    value: number,
    secondary = 0,
    danger = 0,
  ): void {
    if (kind === 'none') {
      this.gauge.hidden = true;
      return;
    }
    this.gauge.hidden = false;
    this.gauge.dataset.kind = kind;
    this.gaugeLabel.textContent = i18n.t(`gauge.${kind}`);
    this.gaugeFill.style.width = `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%`;
    // Зелёная зона трюк-шота показывается только на шкале заброса.
    this.gaugeZone.hidden = kind !== 'power';
    this.gaugeSecond.parentElement!.hidden = kind !== 'tension';
    this.gaugeSecond.style.width = `${Math.round(Math.min(1, Math.max(0, secondary)) * 100)}%`;
    // Предел лески — не оттенок шкалы, а отдельное состояние: у игрока на
    // реакцию две десятых секунды, и полоса должна кричать.
    if (danger > 0) this.gauge.dataset.danger = '1';
    else delete this.gauge.dataset.danger;
  }

  get isShopOpen(): boolean {
    return this.open !== null;
  }

  /** Открытая панель ставит симуляцию на паузу: это уже не геймплей. */
  toggle(panel: 'shop' | 'album' | 'map' | 'tasks' | null): void {
    const next = this.open === panel ? null : panel;
    if (this.open === next) return;

    this.open = next;
    this.shop.hidden = next !== 'shop';
    this.album.hidden = next !== 'album';
    this.map.hidden = next !== 'map';
    this.tasks.hidden = next !== 'tasks';
    this.callbacks.shopToggled(next !== null);

    if (next !== null) this.focusable(this.panelOf(next))[0]?.focus();
    // Мышью панель закрывают кликом, и подсвеченная кнопка после этого только
    // мешает; с пульта, наоборот, потерять фокус — значит потерять управление.
    else if (this.keyboardMode) this.openButton.focus();
    else (document.activeElement as HTMLElement | null)?.blur();
  }

  render(state: UiState): void {
    this.moneyEl.textContent = `${state.money} ${i18n.t('hud.money')}`;
    this.openButton.disabled = !state.canShop && this.open === null;
    this.albumButton.disabled = !state.canShop && this.open === null;
    this.mapButton.disabled = !state.canShop && this.open === null;
    this.albumButton.textContent = `${i18n.t('album.open')} ${state.album.discovered}/${state.album.total}`;

    this.lureRow.hidden = !state.canWatchAds;
    this.lureButton.textContent = state.boosts.isLureActive()
      ? i18n.t('lure.extend')
      : i18n.t('lure.watch');

    this.renderStore(state);
    this.renderQuest(state);
    this.renderTasks(state);
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

  /**
   * Блок покупок. Цену пишет площадка, а не игра: она знает и валюту игрока,
   * и региональные цены. Пока каталог не пришёл — блока нет вовсе.
   */
  private renderStore(state: UiState): void {
    const available = state.products.filter((product) => {
      const entry = state.store.all.find((item) => item.id === product.id);
      // Купленное непотребляемое из списка убираем: продавать его второй раз
      // нельзя, а показывать «куплено» в магазине — только мешать.
      return entry && !(entry.kind === 'durable' && state.store.isOwned(entry.id));
    });

    const signature = available.map((product) => `${product.id}:${product.price}`).join('|');
    if (signature === this.storeSignature) return;
    this.storeSignature = signature;

    this.storeList.hidden = available.length === 0;
    this.storeList.innerHTML = available
      .map((product) => {
        const entry = state.store.all.find((item) => item.id === product.id);
        if (!entry) return '';
        return `
          <div class="branch buy-row">
            <div class="branch-top">
              <span class="branch-name">${i18n.pick(entry.title)}</span>
              <span class="dots">${product.price}</span>
            </div>
            <div class="branch-hint">${i18n.pick(entry.note)}</div>
            <div class="branch-foot">
              <span class="branch-value"></span>
              <button class="btn buy" data-product="${entry.id}">${i18n.t('store.buy')}</button>
            </div>
          </div>`;
      })
      .join('');

    for (const button of this.storeList.querySelectorAll<HTMLButtonElement>('[data-product]')) {
      button.addEventListener('click', () => {
        const id = button.dataset.product;
        if (id) this.callbacks.buyProduct(id);
      });
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

  private renderTasks(state: UiState): void {
    const dailies = state.dailies;
    const quest = state.quests.active;

    const chain = quest
      ? `<div class="branch">
           <div class="branch-top">
             <span class="branch-name">${i18n.pick(quest.title)}</span>
             <span class="dots">${Math.floor(state.quests.current)}/${state.quests.target}</span>
           </div>
           <div class="branch-hint">${i18n.t('quest.chain')} · ${i18n.pick(quest.npc)}</div>
         </div>`
      : '';

    const rows = dailies.tasks
      .map((task) => {
        const progress = dailies.progressOf(task);
        const done = dailies.isDone(task);
        const claimed = dailies.isClaimed(task);
        const title = i18n.pick(task.title).replace('{count}', String(task.goal.count));
        const action = claimed
          ? `<span class="zone-here">${i18n.t('daily.taken')}</span>`
          : done
            ? `<button class="btn claim" data-task="${task.id}">${i18n.t('daily.claim')}</button>`
            : `<span class="branch-value">${progress}/${task.goal.count}</span>`;
        return `
          <div class="branch${claimed ? ' maxed' : ''}">
            <div class="branch-top">
              <span class="branch-name">${title}</span>
              <span class="dots">+${task.reward} ₽</span>
            </div>
            <div class="branch-foot">${action}</div>
          </div>`;
      })
      .join('');

    const streak = `<div class="album-bonus">${i18n.t('daily.streak', {
      days: dailies.currentStreak,
      mult: dailies.streakMultiplier.toFixed(2),
    })}</div>`;

    this.tasksList.innerHTML = streak + chain + rows;
    for (const button of this.tasksList.querySelectorAll<HTMLButtonElement>('.claim')) {
      button.addEventListener('click', () => {
        const id = button.dataset.task;
        if (id) this.callbacks.claimDaily(id);
      });
    }
  }

  private renderMap(state: UiState): void {
    const current = state.zones.current;
    this.mapList.innerHTML = state.zones.all
      .map((zone) => {
        const unlocked = state.zones.isUnlocked(zone, state.unlock);
        const here = zone.id === current.id;
        const requirement = describeUnlock(zone.unlock);
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
    // Трофеи стоят отдельным блоком: их не путают с обычным уловом и не
    // продают вместе с ним — главная путаница игроков в оригинале (docs/01).
    const trophies = BOSSES.map((boss) => {
      const taken = state.bosses.isDefeated(boss.id);
      return `
        <div class="album-item trophy${taken ? '' : ' unknown'}">
          <div class="album-name">${taken ? i18n.pick(boss.trophy) : '???'}</div>
          <div class="album-meta">${taken ? i18n.pick(boss.name) : i18n.t('album.noTrophy')}</div>
        </div>`;
    }).join('');

    const bonus = `
      <div class="album-bonus">${i18n.t('album.bonus', {
        percent: state.album.fillPercent.toFixed(0),
        price: Math.round((state.album.priceMultiplier - 1) * 100),
        line: Math.round((state.album.lineStrengthMultiplier - 1) * 100),
      })}</div>`;

    this.albumList.innerHTML =
      bonus +
      CATCH_ENTRIES.map((entry) => {
        const count = state.album.countOf(entry.id);
        const complete = state.album.isComplete(entry.id);
        const title = count > 0 ? entryName(entry) : '???';
        // Три слота вариантов: игрок сразу видит, чего не хватает до бонуса.
        const slots = RARITIES.map((rarity) => {
          const has = state.album.hasVariant(entry.id, rarity);
          return `<span class="slot ${rarity}${has ? ' has' : ''}"></span>`;
        }).join('');
        const note =
          count > 0 ? i18n.t('album.times', { count }) : i18n.t('album.unknown');
        return `
          <div class="album-item${count > 0 ? '' : ' unknown'}${complete ? ' complete' : ''}">
            <div class="album-name">${title}</div>
            <div class="album-meta">${i18n.t(`album.kind.${entry.kind}`)} · ${note}</div>
            <div class="album-slots">${slots}</div>
          </div>`;
      }).join('');

    this.albumList.insertAdjacentHTML(
      'beforeend',
      `<div class="album-section">${i18n.t('album.trophies')}</div>${trophies}`,
    );
  }
}

/** Человеческое описание условия открытия локации. */
function describeUnlock(unlock: { type: string; value: number; boss?: string }): string {
  if (unlock.type === 'boss') {
    const boss = BOSSES.find((entry) => entry.id === unlock.boss);
    return i18n.t('map.needBoss', { name: boss ? i18n.pick(boss.name) : '?' });
  }
  if (unlock.type === 'quests') return i18n.t('map.needQuests', { value: unlock.value });
  return i18n.t('map.needMoney', { value: unlock.value });
}

/** Куда двигать фокус по стрелке. Списки в панелях одноколоночные. */
const ARROW_STEP: Record<string, number | undefined> = {
  ArrowUp: -1,
  ArrowLeft: -1,
  ArrowDown: 1,
  ArrowRight: 1,
};

function must<T extends Element | HTMLElement | null>(node: T): HTMLElement {
  if (!node) throw new Error('Элемент интерфейса не найден');
  return node as HTMLElement;
}

/** Минуты и секунды: 4:05. */
function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Целые показываем без хвоста, дробные — с одним знаком. */
function format(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, '');
}
