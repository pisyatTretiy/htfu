import { App } from './core/App';
import { createPlatform } from './platform';
import { i18n } from './services/I18n';

/**
 * Есть ли вообще WebGL.
 *
 * Отдельная проверка нужна, чтобы отличить «браузер не умеет» от «игра
 * сломалась»: игроку в первом случае нечего чинить, и сообщение должно это
 * говорить, а не предлагать перезагрузить страницу до бесконечности.
 */
function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Экран отказа: то же окно, что и при потере контекста. */
function fail(messageKey: string, withReload: boolean): void {
  const overlay = document.getElementById('lost');
  const text = document.getElementById('lost-text');
  const button = document.getElementById('lost-reload');
  document.getElementById('boot')?.classList.add('hidden');

  if (text) text.textContent = i18n.t(messageKey);
  if (button) {
    button.textContent = i18n.t('lost.reload');
    button.hidden = !withReload;
    button.addEventListener('click', () => location.reload());
  }
  overlay?.removeAttribute('hidden');
}

async function bootstrap(): Promise<void> {
  // Язык определяем до площадки: если запуск упадёт, сообщение всё равно
  // должно быть на языке игрока.
  i18n.setLang(navigator.language);

  if (!hasWebGL()) {
    fail('boot.noWebgl', false);
    return;
  }

  const platform = await createPlatform();
  const app = new App(platform);
  await app.start();
}

bootstrap().catch((error: unknown) => {
  console.error('[boot] запуск не удался', error);
  fail('boot.failed', true);
});
