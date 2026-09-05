import { ACESFilmicToneMapping, PCFSoftShadowMap, WebGLRenderer } from 'three';
import { chooseTier, resolveQuality, type QualityProfile } from './Quality';
import type { IPlatform } from '../platform';
import { FishingScene3D } from '../scene3d/FishingScene3D';
import { PerfHud } from '../debug/PerfHud';
import { GameUi } from '../ui/GameUi';
import { Progression, type BranchId, type Effects } from '../meta/Progression';
import { Album } from '../meta/Album';
import { Quests, type Quest } from '../meta/Quests';
import { Zones, zoneCatchIds } from '../meta/Zones';
import { Bosses, bossAsCatch } from '../meta/Bosses';
import { Dailies, type DailyTask } from '../meta/Dailies';
import { Onboarding, type OnboardingContext } from '../meta/Onboarding';
import { Boosts, LURE_MINUTES } from '../meta/Boosts';
import { Store } from '../meta/Store';
import { productById } from '../content/products';
import type { Product } from '../platform';
import { SaveService, emptySave, type GameSave } from '../services/SaveService';
import { i18n } from '../services/I18n';
import { AudioService } from '../services/AudioService';
import { AdManager } from '../services/AdManager';
import { Leaderboards } from '../services/Leaderboards';
import type { CatchEntry, FightPhase } from '../content/types';
import type { Rarity } from '../gameplay/Rarity';

/** Предел вытянутости поля: требование площадки к активной области. */
const MAX_ASPECT = 2;

/** Касание короче этого и без сдвига считается тапом, а не свайпом. */
const TAP_MS = 200;
const TAP_SLOP = 10;

export type DebugSnapshot = FishingScene3D['debugSnapshot'] & {
  money: number;
  upgrades: Record<string, number>;
  shopOpen: boolean;
  zone: string;
  trophies: number;
  platform: string;
  lastReward: number;
  /** Шаг обучения: автотест проверяет, что подсказки закрываются игрой. */
  onboarding: number;
};

declare global {
  interface Window {
    /** Тестовый шов для tools/capture.ts. Читается только автотестом. */
    __htfu?: DebugSnapshot | undefined;
  }
}

/**
 * Бутстрап: рендерер, цикл, ввод, пауза по потере фокуса.
 *
 * Пауза геймплея при уходе из вкладки — требование площадки и частая причина
 * отказа модерации, поэтому живёт в ядре.
 */
export class App {
  private renderer!: WebGLRenderer;
  private readonly quality: QualityProfile = resolveQuality();
  private scene!: FishingScene3D;
  private hud?: PerfHud;
  private ui!: GameUi;
  private running = false;
  private lastFrame = 0;

  private readonly progression = new Progression();
  private readonly album = new Album();
  private readonly quests = new Quests();
  private readonly zones = new Zones();
  private readonly bosses = new Bosses();
  private readonly dailies = new Dailies();
  private readonly onboarding = new Onboarding();
  private readonly boosts = new Boosts();
  private readonly store = new Store();
  private products: Product[] = [];
  private readonly audio = new AudioService();
  private readonly save: SaveService;
  private readonly boards: Leaderboards;
  private readonly ads: AdManager;
  private state: GameSave = emptySave();
  /**
   * Состояние сцены на конец прошлого кадра. Сравнивать надо именно с ним:
   * заброс и подсечка меняют состояние из обработчика ввода, то есть между
   * кадрами, и локальная переменная внутри кадра такой переход не увидит.
   */
  private lastSceneState = 'idle';
  private lastReward = 0;
  /**
   * Серия уловов подряд. Ниша «риск ради награды» вместо вырезанного
   * гэмблинга (docs/03, § 3.5): множитель растёт с каждым уловом и
   * обнуляется обрывом. Живёт в сессии, а не в сейве: перезагрузка — это
   * не «продолжить серию», а начать заново.
   */
  private streak = 0;
  /** Оценку просим не чаще одного раза за сессию. */
  private reviewAsked = false;

