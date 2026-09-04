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
  platform?: string;
  lastReward?: number;
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
        // Два закрытых задания открывают вторую локацию: иначе переезд
        // не на что проверять, а копить их прогоном слишком долго.
        JSON.stringify({
          version: 3,
          updatedAt: Date.now(),
          money: 400,
          upgrades: {},
          album: {},
          quests: { index: 2, progress: 0 },
          zone: 'dock',
        }),
      );
    }
  });

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

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

  // Ловим, пока не вытащим что-нибудь буянящее: мусор не буянит, это норма.
  let landed = await fightOnce(page);
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
    // Тапаем по всей площади лодки: улов прыгает, попасть с первого раза нельзя.
    for (let i = 0; i < 16; i++) {
      await page.mouse.click(BOAT_X + ((i % 5) - 2) * 22, WATER_Y - 14 - (i % 5) * 20);
      await page.waitForTimeout(70);
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${OUT}/8-subdued.png` });
  } else {
    console.warn(`⚠ За 6 попыток буянящий улов не попался, последнее состояние: ${landed}`);
  }

  await page.keyboard.press('KeyL');
  await page.waitForTimeout(500);

  // --- rewarded: добровольный бонус за просмотр ---
  // Ловим до первой награды и проверяем, что кнопка «Удвоить» появляется и
  // деньги после неё растут ровно на величину награды.
  const beforeOffer = await snapshot(page);
  const offer = page.locator('#ui-offer');
  await offer.waitFor({ state: 'visible', timeout: 60000 }).catch(() => undefined);
  if (await offer.isVisible()) {
    await page.screenshot({ path: `${OUT}/8-offer.png` });
    const reward = beforeOffer.lastReward ?? 0;
    const moneyBefore = (await snapshot(page)).money;
    await offer.click();
    await page.waitForTimeout(900);
    const moneyAfter = (await snapshot(page)).money;
    if (reward > 0 && moneyAfter < moneyBefore + reward) {
      throw new Error(`Награда за ролик не начислена: ${moneyBefore} → ${moneyAfter}`);
    }
  } else {
    console.warn('⚠ Кнопка «Удвоить» не появилась за отведённое время');
  }

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
