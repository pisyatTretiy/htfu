/**
 * Прогон полного цикла ловли в реальном браузере: заброс → клёв → бой →
 * улов буянит в лодке → усмирение. Снимает кадры для журнала спайка и служит
 * дымовым тестом: любая ошибка в консоли роняет скрипт.
 *
 * Скрипт идёт по состояниям игры, а не по таймингам, — иначе кадры разъезжаются
 * с тем, что происходит на экране.
 *
 * Запуск: npm run preview (в другом терминале), затем npm run capture
 */
import { chromium, type Browser, type Page } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const URL = process.env.CAPTURE_URL ?? 'http://localhost:4173/?q=low';
const OUT = 'dist-shots';
const BROWSER_PATH = '/opt/pw-browsers/chromium';

const VIEWPORT = { width: 430, height: 760 };
/** Лодка стоит на 26 % ширины, буянящий улов прыгает над ватерлинией. */
const BOAT_X = Math.round(VIEWPORT.width * 0.26);
const WATER_Y = Math.round(VIEWPORT.height * 0.42);

interface Snapshot {
  state: string;
  tension: number;
  stamina: number;
  patience: number;
  money: number;
  onHook: string;
  upgrades?: Record<string, number>;
  shopOpen?: boolean;
  zone?: string;
  trophies?: number;
  platform?: string;
  lastReward?: number;
  onboarding?: number;
}

const EMPTY: Snapshot = {
  state: '',
  tension: 0,
  stamina: 1,
  patience: 1,
  money: 0,
  onHook: '',
};

/** Читаем состояние игры напрямую, а не парсим HUD: он обновляется раз в 0.5 с. */
async function snapshot(page: Page): Promise<Snapshot> {
  const raw = await page.evaluate(() => window.__htfu);
  return raw ? { ...EMPTY, ...raw } : EMPTY;
}

async function readState(page: Page): Promise<string> {
  return (await snapshot(page)).state;
}

async function waitForState(page: Page, wanted: string[], timeoutMs = 12000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await readState(page);
    if (wanted.includes(state)) return state;
    await page.waitForTimeout(120);
  }
  throw new Error(`Не дождались состояния ${wanted.join('|')} за ${timeoutMs} мс`);
}

/**
 * Играем как вменяемый игрок: тянем, пока натяжение низкое, и отпускаем на
 * подходе к обрыву. Если бой невозможно выиграть таким ритмом — тест это
 * покажет: он вернёт snapped, а не landed.
 */
const HOLD_UNTIL = 0.62;
const RELEASE_UNTIL = 0.24;

async function fightOnce(page: Page): Promise<string> {
  let reeling = false;
  const deadline = Date.now() + 25000;

  while (Date.now() < deadline) {
    const { state, tension } = await snapshot(page);
    if (state !== 'fighting') {
      if (reeling) await page.keyboard.up('Space');
      return state;
    }
    if (!reeling && tension < RELEASE_UNTIL) {
      await page.keyboard.down('Space');
      reeling = true;
    } else if (reeling && tension > HOLD_UNTIL) {
      await page.keyboard.up('Space');
      reeling = false;
    }
    await page.waitForTimeout(40);
  }
  if (reeling) await page.keyboard.up('Space');
  return readState(page);
}

/** Улов буянит: тапаем по всей площади лодки — он прыгает, с первого раза не попасть. */
async function subdue(page: Page): Promise<void> {
  for (let i = 0; i < 16; i++) {
    await page.mouse.click(BOAT_X + ((i % 5) - 2) * 22, WATER_Y - 14 - (i % 5) * 20);
    await page.waitForTimeout(70);
  }
  await page.waitForTimeout(400);
}

