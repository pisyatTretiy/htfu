import { Application, Container } from 'pixi.js';
import { resolveQuality, type QualityProfile } from './Quality';
import type { IPlatform } from '../platform';
import { FishingScene } from '../scenes/FishingScene';
import type { CatchEntry } from '../content/types';
import type { Quest } from '../meta/Quests';
import { PerfHud } from '../debug/PerfHud';
import { GameUi } from '../ui/GameUi';
import { Progression, type BranchId } from '../meta/Progression';
import { Album } from '../meta/Album';
import { Quests } from '../meta/Quests';
import { SaveService, emptySave, type GameSave } from '../services/SaveService';
import { i18n } from '../services/I18n';
import { AudioService } from '../services/AudioService';
import { AdManager } from '../services/AdManager';

export type DebugSnapshot = FishingScene['debugSnapshot'] & {
  money: number;
  upgrades: Record<string, number>;
  shopOpen: boolean;
  platform: string;
  lastReward: number;
};

declare global {
  interface Window {
    /** Тестовый шов для tools/capture.ts. Читается только автотестом. */
    __htfu?: DebugSnapshot | undefined;
  }
}

/** Касание короче этого и без сдвига считается тапом, а не свайпом. */
const TAP_MS = 200;
const TAP_SLOP = 10;

/**
 * Бутстрап приложения: рендерер, ресайз, ввод, пауза по потере фокуса.
 *
 * Пауза геймплея при уходе из вкладки — требование площадки и частая причина
 * отказа модерации, поэтому живёт в ядре с первого дня.
 */
export class App {
  private readonly pixi = new Application();
  private readonly quality: QualityProfile = resolveQuality();
  private scene!: FishingScene;
  private hud?: PerfHud;
  private ui!: GameUi;
  private running = false;

  private readonly progression = new Progression();
  private readonly album = new Album();
  private readonly quests = new Quests();
  private readonly audio = new AudioService();
  private readonly save: SaveService;
  private readonly ads: AdManager;
  private state: GameSave = emptySave();
  /** Награда за последний улов — её и удваивает ролик. */
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

    await this.pixi.init({
      resizeTo: host,
      antialias: false,
      background: 0x04141a,
      resolution: Math.min(devicePixelRatio || 1, this.quality.maxResolution),
      autoDensity: true,
      powerPreference: 'high-performance',
    });
    host.appendChild(this.pixi.canvas);

    i18n.setLang(this.platform.lang());
    await this.restore();

    this.scene = new FishingScene(this.quality, {
      toast: (text) => showToast(text),
      sfx: (name) => this.audio.play(name),
      effects: () => this.progression.effects,
      onCatch: (entry, reward) => this.collect(entry, reward),
    });
    this.pixi.stage.addChild(this.scene.root);
    this.resize();

    this.ui = new GameUi(
      {
        buy: (id) => this.buy(id),
        shopToggled: (open) => {
          this.scene.paused = open;
          // Разметка геймплея: пока открыт магазин, это уже не игра.
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
      sprites: countNodes(this.pixi.stage),
      rows: this.scene.metrics,
    }));

    let lastSceneState = this.scene.state;
    this.pixi.ticker.add((ticker) => {
      if (!this.running) return;
      this.scene.update(ticker.deltaMS);

      const depth = this.scene.debugSnapshot.depth ?? 0;
      const reached = this.quests.onDepth(depth);
      if (reached) {
        this.completeQuest(reached);
        this.persist();
      }

      if (this.scene.state !== lastSceneState) {
        lastSceneState = this.scene.state;
        this.renderUi();
      }
      this.hud?.update(ticker.deltaMS);
      window.__htfu = {
        ...this.scene.debugSnapshot,
        money: this.state.money,
        upgrades: this.progression.serialize(),
        shopOpen: this.ui.isShopOpen,
        platform: this.platform.name,
        lastReward: this.lastReward,
      };
    });

