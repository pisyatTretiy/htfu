/**
 * Отрисовка промо-материалов в PNG.
 *
 * Точные размеры площадка публикует не в документации, а в форме черновика
 * консоли разработчика, поэтому они здесь параметры, а не константы:
 *   npm run promo                       — 512×512 иконка и 800×470 обложка
 *   npm run promo -- 1024 1024 1920 1080
 *
 * Скриншоты игры для карточки снимает npm run capture: там реальный геймплей,
 * а он для скриншотов как раз обязателен (docs/02, § 2.5).
 */
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { coverSvg, iconSvg } from './promo/art';

const OUT = 'dist-promo';
const BROWSER_PATH = '/opt/pw-browsers/chromium';

const [iconSize = 512, coverWidth = 800, coverHeight = 470] = process.argv
  .slice(2)
  .map((value) => Number(value))
  .filter((value) => Number.isFinite(value) && value > 0);

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  ...(existsSync(BROWSER_PATH) ? { executablePath: BROWSER_PATH } : {}),
  args: ['--no-sandbox'],
});

async function render(svg: string, width: number, height: number, file: string): Promise<void> {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.setContent(
    `<style>html,body{margin:0;padding:0;overflow:hidden}svg{display:block}</style>${svg}`,
  );
  await page.screenshot({ path: `${OUT}/${file}` });
  await page.close();
  console.log(`  ${file} — ${width}×${height}`);
}

await render(iconSvg(iconSize), iconSize, iconSize, 'icon.png');
await render(coverSvg(coverWidth, coverHeight), coverWidth, coverHeight, 'cover.png');

// Исходники вектором: пересобрать под любой размер можно без браузера.
writeFileSync(`${OUT}/icon.svg`, iconSvg(iconSize), 'utf8');
writeFileSync(`${OUT}/cover.svg`, coverSvg(coverWidth, coverHeight), 'utf8');

await browser.close();
console.log(`\nГотово: ${OUT}/. Размеры уточнить в форме черновика консоли.`);