  constructor(private readonly platform: IPlatform) {
    this.save = new SaveService(platform);
    this.boards = new Leaderboards(platform);
    this.ads = new AdManager(platform, {
      pause: () => {
        this.scene.paused = true;
        this.audio.setMuted(true);
        this.platform.gameplayStop();
      },
      resume: () => {
        this.audio.setMuted(false);
        this.platform.gameplayStart();
        this.scene.paused = this.ui.isShopOpen;
      },
      flush: () => this.save.flush(),
    });
  }

  async start(): Promise<void> {
    const host = document.getElementById('app');
    if (!host) throw new Error('#app не найден в разметке');

    this.renderer = new WebGLRenderer({ antialias: this.quality.filters, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality.maxResolution));
    // Тени — примета стиля, но и самая дорогая его часть: на бюджетном
    // профиле выключаем целиком.
    this.renderer.shadowMap.enabled = this.quality.filters;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    // Без тонмаппинга плоские материалы выгорают в белое на солнце и
    // проваливаются в грязь в тени: картинка читается «пластиковой».
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    host.appendChild(this.renderer.domElement);

    i18n.setLang(this.platform.lang());
    // Экран загрузки нарисован в разметке и до этой строки говорит по-русски.
    const bootTitle = document.querySelector('#boot .t');
    if (bootTitle) bootTitle.textContent = i18n.t('boot.title');
    await this.restore();

    this.scene = new FishingScene3D({
      toast: (text) => showToast(text),
      sfx: (name) => this.audio.play(name),
      zoneCatches: () => zoneCatchIds(this.zones.current),
      zoneDepth: () => this.zones.current.maxDepth,
      bossBite: () => this.rollBoss(),
      onBoss: (id) => this.defeatBoss(id),
      onBossEscaped: () => {
        this.bosses.escaped(this.zones.current.id);
        this.persist();
      },
      effects: () => this.effects,
      onCatch: (entry, reward, rarity) => this.collect(entry, reward, rarity),
      onLost: (entry, isBoss) => this.offerRetry(entry, isBoss),
    });
    this.scene.applyZone(this.zones.current);
    this.resize();

    this.ui = new GameUi(
      {
        buy: (id) => this.buy(id),
        travel: (id) => void this.travel(id),
        claimDaily: (id) => this.claimDaily(id),
        watchLure: () => void this.buyLure(),
        buyProduct: (id) => void this.buyProduct(id),
        toggleSound: () => this.audio.toggle(),
        toggleQuality: () => {
          // Рендерер, тени и сетка воды собираются один раз, поэтому профиль
          // применяется перезагрузкой — сейв к этому моменту уже на диске.
          chooseTier(this.quality.tier === 'high' ? 'low' : 'high');
          void this.save.flush().finally(() => location.reload());
        },
        shopToggled: (open) => {
          this.scene.paused = open;
          if (open) this.platform.gameplayStop();
          else this.platform.gameplayStart();
          // Открытая панель — это мета-экран, единственное место для баннера.
          void this.ads.banner(open);
        },
      },
      this.progression,
    );
    this.ui.setSound(this.audio.silent);
    this.renderUi();

    this.bindInput();
    this.bindFocus();
    this.bindContextLoss();

    this.hud = new PerfHud(this.quality, () => ({
      sprites: countNodes(this.scene),
      rows: [
        ...this.scene.metrics,
        // Вызовы отрисовки — то, во что упирается бюджетный телефон раньше,
        // чем в число треугольников.
        ['вызовов', String(this.renderer.info.render.calls)],
        ['треугольников', String(this.renderer.info.render.triangles)],
      ],
    }));

    // На телевизоре указателя нет: фокус сразу в верхнем ряду, иначе до
    // магазина и карты с пульта не добраться.
    if (this.platform.isTV()) this.ui.focusTopbar();

    // Покупки: каталог и незавершённые оплаты разбираем сразу после запуска,
    // но не блокируем ими первый кадр — площадка отвечает не мгновенно.
    void this.loadStore();

    this.running = true;
    this.platform.ready();
    this.platform.gameplayStart();
    document.getElementById('boot')?.classList.add('hidden');

    this.lastFrame = performance.now();
    requestAnimationFrame((now) => this.frame(now));
  }

