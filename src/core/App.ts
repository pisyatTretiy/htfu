import { ACESFilmicToneMapping, PCFSoftShadowMap, WebGLRenderer } from 'three';
import { resolveQuality, type QualityProfile } from './Quality';
import type { IPlatform } from '../platform';
import { FishingScene3D } from '../scene3d/FishingScene3D';
import { PerfHud } from '../debug/PerfHud';
import { GameUi } from '../ui/GameUi';
import { Progression, type BranchId, type Effects } from '../meta/Progression';
import { Album } from '../meta/Album';
import { Quests, type Quest } from '../meta/Quests';
import { Zones, zoneCatchIds } from '../meta/Zones';
import { Bosses, bossAsCatch } from '../meta/Bosses';
import { SaveService, emptySave, type GameSave } from '../services/SaveService';
import { i18n } from '../services/I18n';
import { AudioService } from '../services/AudioService';
import { AdManager } from '../services/AdManager';
import type { CatchEntry, FightPhase } from '../content/types';
import type { Rarity } from '../gameplay/Rarity';

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
  private readonly audio = new AudioService();
  private readonly save: SaveService;
  private readonly ads: AdManager;
  private state: GameSave = emptySave();
  private lastReward = 0;

  constructor(private readonly platform: IPlatform) {
    this.save = new SaveService(platform);
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
    });
    this.scene.applyZone(this.zones.current);
    this.resize();

    this.ui = new GameUi(
      {
        buy: (id) => this.buy(id),
        travel: (id) => void this.travel(id),
        shopToggled: (open) => {
          this.scene.paused = open;
          if (open) this.platform.gameplayStop();
          else this.platform.gameplayStart();
        },
      },
      this.progression,
    );
    this.renderUi();

    this.bindInput();
    this.bindFocus();

    this.hud = new PerfHud(this.quality, () => ({
      sprites: countNodes(this.scene),
      rows: this.scene.metrics,
    }));

    this.running = true;
    this.platform.ready();
    this.platform.gameplayStart();
    document.getElementById('boot')?.classList.add('hidden');

    this.lastFrame = performance.now();
    requestAnimationFrame((now) => this.frame(now));
  }

  private frame(now: number): void {
    requestAnimationFrame((next) => this.frame(next));
    const delta = now - this.lastFrame;
    this.lastFrame = now;
    if (!this.running) return;

    const lastState = this.scene.state;
    this.scene.update(delta);
    this.renderer.render(this.scene.scene, this.scene.camera);
    this.hud?.update(delta);

    this.updateGauge();

    const reached = this.quests.onDepth(this.scene.debugSnapshot.depth);
    if (reached) {
      this.completeQuest(reached);
      this.persist();
    }
    if (this.scene.state !== lastState) this.renderUi();

    window.__htfu = {
      ...this.scene.debugSnapshot,
      money: this.state.money,
      upgrades: this.progression.serialize(),
      shopOpen: this.ui.isShopOpen,
      zone: this.zones.current.id,
      trophies: this.bosses.trophyCount,
      platform: this.platform.name,
      lastReward: this.lastReward,
    };
  }

  /** Полоса состояния под прицелом: заброс, бой или возня в лодке. */
  private updateGauge(): void {
    const snapshot = this.scene.debugSnapshot;
    if (this.scene.chargePower > 0) {
      this.ui.setGauge('power', this.scene.chargePower);
    } else if (snapshot.state === 'fighting') {
      this.ui.setGauge('tension', snapshot.tension, 1 - snapshot.stamina);
    } else if (snapshot.state === 'onboard') {
      this.ui.setGauge('patience', snapshot.patience);
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
  }

  /** Эффекты снасти плюс постоянные бонусы за заполнение альбома. */
  private get effects(): Effects {
    const base = this.progression.effects;
    return { ...base, lineStrength: base.lineStrength * this.album.lineStrengthMultiplier };
  }

  private rollBoss(): { entry: CatchEntry; phases: FightPhase[]; taunt: string } | null {
    const zone = this.zones.current;
    if (!this.bosses.isReady(zone.id)) return null;
    const boss = this.bosses.bossOf(zone.id);
    if (!boss) return null;
    return { entry: bossAsCatch(boss), phases: boss.phases, taunt: i18n.pick(boss.taunt) };
  }

  private defeatBoss(bossId: string): void {
    const boss = this.bosses.bossOf(this.zones.current.id);
    if (!boss || boss.id !== bossId) return;

    this.bosses.defeat(bossId);
    this.state.money += boss.reward;
    this.album.record(bossId, 'common');
    showToast(i18n.t('toast.boss', { name: i18n.pick(boss.name), trophy: i18n.pick(boss.trophy) }));
    this.persist();
  }

  private collect(entry: CatchEntry, reward: number, rarity: Rarity): void {
    const total = Math.round(
      reward * this.album.priceMultiplier * this.album.priceMultiplierFor(entry.id),
    );
    this.state.money += total;
    this.bosses.countCatch(this.zones.current.id);
    this.lastReward = total;
    this.audio.play('coin');

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

  private completeQuest(quest: Quest): void {
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

    this.scene.resetToSurface();
    this.scene.applyZone(zone);
    showToast(i18n.pick(zone.name));
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
    this.save.save(this.state);
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
      unlock: this.unlockContext,
      canShop: this.scene.state === 'idle',
    });
  }

  // --- ввод и фокус --------------------------------------------------------

  private resize(): void {
    const width = innerWidth;
    const height = innerHeight;
    this.renderer.setSize(width, height, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
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
      if (event.key === 'ArrowLeft') this.scene.look(-14, 0);
      if (event.key === 'ArrowRight') this.scene.look(14, 0);
      if (event.key === 'ArrowUp') this.scene.look(0, -10);
      if (event.key === 'ArrowDown') this.scene.look(0, 10);
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