async function cast(page: Page): Promise<void> {
  await page.keyboard.down('Space');
  await page.waitForTimeout(420);
  await page.keyboard.up('Space');
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  const browser: Browser = await chromium.launch({
    ...(existsSync(BROWSER_PATH) ? { executablePath: BROWSER_PATH } : {}),
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  // Основная аудитория площадки — русская, поэтому и кадры снимаем на русском.
  const page = await browser.newPage({ viewport: VIEWPORT, locale: 'ru-RU' });

  // Подкладываем сейв со стартовыми деньгами: иначе до первой покупки пришлось
  // бы наловить рыбы на 90 ₽, и прогон растянулся бы на минуты.
  await page.addInitScript(() => {
    // Только если сейва ещё нет: после reload проверяем, что покупка сохранилась.
    if (!localStorage.getItem('htfu.save')) {
      localStorage.setItem(
        'htfu.save',
        // Босс причала уже «созрел»: следующий клёв будет им. Иначе на
        // прогон пришлось бы наловить четыре улова только ради боя.
        JSON.stringify({
          version: 4,
          updatedAt: Date.now(),
          money: 400,
          upgrades: {},
          // Часть альбома уже собрана: так на кадре видно и слоты вариантов,
          // и ненулевой бонус за заполнение.
          album: {
            perch: { common: 4, rare: 1, gold: 1 },
            crab: { common: 2, rare: 1 },
            boot: { common: 3 },
            kettle: { common: 1 },
          },
          quests: { index: 2, progress: 0 },
          zone: 'dock',
          bosses: { trophies: [], catches: { dock: 4 } },
        }),
      );
    }
  });

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  // --- новичок: обучение ведёт одной строкой ---
  // Отдельная вкладка: у неё своё localStorage, поэтому игра считает её
  // первым запуском и показывает обучение с нулевого шага.
  const rookie = await browser.newPage({ viewport: VIEWPORT, locale: 'ru-RU' });
  rookie.on('pageerror', (error) => errors.push(String(error)));
  rookie.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await rookie.goto(URL, { waitUntil: 'networkidle' });
  await rookie.waitForTimeout(900);

  // HUD разработчика закрывает верх кадра — для журнала он не нужен.
  await rookie.keyboard.press('KeyH');
  const hint = rookie.locator('#ui-hint');
  await hint.waitFor({ state: 'visible', timeout: 8000 });
  const castHint = (await hint.innerText()).trim();
  if (!castHint) throw new Error('Первая подсказка обучения пуста');
  await rookie.screenshot({ path: `${OUT}/0-onboarding.png` });

  await cast(rookie);
  await waitForState(rookie, ['sinking', 'fighting'], 15000);
  await rookie.waitForTimeout(300);
  const afterCast = await snapshot(rookie);
  if ((afterCast.onboarding ?? 0) < 1) {
    throw new Error(`Заброс не закрыл первый шаг обучения: ${afterCast.onboarding}`);
  }
  const nextHint = (await hint.innerText()).trim();
  if (nextHint === castHint) {
    throw new Error(`Подсказка не сменилась после заброса: «${castHint}»`);
  }
  await rookie.screenshot({ path: `${OUT}/0b-onboarding-next.png` });
  console.log(`Обучение: «${castHint}» → «${nextHint}»`);
  await rookie.close();

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  // HUD — DOM поверх канваса: он закрывает лодку и перехватывает клики,
  // поэтому сюжетные кадры снимаем без него, а метрики — отдельным кадром.
  await page.keyboard.press('KeyH');
  await page.screenshot({ path: `${OUT}/1-idle.png` });

  await cast(page);
  await page.waitForTimeout(260);
  await page.screenshot({ path: `${OUT}/2-flying.png` });

  await waitForState(page, ['sinking']);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/3-splash.png` });

  await waitForState(page, ['fighting']);
  await page.screenshot({ path: `${OUT}/4-bite.png` });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/5-fighting.png` });

  // Первый бой — босс локации: он должен закончиться трофеем.
  const bossResult = await fightOnce(page);
  // Показ улова на леске длится полторы секунды — ждём, пока он закончится.
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${OUT}/5b-boss.png` });
  const afterBoss = await snapshot(page);
  if ((afterBoss.trophies ?? 0) < 1) {
    throw new Error(`Босс не побеждён (состояние ${bossResult}), трофеев ${afterBoss.trophies}`);
  }
  console.log(`Босс повержен, трофеев: ${afterBoss.trophies}`);

  // Ловим, пока не вытащим что-нибудь буянящее: мусор не буянит, это норма.
  let landed = await readState(page);
  const deadline = Date.now() + 90000;
  while (landed !== 'onboard' && Date.now() < deadline) {
    const state = await readState(page);
    if (state === 'onboard') {
      landed = 'onboard';
    } else if (state === 'fighting') {
      landed = await fightOnce(page);
    } else if (state === 'idle') {
      await cast(page);
      await page.waitForTimeout(400);
    } else {
      // Полёт, погружение, подмотка — просто ждём, пока цикл довернётся.
      await page.waitForTimeout(300);
    }
  }

  if (landed === 'onboard') {
    await page.screenshot({ path: `${OUT}/6-onboard.png` });
    await page.waitForTimeout(900);
    await page.screenshot({ path: `${OUT}/7-mischief.png` });
    await subdue(page);
    await page.screenshot({ path: `${OUT}/8-subdued.png` });
  } else {
    console.warn(`⚠ За 6 попыток буянящий улов не попался, последнее состояние: ${landed}`);
  }

  await page.keyboard.press('KeyL');
  await page.waitForTimeout(500);

  // Ещё один заброс: предложение «Удвоить» появляется только после улова,
  // а после возни в лодке никто не забрасывает сам.
  await waitForState(page, ['idle'], 30000).catch(() => undefined);
  if ((await readState(page)) === 'idle') {
    await cast(page);
    await waitForState(page, ['fighting'], 20000).catch(() => undefined);
    if ((await readState(page)) === 'fighting') await fightOnce(page);
  }

  // --- rewarded: добровольный бонус за просмотр ---
  // Ловим до первой награды и проверяем, что кнопка «Удвоить» появляется и
  // деньги после неё растут ровно на величину награды.
  const offer = page.locator('#ui-offer');
  // Кнопка живёт шесть секунд после улова, поэтому не ждём её, а ловим дальше,
  // пока она не появится: иначе проверка зависит от того, повезло ли с боем.
  const offerDeadline = Date.now() + 120000;
  while (!(await offer.isVisible()) && Date.now() < offerDeadline) {
    const state = await readState(page);
    if (state === 'idle') {
      await cast(page);
      await page.waitForTimeout(400);
    } else if (state === 'fighting') {
      await fightOnce(page);
    } else if (state === 'onboard') {
      await subdue(page);
    } else {
      await page.waitForTimeout(250);
    }
  }
  if (await offer.isVisible()) {
    await page.screenshot({ path: `${OUT}/8-offer.png` });
    // Снимок берём в момент показа кнопки: до него lastReward — от прошлого улова.
    const atOffer = await snapshot(page);
    const reward = atOffer.lastReward ?? 0;
    const moneyBefore = atOffer.money;
    await offer.click();
    await page.waitForTimeout(700);
    const moneyAfter = (await snapshot(page)).money;
    if (reward > 0 && moneyAfter < moneyBefore + reward) {
      throw new Error(
        `Награда за ролик не начислена: ${moneyBefore} → ${moneyAfter}, обещали +${reward}`,
      );
    }
  } else {
    console.warn('⚠ Кнопка «Удвоить» не появилась за отведённое время');
  }

  // --- обрыв лески и вторая попытка за ролик ---
  // Тянем без остановки: это верный способ порвать леску, а заодно проверка,
  // что постоянная подмотка проигрывает — на ней держится весь бой. Мелкая
  // рыба иногда сдаётся раньше, чем рвётся леска, поэтому пробуем несколько раз.
  const retryOffer = page.locator('#ui-offer');
  let snapped = false;
  for (let attempt = 0; attempt < 5 && !snapped; attempt++) {
    await waitForState(page, ['idle'], 30000).catch(() => undefined);
    if ((await readState(page)) !== 'idle') break;

    await cast(page);
    const bit = await waitForState(page, ['fighting', 'idle'], 20000).catch(() => 'idle');
    if (bit !== 'fighting') continue;

    await page.keyboard.down('Space');
    await waitForState(page, ['reeling', 'showcase', 'onboard', 'idle'], 40000).catch(
      () => undefined,
    );
    await page.keyboard.up('Space');
    await page.waitForTimeout(200);

    const label = (await retryOffer.isVisible()) ? (await retryOffer.innerText()).trim() : '';
    if (!label.startsWith('Вторая попытка')) {
      if ((await readState(page)) === 'onboard') await subdue(page);
      continue;
    }

    snapped = true;
    await page.screenshot({ path: `${OUT}/8e-retry.png` });
    await retryOffer.click();
    await page.waitForTimeout(1200);
    const back = await readState(page);
    if (back !== 'fighting') {
      throw new Error(`Вторая попытка не вернула рыбу на крючок: ${back}`);
    }
    console.log('Вторая попытка: рыба вернулась на крючок');
    await fightOnce(page);
    if ((await readState(page)) === 'onboard') await subdue(page);
  }
  if (!snapped) console.warn('⚠ За пять попыток леска не порвалась — второй попытки не видели');

  // --- магазин: покупка и то, что она переживает перезагрузку ---
  const beforeShop = await snapshot(page);
  await waitForState(page, ['idle'], 30000);
  // --- карта: переезд в другую локацию перекрашивает сцену ---
  await waitForState(page, ['idle'], 30000);
  await page.click('#ui-map-open');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/8a-map.png` });

  const travel = page.locator('#ui-map-list .go').first();
  if (await travel.count()) {
    await travel.click();
    await page.waitForTimeout(1600);
    const moved = await snapshot(page);
    if (moved.zone === 'dock') {
      throw new Error(`Переезд не сработал, локация осталась ${moved.zone}`);
    }
    await page.screenshot({ path: `${OUT}/8b-zone.png` });
    console.log(`Переехали в локацию: ${moved.zone}`);
  } else {
    console.warn('⚠ Ни одна локация не открыта — переезд не проверен');
  }

  // Свободный осмотр вниз: проверяем, как выглядит глубина под отмелью.
  await waitForState(page, ['idle'], 30000);
  await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
  await page.mouse.wheel(0, 2600);
  await page.waitForTimeout(1400);
  await page.screenshot({ path: `${OUT}/8c-deep.png` });
  await page.mouse.wheel(0, -2600);
  await page.waitForTimeout(1200);

  // Дела на сегодня: панель открывается по строке задания сверху.
  await page.click('#ui-quest');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/8d-tasks.png` });
  const tasksText = await page.locator('#ui-tasks-list').innerText();
  if (!/\d/.test(tasksText)) throw new Error('Панель дел пуста');
  await page.click('#ui-tasks-close');
  await page.waitForTimeout(200);

  // Альбом: пойманные виды раскрыты, остальные скрыты за «???».
  await page.click('#ui-album-open');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/9-album.png` });
  const albumText = await page.locator('#ui-album-list').innerText();
  if (!albumText.includes('???')) {
    throw new Error('В альбоме нет ни одного нераскрытого вида — что-то не так');
  }
  await page.click('#ui-album-close');
  await page.waitForTimeout(200);

  await page.click('#ui-shop-open');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/10-shop.png` });

  // --- приманка: добровольный бонус за ролик, а не покупка ---
  await page.click('#ui-lure-buy');
  await page.waitForTimeout(900);
  const lure = page.locator('#ui-lure');
  if (!(await lure.isVisible())) throw new Error('Часы приманки не появились после ролика');
  const lureText = (await lure.innerText()).trim();
  if (!/\d:\d\d/.test(lureText)) throw new Error(`Часы приманки без времени: «${lureText}»`);
  console.log(`Приманка включена: ${lureText}`);

  await page.click('#ui-shop-list .branch:first-child .buy');
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/11-bought.png` });
  const afterBuy = await snapshot(page);

  if ((afterBuy.upgrades?.line ?? 0) !== 1) {
    throw new Error(`Покупка не применилась: ${JSON.stringify(afterBuy.upgrades)}`);
  }
  if (afterBuy.money >= beforeShop.money) {
    throw new Error(`Деньги не списались: было ${beforeShop.money}, стало ${afterBuy.money}`);
  }

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const afterReload = await snapshot(page);
  if ((afterReload.upgrades?.line ?? 0) !== 1) {
    throw new Error(`Прогресс не пережил перезагрузку: ${JSON.stringify(afterReload.upgrades)}`);
  }

  // Задания: цепочка должна была сдвинуться хотя бы на одно за прогон.
  const questText = await page.locator('#ui-quest').innerText();
  if (questText.trim().length === 0) {
    throw new Error('Панель заданий пуста');
  }
  console.log(`Задание на экране: ${questText.replace(/\s+/g, ' ').trim()}`);

  await page.keyboard.press('KeyH');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/13-hud.png` });

  console.log(
    `Итог: кошелёк ${afterReload.money} ₽, леска ур. ${afterReload.upgrades?.line ?? 0}, ` +
      'прогресс пережил перезагрузку',
  );

  // Проверка локализации: язык площадка отдаёт сама, и на английском интерфейс
  // должен быть переведён целиком — это требование модерации.
  const english = await browser.newPage({ viewport: VIEWPORT, locale: 'en-US' });
  await english.goto(URL, { waitUntil: 'networkidle' });
  await english.waitForTimeout(1200);
  await english.click('#ui-shop-open');
  await english.waitForTimeout(300);
  await english.screenshot({ path: `${OUT}/14-shop-en.png` });
  await english.click('#ui-shop-close');
  await english.click('#ui-album-open');
  await english.waitForTimeout(250);
  await english.screenshot({ path: `${OUT}/15-album-en.png` });
  const englishText = await english.evaluate(
    () => document.getElementById('ui')?.textContent ?? '',
  );
  if (/[А-Яа-я]/.test(englishText)) {
    throw new Error(`В английском интерфейсе осталась кириллица: ${englishText}`);
  }
  await english.close();

  await browser.close();

  if (errors.length > 0) {
    console.error('✗ Ошибки в консоли браузера:');
    for (const error of errors) console.error(`  · ${error}`);
    process.exit(1);
  }
  console.log('✓ Полный цикл, магазин и сохранение пройдены, ошибок в консоли нет');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