  private async loadStore(): Promise<void> {
    if (this.platform.isTV()) return;
    this.products = await this.platform.products().catch(() => []);
    this.renderUi();
    await this.redeemPending();
  }

  private frame(now: number): void {
    requestAnimationFrame((next) => this.frame(next));
    const delta = now - this.lastFrame;
    this.lastFrame = now;
    if (!this.running) return;

    this.scene.update(delta);
    this.renderer.render(this.scene.scene, this.scene.camera);
    this.hud?.update(delta);

    this.updateGauge();

    const depth = this.scene.debugSnapshot.depth;
    const reached = this.quests.onDepth(depth);
    if (reached) {
      this.completeQuest(reached);
      this.persist();
    }
    for (const task of this.dailies.onDepth(depth)) {
      showToast(i18n.t('daily.done', { title: this.dailyTitle(task) }));
      this.persist();
    }
    if (this.scene.state !== this.lastSceneState) {
      const from = this.lastSceneState;
      this.lastSceneState = this.scene.state;
      this.onSceneState(from, this.scene.state);
      this.renderUi();
    }
    this.updateHint();
    this.ui.setLure(this.boosts.secondsLeft());

    window.__htfu = {
      ...this.scene.debugSnapshot,
      money: this.state.money,
      upgrades: this.progression.serialize(),
      shopOpen: this.ui.isShopOpen,
      zone: this.zones.current.id,
      trophies: this.bosses.trophyCount,
      platform: this.platform.name,
      lastReward: this.lastReward,
      onboarding: this.onboarding.serialize().step,
    };
  }

  /** Полоса состояния под прицелом: заброс, бой или возня в лодке. */
  private updateGauge(): void {
    const snapshot = this.scene.debugSnapshot;
    if (this.scene.chargePower > 0) {
      this.ui.setGauge('power', this.scene.chargePower);
    } else if (snapshot.state === 'fighting') {
      this.ui.setGauge('tension', snapshot.tension, 1 - snapshot.stamina, snapshot.danger);
    } else if (snapshot.state === 'onboard') {
      this.ui.setGauge('patience', snapshot.patience);
    } else if (snapshot.state === 'sinking' || snapshot.state === 'flying') {
      // Глубина решает, что клюнет, и упирается в длину лески — но до сих пор
      // игрок видел её только в отладочном HUD.
      const limit = Math.max(1, Math.round(snapshot.depthLimit));
      this.ui.setGauge(
        'depth',
        snapshot.depth / limit,
        0,
        0,
        i18n.t('gauge.depth', { depth: Math.round(snapshot.depth), limit }),
      );
    } else {
      this.ui.setGauge('none', 0);
    }
  }

  // --- прогресс ------------------------------------------------------------

  private async restore(): Promise<void> {
    this.state = await this.save.load();
    this.progression.restore(this.state.upgrades as Record<BranchId, number>);
    this.album.restore(this.state.album);
    this.quests.restore(this.state.quests);
    this.zones.restore(this.state.zone);
    this.bosses.restore(this.state.bosses);
    this.dailies.restore(this.state.dailies);
    this.onboarding.restore(this.state.onboarding);
    this.boosts.restore(this.state.boosts);
    this.store.restore(this.state.store);
    this.ads.setAdFree(this.store.noAds);
  }

