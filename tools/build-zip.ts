/**
 * Сборка архива для консоли Яндекс Игр — и заодно проверка требований площадки,
 * которые дешевле поймать здесь, чем через 3–5 дней модерации:
 *
 *  - index.html лежит в корне архива;
 *  - в именах файлов нет пробелов и кириллицы;
 *  - распакованный размер не больше 100 МБ.
 *
 * Пишем ZIP руками: нужен deflate из node:zlib и ничего больше, так что
 * скрипт работает на любой машине с Node и не тянет зависимостей.
 *
 * Запуск: npm run zip
 */
import { deflateRawSync } from 'node:zlib';
import { readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';
const OUT_DIR = 'dist-zip';
const OUT_FILE = join(OUT_DIR, 'htfu.zip');

/** Жёсткий лимит площадки. */
const PLATFORM_LIMIT = 100 * 1024 * 1024;
/** Наш бюджет из docs/04-tech-architecture.md — превышение это предупреждение, не ошибка. */
const BUDGET = 25 * 1024 * 1024;

const NAME_RE = /^[A-Za-z0-9._/-]+$/;

interface Entry {
  name: string;
  data: Buffer;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const item of readdirSync(dir)) {
    const full = join(dir, item);
    if (statSync(full).isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function dosStamp(date: Date): { time: number; date: number } {
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function zip(entries: Entry[]): Buffer {
  const stamp = dosStamp(new Date());
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const compressed = deflateRawSync(entry.data, { level: 9 });
    const crc = crc32(entry.data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    locals.push(local, compressed);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);

    offset += local.length + compressed.length;
  }

  const centralBuffer = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuffer.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, centralBuffer, end]);
}

function human(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(2)} МБ`;
}

function main(): void {
  let files: string[];
  try {
    files = walk(DIST);
  } catch {
    console.error(`✗ Каталог ${DIST}/ не найден. Сначала: npm run build`);
    process.exit(1);
  }

  const problems: string[] = [];
  const entries: Entry[] = files.map((file) => {
    const name = relative(DIST, file).split(sep).join('/');
    if (!NAME_RE.test(name)) {
      problems.push(`недопустимое имя файла (пробелы или не-латиница): ${name}`);
    }
    return { name, data: readFileSync(file) };
  });

  if (!entries.some((entry) => entry.name === 'index.html')) {
    problems.push('index.html отсутствует в корне архива');
  }

  const unpacked = entries.reduce((sum, entry) => sum + entry.data.length, 0);
  if (unpacked > PLATFORM_LIMIT) {
    problems.push(
      `распакованный размер ${human(unpacked)} превышает лимит площадки ${human(PLATFORM_LIMIT)}`,
    );
  }

  if (problems.length > 0) {
    console.error('✗ Архив не собран, требования площадки нарушены:');
    for (const problem of problems) console.error(`  · ${problem}`);
    process.exit(1);
  }

  const archive = zip(entries);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_FILE, archive);

  const largest = [...entries].sort((a, b) => b.data.length - a.data.length).slice(0, 5);

  console.log(`✓ ${OUT_FILE}`);
  console.log(`  файлов:       ${entries.length}`);
  console.log(`  распакованно: ${human(unpacked)} из ${human(PLATFORM_LIMIT)}`);
  console.log(`  архив:        ${human(archive.length)}`);
  console.log('  крупнейшие файлы:');
  for (const entry of largest) console.log(`    ${human(entry.data.length).padStart(10)}  ${entry.name}`);

  if (unpacked > BUDGET) {
    console.warn(`⚠ Бюджет билда ${human(BUDGET)} превышен — см. docs/04-tech-architecture.md, § 4.4`);
  }
}

main();
