/**
 * Снимает серию кадров заброса для журнала спайка — и заодно проверяет, что
 * сцена не падает: любая ошибка в консоли браузера роняет скрипт.
 *
 * Запуск: npm run preview (в другом терминале), затем npm run capture
 */
import { chromium, type Browser } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';

const URL = process.env.CAPTURE_URL ?? 'http://localhost:4173/?q=low';
const OUT = 'dist-shots';
const BROWSER_PATH = '/opt/pw-browsers/chromium';

interface Shot {
  name: string;
  /** Задержка перед снимком, мс. */
  wait: number;
  action?: 'chargeStart' | 'chargeEnd' | 'freeze' | 'reel';
}

const SCRIPT: Shot[] = [
  { name: '1-idle', wait: 900 },
  { name: '2-charging', wait: 420, action: 'chargeStart' },
  { name: '3-flying', wait: 260, action: 'chargeEnd' },
  { name: '4-splash', wait: 700 },
  { name: '5-sinking', wait: 2200 },
  { name: '6-after-freeze', wait: 500, action: 'freeze' },
  { name: '7-reeling', wait: 400, action: 'reel' },
];

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });

  const browser: Browser = await chromium.launch({
    ...(existsSync(BROWSER_PATH) ? { executablePath: BROWSER_PATH } : {}),
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 430, height: 760 } });

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle' });

  for (const shot of SCRIPT) {
    if (shot.action === 'chargeStart') await page.keyboard.down('Space');
    if (shot.action === 'chargeEnd') await page.keyboard.up('Space');
    if (shot.action === 'freeze') await page.keyboard.press('KeyL');
    if (shot.action === 'reel') await page.keyboard.press('KeyR');
    await page.waitForTimeout(shot.wait);
    await page.screenshot({ path: `${OUT}/${shot.name}.png` });
    console.log(`✓ ${OUT}/${shot.name}.png`);
  }

  const state = await page.evaluate(() => document.getElementById('hud')?.textContent ?? '');
  console.log(`HUD: ${state.replace(/\s+/g, ' ').trim()}`);

  await browser.close();

  if (errors.length > 0) {
    console.error('✗ Ошибки в консоли браузера:');
    for (const error of errors) console.error(`  · ${error}`);
    process.exit(1);
  }
  console.log('✓ Ошибок в консоли нет');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