  /**
   * Обучение слушает те же переходы состояний, что и всё остальное: отдельных
   * скриптовых сцен нет, поэтому обучение невозможно рассинхронизировать с игрой.
   */
  private onSceneState(from: string, to: string): void {
    let moved = false;
    if (from === 'idle' && to === 'flying') moved = this.onboarding.signal('cast') || moved;
    if (to === 'fighting') moved = this.onboarding.signal('bite') || moved;
    if (from === 'fighting' && to === 'reeling') {
      moved = this.onboarding.signal('snapped') || moved;
    }
    if (from === 'onboard' && to !== 'onboard') {
      moved = this.onboarding.signal('subdued') || moved;
    }
    // Обучение переживает F5 наравне с деньгами: повторять пройденный шаг
    // после перезагрузки — худшее, что может сделать обучение.
    if (moved) this.persist();
  }

  /** Одна строка подсказки под заданием — или ничего. */
  private updateHint(): void {
    const text = this.onboarding.hint(this.onboardingContext);
    this.ui.setHint(text ? i18n.pick(text) : null);
  }

  private get onboardingContext(): OnboardingContext {
    const money = this.state.money;
    const canAfford = this.progression.branches.some((branch) => {
      const price = this.progression.nextPrice(branch.id);
      return price !== null && price <= money;
    });
    const context = this.unlockContext;
    const hasNewZone = this.zones.all.some(
      (zone) => zone.id !== this.zones.current.id && this.zones.isUnlocked(zone, context),
    );
    return {
      state: this.scene.state,
      canAfford,
      hasNewZone,
      panelOpen: this.ui.isShopOpen,
    };
  }

  /** Эффекты снасти плюс постоянные бонусы альбома и временные — приманки. */
  private get effects(): Effects {
    const base = this.progression.effects;
    // Особенность локации входит в те же эффекты, что снасть и альбом: на
    // морозе леска дубеет, и это честный множитель, а не отдельное правило.
    const zone = this.zones.current.modifiers?.lineStrength ?? 1;
    return {
      ...base,
      lineStrength: base.lineStrength * this.album.lineStrengthMultiplier * zone,
      luck: this.boosts.luck(),
    };
  }

  /**
   * Вторая попытка за ролик (docs/03, § 3.7).
   *
   * Только для обычного улова: у босса свой откат — счётчик уловов до
   * следующей встречи, и подменять его роликом значило бы продавать босса.
   */
  private offerRetry(entry: CatchEntry, isBoss: boolean): void {
    // Обрыв сбрасывает серию — в этом и смысл риска.
    this.streak = 0;
    this.renderUi();
    if (isBoss || this.platform.isTV() || !this.scene.canRetry) return;
    this.ui.offerReward(i18n.t('offer.retry', { name: i18n.pick(entry.name) }), 5, () =>
      void this.doRetry(),
    );
  }

  private async doRetry(): Promise<void> {
    if (!this.scene.canRetry) return;
    const watched = await this.ads.rewarded('retry_catch');
    if (!watched) return;
    this.scene.retryLost();
  }

  /**
   * Выдать всё оплаченное, но не выданное. Вызывается при каждом запуске —
   * без этого модерация не пропускает: игрок мог закрыть вкладку между
   * оплатой и выдачей, и тогда деньги ушли, а товар не пришёл.
   */
  private async redeemPending(): Promise<void> {
    const pending = await this.platform.pendingPurchases().catch(() => []);
    let changed = false;

    for (const purchase of pending) {
      const granted = this.store.redeem(purchase);
      if (granted.money > 0) {
        this.state.money += granted.money;
        changed = true;
      }
      for (let level = 0; level < granted.rod; level++) this.progression.levelUp('rod');
      if (granted.rod > 0) changed = true;
      if (granted.noAds) {
        this.ads.setAdFree(true);
        changed = true;
      }
      // Списываем только расходуемое и только после начисления: если списание
      // не пройдёт, покупка вернётся при следующем запуске и игрок получит
      // своё второй раз — это лучше, чем не получить вовсе.
      if (granted.consume) await this.platform.consumePurchase(purchase.token);

      const product = productById(purchase.productId);
      if (product && (granted.money > 0 || granted.rod > 0 || granted.noAds)) {
        showToast(i18n.t('store.granted', { name: i18n.pick(product.title) }));
      }
    }

    if (changed) this.persist();
  }

