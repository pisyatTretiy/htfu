/**
 * Один кадр из игры в файл.
 *
 * Полный прогон бота (tools/capture.ts) идёт три минуты и снимает два десятка
 * кадров: для работы над картинкой это слишком долго. Здесь — открыть, дать
 * сцене устояться, снять, закрыть.
 *
 * Запуск: npm run preview (в другом терминале), затем
 *   npm run shot -- dist-shots/proba.png [мс ожидания] [#кнопка-которую-нажать]
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const URL = process.env.CAPTURE_URL ?? 'http://localhost:4173/?q=low';
const BROWSER_PATH = '/opt/pw-browsers/chromium';

const out = process.argv[2] ?? 'dist-shots/shot.png';
const settleMs = Number(process.argv[3] ?? 1500);
/** Что нажать перед кадром: так снимаются панели, а не только сцена. */
const click = process.argv[4];
mkdirSync(dirname(out), { recursive: true });

const browser = await chromium.launch({
  ...(existsSync(BROWSER_PATH) ? { executablePath: BROWSER_PATH } : {}),
  args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 430, height: 760 }, locale: 'ru-RU' });

const errors: string[] = [];
page.on('pageerror', (error) => errors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(settleMs);
// HUD разработчика закрывает верхнюю треть кадра — для картинки он лишний.
await page.keyboard.press('KeyH');
if (click) {
  await page.click(click);
  await page.waitForTimeout(400);
}
await page.screenshot({ path: out });
await browser.close();

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Кадр снят: ${out}`);