    this.running = true;
    this.platform.ready();
    this.platform.gameplayStart();
    document.getElementById('boot')?.classList.add('hidden');
  }

  private async restore(): Promise<void> {
    this.state = await this.save.load();
    this.progression.restore(this.state.upgrades as Record<BranchId, number>);
    this.album.restore(this.state.album);
    this.quests.restore(this.state.quests);
  }

  /** Улов зачтён: деньги, альбом, сохранение. */
  private collect(entry: CatchEntry, reward: number): void {
    this.state.money += reward;
    this.lastReward = reward;
    this.audio.play('coin');
    if (this.album.record(entry.id)) showToast(i18n.t('toast.newSpecies'));

    const finished = this.quests.onCatch(entry);
    if (finished) this.completeQuest(finished);
    this.persist();

    // Добровольный бонус: без просмотра игрок ничего не теряет.
    if (reward > 0 && !this.platform.isTV()) {
      this.ui.offerReward(i18n.t('offer.double', { reward }), 6, () =>
        void this.doubleReward(reward),
      );
    }
  }

  private completeQuest(quest: Quest): void {
    this.state.money += quest.reward;
    this.audio.play('coin');
    showToast(
      i18n.t('quest.reward', { title: i18n.pick(quest.title), reward: quest.reward }),
    );
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

  private persist(): void {
    this.state.upgrades = this.progression.serialize();
    this.state.album = this.album.serialize();
    this.state.quests = this.quests.serialize();
    this.save.save(this.state);
    this.renderUi();
  }

  private renderUi(): void {
    this.ui.render({
      money: this.state.money,
      progression: this.progression,
      album: this.album,
      quests: this.quests,
      canShop: this.scene.state === 'idle',
    });
  }

  private resize(): void {
    this.scene.resize(this.pixi.screen.width, this.pixi.screen.height);
  }

  private bindInput(): void {
    const canvas = this.pixi.canvas;
    addEventListener('resize', () => this.resize());
    this.pixi.renderer.on('resize', () => this.resize());

    // Контекстное меню в игровой области — отдельный пункт требований площадки.
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());

    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault();
        this.scene.freeLook(event.deltaY * 0.06);
      },
      { passive: false },
    );

    let pressedAt = 0;
    let startX = 0;
    let startY = 0;
    let moved = false;
    let down = false;

    canvas.addEventListener('pointerdown', (event) => {
      // Браузеры не дают звук до первого жеста — включаем контекст здесь.
      this.audio.unlock();
      down = true;
      moved = false;
      pressedAt = performance.now();
      startX = event.clientX;
      startY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      if (!this.ui.isShopOpen) this.scene.pressStart(event.clientX, event.clientY);
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!down) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > TAP_SLOP) moved = true;
      // Руление крючком: чем дальше увёл палец, тем сильнее снос.
      this.scene.steer(dx / (this.pixi.screen.width * 0.25));
    });

    const release = (event: PointerEvent): void => {
      if (!down) return;
      down = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      this.scene.pressEnd(!moved && performance.now() - pressedAt < TAP_MS);
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    // Клавиатура нужна десктопу; стрелки и OK — ещё и пульту ТВ.
    let spaceHeld = false;
    addEventListener('keydown', (event) => {
      this.audio.unlock();
      if (event.code === 'Space' && !spaceHeld) {
        spaceHeld = true;
        this.scene.pressStart(this.pixi.screen.width * 0.26, this.pixi.screen.height * 0.42);
        event.preventDefault();
      }
      if (event.key === 'ArrowLeft') this.scene.steer(-1);
      if (event.key === 'ArrowRight') this.scene.steer(1);
      if (event.key === 'r' || event.key === 'R') this.scene.reel();
      if (event.key === 'l' || event.key === 'L') freezeMainThread(250);
    });
    addEventListener('keyup', (event) => {
      if (event.code === 'Space') {
        spaceHeld = false;
        this.scene.pressEnd(false);
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') this.scene.steer(0);
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
      this.platform.gameplayStart();
    };

    document.addEventListener('visibilitychange', () => (document.hidden ? suspend() : resume()));
    addEventListener('blur', suspend);
    addEventListener('focus', resume);

    // Уход со страницы — последний момент, когда можно дописать прогресс в облако.
    addEventListener('pagehide', () => void this.save.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) void this.save.flush();
    });
  }
}

/** Узлов в дереве сцены — грубая, но честная метрика нагрузки для спайка. */
function countNodes(node: Container): number {
  let total = 1;
  for (const child of node.children) total += countNodes(child as Container);
  return total;
}

/**
 * Искусственный фриз главного потока: проверка из ADR-0001, § 5 (день 2) —
 * леска не должна разваливаться, когда кадр приходит через четверть секунды.
 * Клавиша L.
 */
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