  /** Покупка из магазина площадки. Отмену игрока отличать не нужно: товара просто нет. */
  private async buyProduct(id: string): Promise<void> {
    if (this.platform.isTV()) return;
    const purchase = await this.platform.purchase(id);
    if (!purchase) return;
    // Выдаём не из ответа, а общим путём: так покупка, потерянная на полпути,
    // и покупка прямо сейчас обрабатываются одним и тем же кодом.
    await this.redeemPending();
  }

  /** Приманка за ролик: пять минут повышенного шанса редкого варианта. */
  private async buyLure(): Promise<void> {
    const watched = await this.ads.rewarded('lure');
    if (!watched) return;
    this.boosts.activateLure();
    this.audio.play('coin');
    showToast(i18n.t('toast.lure', { minutes: LURE_MINUTES }));
    this.persist();
  }

  private rollBoss(): {
    entry: CatchEntry;
    phases: FightPhase[];
    taunt: string;
    patience?: number;
  } | null {
    const zone = this.zones.current;
    if (!this.bosses.isReady(zone.id)) return null;
    const boss = this.bosses.bossOf(zone.id);
    if (!boss) return null;
    // Босс клюнул именно сейчас: сцена вызывает этот метод в момент поклёвки.
    this.ui.showCard(i18n.t('boss.tag'), i18n.pick(boss.name));
    this.audio.play('boss');

    return {
      entry: bossAsCatch(boss),
      phases: boss.phases,
      taunt: i18n.pick(boss.taunt),
      ...(boss.patience === undefined ? {} : { patience: boss.patience }),
    };
  }

  private defeatBoss(bossId: string): void {
    const boss = this.bosses.bossOf(this.zones.current.id);
    if (!boss || boss.id !== bossId) return;

    this.bosses.defeat(bossId);
    this.state.money += boss.reward;
    this.album.record(bossId, 'common');
    // Победа над боссом заслуживает того же кадра, что и его появление.
    this.ui.showCard(i18n.t('boss.won'), i18n.pick(boss.trophy), 'trophy');
    // Карточка уже назвала трофей во весь кадр — всплывающая строка повторяла
    // её слово в слово и вдобавок наезжала на неё. Здесь остаётся то, чего в
    // карточке нет: сколько за него заплатили. Имя босса не повторяем и
    // потому, что в русском оно требует падежа, которого у названия нет.
    showToast(i18n.t('toast.boss', { reward: String(boss.reward) }));
    this.persist();
    // Карточка трофея висит две с половиной секунды — окно оценки после неё.
    setTimeout(() => void this.askReview(), 3200);
  }

  private collect(entry: CatchEntry, reward: number, rarity: Rarity): void {
    this.streak += 1;
    const total = Math.round(
      reward *
        this.album.priceMultiplier *
        this.album.priceMultiplierFor(entry.id) *
        this.streakMultiplier,
    );
    this.state.money += total;
    this.bosses.countCatch(this.zones.current.id);
    this.lastReward = total;
    // Редкий вариант слышно: обычный звенит монетой, редкий и золотой —
    // тремя нотами вверх. Иначе о редкости узнают из строки в альбоме.
    this.audio.play(rarity === 'common' ? 'coin' : 'rare');

    // Дневные дела двигаются от того же события, что и альбом с квестами.
    const wasSubdued = entry.mischief !== 'none';
    for (const task of this.dailies.onCatch(entry, rarity, total, wasSubdued)) {
      showToast(i18n.t('daily.done', { title: this.dailyTitle(task) }));
    }
    if (this.scene.trickShot) {
      for (const task of this.dailies.onTrickShot()) {
        showToast(i18n.t('daily.done', { title: this.dailyTitle(task) }));
      }
    }
    if (total > this.state.bestCatch) {
      this.state.bestCatch = total;
      this.boards.submit('best_catch', total);
    }

    this.onboarding.signal('landed');

    const record = this.album.record(entry.id, rarity);
    if (record.speciesCompleted) {
      showToast(i18n.t('toast.speciesDone', { name: i18n.pick(entry.name) }));
    } else if (record.firstEver) showToast(i18n.t('toast.newSpecies'));
    else if (record.firstVariant) showToast(i18n.t('toast.newVariant'));

    const finished = this.quests.onCatch(entry);
    if (finished) this.completeQuest(finished);
    this.persist();

    if (total > 0 && !this.platform.isTV()) {
      this.ui.offerReward(i18n.t('offer.double', { reward: total }), 6, () =>
        void this.doubleReward(total),
      );
    }
  }

  /**
   * Попросить оценку — один раз за сессию и только на подъёме.
   *
   * Рейтинг ниже 30 снимает игру с публикации, но выпрашивать оценку вернее
   * всего его и уронит. Поэтому спрашиваем после победы над боссом — в момент,
   * когда игрок доволен, — и только если площадка разрешает.
   */
  private async askReview(): Promise<void> {
    if (this.reviewAsked || this.platform.isTV()) return;
    this.reviewAsked = true;
    if (!(await this.platform.canReview())) return;
    await this.platform.requestReview();
  }

  /** Множитель серии: +5 % за улов подряд, потолок +50 %. */
  private get streakMultiplier(): number {
    return 1 + Math.min(0.5, Math.max(0, this.streak - 1) * 0.05);
  }

  /** Название дела с подставленным числом из цели. */
  private dailyTitle(task: DailyTask): string {
    return i18n.pick(task.title).replace('{count}', String(task.goal.count));
  }

  private claimDaily(id: string): void {
    const task = this.dailies.tasks.find((entry) => entry.id === id);
    if (!task) return;

    const reward = this.dailies.claim(task);
    if (reward <= 0) return;

    this.state.money += reward;
    this.audio.play('coin');
    showToast(i18n.t('daily.claimed', { reward, streak: this.dailies.currentStreak }));
    this.persist();

    // Сундук: одно утроение в сутки и только сверх уже полученной награды.
    if (this.dailies.chestAvailable && !this.platform.isTV()) {
      this.ui.offerReward(i18n.t('offer.chest', { reward: reward * 2 }), 7, () =>
        void this.openChest(reward),
      );
    }
  }

  private async openChest(reward: number): Promise<void> {
    if (!this.dailies.chestAvailable) return;
    const watched = await this.ads.rewarded('daily_chest');
    if (!watched || !this.dailies.takeChest()) return;

    const bonus = reward * 2;
    this.state.money += bonus;
    this.audio.play('coin');
    showToast(i18n.t('toast.chest', { reward: bonus }));
    this.persist();
  }

  private completeQuest(quest: Quest): void {
    this.onboarding.signal('quest');
    this.state.money += quest.reward;
    this.audio.play('coin');
    showToast(i18n.t('quest.reward', { title: i18n.pick(quest.title), reward: quest.reward }));
  }

  private async doubleReward(reward: number): Promise<void> {
    const watched = await this.ads.rewarded('double_catch');
    if (!watched) return;
    this.state.money += reward;
    this.audio.play('coin');
    showToast(i18n.t('toast.doubled', { reward }));
    this.persist();
  }

  private buy(id: BranchId): void {
    const price = this.progression.nextPrice(id);
    if (price === null || this.state.money < price) return;

    this.state.money -= price;
    this.progression.levelUp(id);
    this.onboarding.signal('bought');
    const branch = this.progression.branches.find((entry) => entry.id === id);
    showToast(
      i18n.t('toast.bought', {
        name: branch ? i18n.pick(branch.name) : id,
        level: this.progression.levelOf(id) + 1,
      }),
    );
    this.persist();
  }

  /** Переезд в другую локацию: между сессиями — законное место для рекламы. */
  private async travel(id: string): Promise<void> {
    const zone = this.zones.all.find((entry) => entry.id === id);
    if (!zone || zone.id === this.zones.current.id) return;
    if (!this.zones.travelTo(id, this.unlockContext)) return;

    this.ui.toggle(null);
    await this.ads.interstitial();

    this.onboarding.signal('traveled');
    this.scene.resetToSurface();
    this.scene.applyZone(zone);
    // Приезд в новую воду — событие: карточка с названием и особенностью
    // локации вместо всплывающей строки, которую легко пропустить.
    this.ui.showCard(i18n.pick(zone.note), i18n.pick(zone.name), 'zone');
    this.audio.play('splash');
    this.persist();
  }

  private get unlockContext(): { money: number; questsDone: number; trophies: string[] } {
    return {
      money: this.state.money,
      questsDone: this.quests.completedCount,
      trophies: this.bosses.serialize().trophies,
    };
  }

  private persist(): void {
    this.state.upgrades = this.progression.serialize();
    this.state.album = this.album.serialize();
    this.state.quests = this.quests.serialize();
    this.state.zone = this.zones.serialize();
    this.state.bosses = this.bosses.serialize();
    this.state.dailies = this.dailies.serialize();
    this.state.onboarding = this.onboarding.serialize();
    this.state.boosts = this.boosts.serialize();
    this.state.store = this.store.serialize();
    this.save.save(this.state);
    // Таблицы лидеров двигаются от тех же событий, что и сейв. Очередь сама
    // разложит их по одной в полторы секунды: у площадки лимит.
    this.boards.submit('wealth', this.state.money);
    this.boards.submit('album', this.album.fillPercent);
    this.renderUi();
  }

  private renderUi(): void {
    this.ui.render({
      money: this.state.money,
      progression: this.progression,
      album: this.album,
      quests: this.quests,
      zones: this.zones,
      bosses: this.bosses,
      dailies: this.dailies,
      boosts: this.boosts,
      store: this.store,
      products: this.products,
      canWatchAds: !this.platform.isTV(),
      streakMultiplier: this.streakMultiplier,
      soundMuted: this.audio.silent,
      qualityHigh: this.quality.tier === 'high',
      unlock: this.unlockContext,
      canShop: this.scene.state === 'idle',
    });
  }

  // --- ввод и фокус --------------------------------------------------------

  /**
   * Размер поля игры.
   *
   * Площадка требует, чтобы длинная сторона активного поля не превышала
   * короткую больше чем вдвое. На сверхшироком мониторе (21:9 и шире) окно
   * этого условия не выполняет, поэтому поле ограничивается по ширине и
   * центрируется — по краям остаётся фон страницы, а не растянутая сцена.
   */
  private resize(): void {
    const height = innerHeight;
    const width = Math.min(innerWidth, Math.round(height * MAX_ASPECT));
    this.renderer.setSize(width, height, false);

    const canvas = this.renderer.domElement;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const left = Math.round((innerWidth - width) / 2);
    canvas.style.left = `${left}px`;
    // Интерфейс живёт в тех же границах, что и поле: иначе на сверхшироком
    // мониторе кошелёк уезжает в один край экрана, а «Снасти» — в другой.
    const root = document.documentElement.style;
    root.setProperty('--field-w', `${width}px`);
    root.setProperty('--field-x', `${left}px`);
    this.scene.setViewport(width, height);
  }

  private bindInput(): void {
    const canvas = this.renderer.domElement;
    addEventListener('resize', () => this.resize());
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    let pressedAt = 0;
    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let moved = false;
    let down = false;

    canvas.addEventListener('pointerdown', (event) => {
      this.audio.unlock();
      down = true;
      moved = false;
      pressedAt = performance.now();
      startX = lastX = event.clientX;
      startY = lastY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      if (!this.ui.isShopOpen) this.scene.pressStart(event.clientX, event.clientY);
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!down) return;
      const dx = event.clientX - lastX;
      const dy = event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
      if (Math.abs(event.clientX - startX) + Math.abs(event.clientY - startY) > TAP_SLOP) {
        moved = true;
      }
      // Один палец: то же движение крутит камеру и рулит крючком под водой.
      this.scene.look(dx, dy);
    });

    const release = (event: PointerEvent): void => {
      if (!down) return;
      down = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      this.scene.pressEnd(!moved && performance.now() - pressedAt < TAP_MS);
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    let spaceHeld = false;
    addEventListener('keydown', (event) => {
      this.audio.unlock();
      if (event.code === 'Space' && !spaceHeld) {
        spaceHeld = true;
        this.scene.pressStart(innerWidth / 2, innerHeight / 2);
        event.preventDefault();
      }
      // Стрелки целятся, только пока их не забрал интерфейс: на телевизоре
      // теми же стрелками ходят по кнопкам.
      if (!this.ui.consumesArrows) {
        if (event.key === 'ArrowLeft') this.scene.look(-14, 0);
        if (event.key === 'ArrowRight') this.scene.look(14, 0);
        if (event.key === 'ArrowUp') this.scene.look(0, -10);
        if (event.key === 'ArrowDown') this.scene.look(0, 10);
      }
      if (event.key === 'r' || event.key === 'R') this.scene.reel();
      if (event.key === 'l' || event.key === 'L') freezeMainThread(250);
    });
    addEventListener('keyup', (event) => {
      if (event.code === 'Space') {
        spaceHeld = false;
        this.scene.pressEnd(false);
      }
    });
  }

  /**
   * Потеря контекста WebGL.
   *
   * На телефоне это не экзотика: вкладка полежала в фоне, браузер забрал
   * видеопамять — и дальше рендерер рисует в никуда. Без обработки игрок
   * видит замерший кадр и уходит. Прогресс сбрасываем на диск сразу, а
   * восстановление делаем перезагрузкой: пересобирать все буферы сцены
   * дороже и рискованнее, чем начать кадр заново с сохранённого места.
   */
  private bindContextLoss(): void {
    const canvas = this.renderer.domElement;
    const overlay = document.getElementById('lost');
    const text = document.getElementById('lost-text');
    const button = document.getElementById('lost-reload');

    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      this.running = false;
      this.audio.setMuted(true);
      this.platform.gameplayStop();
      void this.save.flush();

      if (text) text.textContent = i18n.t('lost.text');
      if (button) button.textContent = i18n.t('lost.reload');
      overlay?.removeAttribute('hidden');
    });

    button?.addEventListener('click', () => location.reload());
    canvas.addEventListener('webglcontextrestored', () => location.reload());
  }

  private bindFocus(): void {
    const suspend = (): void => {
      if (!this.running) return;
      this.running = false;
      this.platform.gameplayStop();
    };
    const resume = (): void => {
      if (this.running) return;
      this.running = true;
      this.lastFrame = performance.now();
      this.platform.gameplayStart();
    };

    document.addEventListener('visibilitychange', () => (document.hidden ? suspend() : resume()));
    addEventListener('blur', suspend);
    addEventListener('focus', resume);

    addEventListener('pagehide', () => void this.save.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.save.flush();
    });
  }
}

/** Объектов в сцене — грубая, но честная метрика нагрузки. */
function countNodes(scene: FishingScene3D): number {
  let total = 0;
  scene.scene.traverse(() => {
    total += 1;
  });
  return total;
}

/** Искусственный фриз главного потока: проверка устойчивости симуляции. */
function freezeMainThread(ms: number): void {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    // Намеренная блокировка: воспроизводим фриз вкладки.
  }
  console.info(`[debug] главный поток заморожен на ${ms} мс`);
}

let toastTimer = 0;
function showToast(text: string): void {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1400) as unknown as number;
}
